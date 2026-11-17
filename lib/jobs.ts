import "server-only";
import * as Sentry from "@sentry/nextjs";
import { gzipSync } from "node:zlib";
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, max, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  automationRules,
  comments,
  jobMarks,
  memberships,
  membershipTeamRoles,
  notifications,
  organizations,
  phaseApprovals,
  projectPhases,
  projects,
  ticketStatuses,
  tickets,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { announce, deliverEmails, notify } from "@/lib/notify";
import { putObject } from "@/lib/storage";
import { businessMinutesBetween, loadSchedule } from "@/lib/business-hours";
import { advancePhaseIfDone } from "@/lib/tickets";
import { purgeExpired } from "@/lib/trash";

const DAY = 86_400_000;
type Org = typeof organizations.$inferSelect;
type Counts = Record<string, number>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * True if the job should act on this entity now, and records that it did.
 * Fires again when `mark` changes, or after `everyMs` (for repeating reminders).
 */
async function markOnce(orgId: string, job: string, entityId: string, mark = "", everyMs?: number) {
  const [prev] = await db.select().from(jobMarks).where(and(eq(jobMarks.job, job), eq(jobMarks.entityId, entityId)));
  if (prev && prev.mark === mark && (!everyMs || prev.lastAt.getTime() > Date.now() - everyMs)) return false;
  await db
    .insert(jobMarks)
    .values({ orgId, job, entityId, mark, lastAt: new Date() })
    .onConflictDoUpdate({ target: [jobMarks.job, jobMarks.entityId], set: { mark, lastAt: new Date() } });
  return true;
}

async function managers(orgId: string) {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, "active"), inArray(memberships.role, ["admin", "manager"])));
  return rows.map((r) => r.userId);
}

async function leadsOf(teamRoleId: string | null) {
  if (!teamRoleId) return [];
  const rows = await db
    .select({ userId: memberships.userId })
    .from(membershipTeamRoles)
    .innerJoin(memberships, eq(memberships.id, membershipTeamRoles.membershipId))
    .where(and(eq(membershipTeamRoles.teamRoleId, teamRoleId), eq(membershipTeamRoles.isLead, true), eq(memberships.status, "active")));
  return rows.map((r) => r.userId);
}

async function userOfMembership(membershipId: string | null) {
  if (!membershipId) return null;
  const [m] = await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.id, membershipId));
  return m?.userId ?? null;
}

async function rule(orgId: string, kind: "approval_reminder" | "auto_close_waiting" | "escalate_overdue") {
  const [r] = await db.select().from(automationRules).where(and(eq(automationRules.orgId, orgId), eq(automationRules.kind, kind)));
  return r?.isActive ? r : null;
}

const fmtIn = (org: Org) => new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: org.timezone });

/** Open tickets (not done/cancelled, not deleted) with their status info. */
function openTickets(orgId: string, ...where: Parameters<typeof and>) {
  return db
    .select({ t: tickets, category: ticketStatuses.category, pauses: ticketStatuses.pausesResponseClock })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(and(eq(tickets.orgId, orgId), isNull(tickets.deletedAt), notInArray(ticketStatuses.category, ["done", "cancelled"]), ...where));
}

// ---------------------------------------------------------------------------
// Hourly
// ---------------------------------------------------------------------------

/** Warns the assignee with one business hour left on a response target, and escalates when it's missed. */
async function responseTargets(org: Org): Promise<Counts> {
  // Look a few days ahead (weekends/holidays), then measure what's left in business hours
  const horizon = new Date(Date.now() + 5 * 86_400_000);
  const schedule = await loadSchedule(org.id);
  const candidates = await openTickets(org.id, isNotNull(tickets.responseDueAt), isNull(tickets.firstResponseAt), lte(tickets.responseDueAt, horizon));
  const rows: typeof candidates = [];
  for (const r of candidates) {
    const due = r.t.responseDueAt!;
    if (due.getTime() <= Date.now() || (await businessMinutesBetween(org.id, new Date(), due, schedule)) <= 60) rows.push(r);
  }
  const fmt = fmtIn(org);
  let warned = 0;
  let breached = 0;
  for (const { t, pauses } of rows) {
    if (pauses) continue; // e.g. "Waiting on client" stops the clock
    const due = t.responseDueAt!;
    const url = `/tickets/${t.key}`;
    const assignee = await userOfMembership(t.assigneeMembershipId);
    if (due.getTime() > Date.now()) {
      if (!(await markOnce(org.id, "response_soon", t.id, due.toISOString()))) continue;
      await notify(db, { orgId: org.id, userIds: [assignee], eventKey: "ticket.response_due", title: `${t.key} needs a reply by ${fmt.format(due)}`, body: t.title, url, ticketId: t.id });
      warned++;
    } else {
      if (!(await markOnce(org.id, "response_breached", t.id, due.toISOString()))) continue;
      const title = `${t.key} missed its response target`;
      await notify(db, { orgId: org.id, userIds: [assignee, ...(await leadsOf(t.teamRoleId)), ...(await managers(org.id))], eventKey: "ticket.response_due", title, body: t.title, url, ticketId: t.id });
      announce(org.id, "ticket.response_breached", { title, body: t.title, url });
      breached++;
    }
  }
  return { warned, breached };
}

/** Tickets overdue by the rule's days: assignee, their team lead(s) and managers hear about it once per due date. */
async function escalateOverdue(org: Org): Promise<Counts> {
  const r = await rule(org.id, "escalate_overdue");
  if (!r) return {};
  const rows = await openTickets(org.id, isNotNull(tickets.dueAt), lt(tickets.dueAt, new Date(Date.now() - r.afterDays * DAY)));
  let escalated = 0;
  for (const { t } of rows) {
    if (!(await markOnce(org.id, "escalate_overdue", t.id, t.dueAt!.toISOString()))) continue;
    const days = Math.floor((Date.now() - t.dueAt!.getTime()) / DAY);
    await notify(db, {
      orgId: org.id,
      userIds: [await userOfMembership(t.assigneeMembershipId), ...(await leadsOf(t.teamRoleId)), ...(await managers(org.id))],
      eventKey: "ticket.overdue",
      title: `${t.key} is ${days} day${days === 1 ? "" : "s"} overdue`,
      body: t.title,
      url: `/tickets/${t.key}`,
      ticketId: t.id,
    });
    escalated++;
  }
  return { escalated };
}

/** Phases waiting for sign-off longer than the rule's days: remind managers, then again every N days. */
async function approvalReminders(org: Org): Promise<Counts> {
  const r = await rule(org.id, "approval_reminder");
  if (!r) return {};
  const waiting = await db
    .select({ ph: projectPhases, projectKey: projects.key, projectName: projects.name })
    .from(projectPhases)
    .innerJoin(projects, eq(projects.id, projectPhases.projectId))
    .where(and(eq(projectPhases.orgId, org.id), eq(projectPhases.status, "awaiting_approval"), isNull(projects.deletedAt)));
  let reminded = 0;
  for (const { ph, projectKey, projectName } of waiting) {
    const round = ph.revisionRoundsUsed + 1;
    const pending = await db
      .select()
      .from(phaseApprovals)
      .where(and(eq(phaseApprovals.projectPhaseId, ph.id), eq(phaseApprovals.roundNumber, round), eq(phaseApprovals.decision, "pending")));
    const oldest = pending.reduce<Date | null>((a, p) => (!a || p.createdAt < a ? p.createdAt : a), null);
    if (!oldest || oldest.getTime() > Date.now() - r.afterDays * DAY) continue;
    if (!(await markOnce(org.id, "approval_reminder", ph.id, String(round), r.afterDays * DAY))) continue;
    const days = Math.floor((Date.now() - oldest.getTime()) / DAY);
    const who = pending.map((p) => p.approverKind).join(" and ");
    await notify(db, {
      orgId: org.id,
      userIds: await managers(org.id),
      eventKey: "phase.reminder",
      title: `${projectKey}: P${ph.position} ${ph.name} has waited ${days} days for sign-off`,
      body: `${projectName} · waiting on ${who}`,
      url: `/projects/${ph.projectId}`,
    });
    reminded++;
  }
  return { reminded };
}

/** Emails still pending after 10 minutes (e.g. the server stopped before sending). */
async function emailRetry(org: Org): Promise<Counts> {
  const stuck = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.orgId, org.id), eq(notifications.emailStatus, "pending"), lt(notifications.createdAt, new Date(Date.now() - 10 * 60_000))))
    .limit(200);
  await deliverEmails(stuck.map((s) => s.id));
  return { emailsRetried: stuck.length };
}

// ---------------------------------------------------------------------------
// Nightly
// ---------------------------------------------------------------------------

/** Tickets in a "waiting" status with no activity for the rule's days get closed. */
async function autoClose(org: Org): Promise<Counts> {
  const r = await rule(org.id, "auto_close_waiting");
  if (!r) return {};
  const [done] = await db
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, org.id), eq(ticketStatuses.category, "done"), eq(ticketStatuses.isActive, true)))
    .orderBy(asc(ticketStatuses.sortOrder))
    .limit(1);
  if (!done) return {};
  const cutoff = new Date(Date.now() - r.afterDays * DAY);
  const rows = await openTickets(org.id, eq(ticketStatuses.category, "waiting"), lt(tickets.updatedAt, cutoff));
  let closed = 0;
  for (const { t } of rows) {
    const [last] = await db.select({ at: max(comments.createdAt) }).from(comments).where(and(eq(comments.ticketId, t.id), isNull(comments.deletedAt)));
    if (last?.at && last.at > cutoff) continue; // someone commented recently
    const note = `Closed automatically: waiting with no activity for ${r.afterDays} days. Reopen it by changing the status.`;
    await db.transaction(async (tx) => {
      await tx.update(tickets).set({ statusId: done.id, resolvedAt: new Date(), closedAt: new Date() }).where(eq(tickets.id, t.id));
      await tx.insert(comments).values({ orgId: org.id, ticketId: t.id, authorUserId: null, body: note, visibility: "internal" });
      if (t.projectPhaseId) await advancePhaseIfDone(tx, t.projectPhaseId);
    });
    await audit({ orgId: org.id, actorKind: "system", action: "ticket.auto_close", entityType: "ticket", entityId: t.id, entityKey: t.key, changes: { after: { status: done.name } }, metadata: { afterDays: r.afterDays } });
    await notify(db, {
      orgId: org.id,
      userIds: [await userOfMembership(t.assigneeMembershipId), t.reporterUserId],
      eventKey: "ticket.auto_closed",
      title: `${t.key} was closed automatically`,
      body: t.title,
      url: `/tickets/${t.key}`,
      ticketId: t.id,
    });
    closed++;
  }
  return { closed };
}

/** Completed projects older than the org's archive setting (default 12 months) are archived. Nothing is deleted. */
async function archiveProjects(org: Org): Promise<Counts> {
  const months = org.settings.archiveClosedProjectsAfterMonths ?? 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const old = await db
    .select({ id: projects.id, key: projects.key })
    .from(projects)
    .where(and(eq(projects.orgId, org.id), eq(projects.status, "completed"), isNull(projects.deletedAt), lt(projects.completedAt, cutoff)));
  for (const p of old) {
    await db.update(projects).set({ status: "archived", archivedAt: new Date() }).where(eq(projects.id, p.id));
    await audit({ orgId: org.id, actorKind: "system", action: "project.archive", entityType: "project", entityId: p.id, entityKey: p.key, metadata: { afterMonths: months } });
  }
  return { archivedProjects: old.length };
}

async function trashPurge(org: Org): Promise<Counts> {
  return { purged: await purgeExpired(org.id) };
}

/**
 * Copies audit entries older than the org's auditHotDays (default 90) to R2 as gzipped
 * JSON lines, then removes them from the database. Copy first, so nothing is lost.
 * Stops after ~8 seconds; the next night continues where it left off.
 */
export async function archiveAudit(orgId: string | null, folder: string, hotDays: number, deadline: number): Promise<number> {
  const cutoff = new Date(Date.now() - Math.max(31, hotDays) * DAY); // the database refuses anything newer than 30 days
  let moved = 0;
  while (Date.now() < deadline) {
    const batch = await db
      .select()
      .from(auditLog)
      .where(and(orgId ? eq(auditLog.orgId, orgId) : isNull(auditLog.orgId), lt(auditLog.createdAt, cutoff)))
      .orderBy(asc(auditLog.createdAt))
      .limit(2000);
    if (batch.length === 0) break;
    const first = batch[0].createdAt.toISOString();
    const key = `${folder}/_audit/${first.slice(0, 4)}/${first.slice(5, 7)}/${first.slice(0, 10)}_${batch[0].id.slice(0, 8)}.jsonl.gz`;
    await putObject(key, gzipSync(batch.map((row) => JSON.stringify(row)).join("\n")), "application/x-ndjson", "gzip");
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL app.audit_archiving = 'on'`);
      await tx.delete(auditLog).where(inArray(auditLog.id, batch.map((b) => b.id)));
    });
    moved += batch.length;
    if (batch.length < 2000) break;
  }
  return moved;
}

async function auditArchive(org: Org, deadline: number): Promise<Counts> {
  return { archived: await archiveAudit(org.id, org.keyPrefix.toLowerCase(), org.settings.auditHotDays ?? 90, deadline) };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export const JOBS = {
  hourly: { responseTargets, escalateOverdue, approvalReminders, emailRetry },
  nightly: { autoClose, archiveProjects, trashPurge, auditArchive },
} as const;
export type Schedule = keyof typeof JOBS;

// Sentry cron monitors alert you if a schedule stops running (e.g. a broken deploy).
const MONITORS: Record<Schedule, string> = { hourly: "0 * * * *", nightly: "15 8 * * *" };

export function runSchedule(schedule: Schedule) {
  return Sentry.withMonitor(`portal-jobs-${schedule}`, () => runJobs(schedule), {
    schedule: { type: "crontab", value: MONITORS[schedule] },
    checkinMargin: 10, // minutes late before it counts as missed
    maxRuntime: 5,
    timezone: "Etc/UTC",
  });
}

/** Runs every job in a schedule for every org. One failing job doesn't stop the rest. */
async function runJobs(schedule: Schedule) {
  const started = Date.now();
  const deadline = started + 8_000;
  const orgs = await db.select().from(organizations);
  const results: Record<string, Counts | { error: string }> = {};

  for (const org of orgs) {
    for (const [name, job] of Object.entries(JOBS[schedule])) {
      const id = `${org.keyPrefix}:${name}`;
      try {
        const counts = await (job as (o: Org, d: number) => Promise<Counts>)(org, deadline);
        results[id] = counts;
        if (Object.values(counts).some((n) => n > 0)) {
          await audit({ orgId: org.id, actorKind: "system", action: `job.${name}`, metadata: counts });
        }
      } catch (err) {
        console.error(`[jobs] ${id} failed`, err);
        Sentry.captureException(err, { tags: { area: "jobs", job: name } });
        results[id] = { error: err instanceof Error ? err.message : String(err) };
        await audit({ orgId: org.id, actorKind: "system", action: "job.failed", metadata: { job: name, error: String(err).slice(0, 500) } });
      }
    }
  }
  // Entries with no org (e.g. failed sign-ins by unknown emails)
  if (schedule === "nightly") {
    try {
      results["system:auditArchive"] = { archived: await archiveAudit(null, "_system", 90, deadline) };
    } catch (err) {
      results["system:auditArchive"] = { error: String(err) };
    }
  }
  return { schedule, ms: Date.now() - started, results };
}

