import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  memberships,
  notifications,
  projectMembers,
  projectPhases,
  projects,
  ticketLinks,
  ticketStatuses,
  tickets,
  users,
} from "@/db/schema";
import { projectProgress } from "@/lib/project-queries";

const OPEN = notInArray(ticketStatuses.category, ["done", "cancelled"]);
const now = () => new Date();
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

async function countTickets(...where: Parameters<typeof and>) {
  const [row] = await db
    .select({ n: count() })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(and(isNull(tickets.deletedAt), OPEN, ...where));
  return row?.n ?? 0;
}

/** Open tickets assigned to someone, soonest due first. */
export async function myTickets(membershipId: string, limit = 8) {
  return db
    .select({
      id: tickets.id,
      key: tickets.key,
      title: tickets.title,
      dueAt: tickets.dueAt,
      statusName: ticketStatuses.name,
      statusColor: ticketStatuses.color,
      projectKey: projects.key,
    })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .leftJoin(projects, eq(projects.id, tickets.projectId))
    .where(and(eq(tickets.assigneeMembershipId, membershipId), isNull(tickets.deletedAt), OPEN))
    .orderBy(sql`${tickets.dueAt} asc nulls last`, desc(tickets.updatedAt))
    .limit(limit);
}

/** My open tickets that are waiting on another unfinished ticket. */
async function myBlockedCount(membershipId: string) {
  const mine = await db
    .select({ id: tickets.id })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(and(eq(tickets.assigneeMembershipId, membershipId), isNull(tickets.deletedAt), OPEN));
  if (mine.length === 0) return 0;
  const blockers = await db
    .select({ to: ticketLinks.toTicketId })
    .from(ticketLinks)
    .innerJoin(tickets, eq(tickets.id, ticketLinks.fromTicketId))
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(and(eq(ticketLinks.kind, "blocks"), inArray(ticketLinks.toTicketId, mine.map((m) => m.id)), isNull(tickets.deletedAt), OPEN));
  return new Set(blockers.map((b) => b.to)).size;
}

/** Active projects with their current phase and progress. */
export async function activeProjects(orgId: string, onlyIds?: string[], limit = 8) {
  if (onlyIds && onlyIds.length === 0) return [];
  const rows = await db
    .select({ p: projects, clientName: clients.name })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.orgId, orgId), eq(projects.status, "active"), isNull(projects.deletedAt), onlyIds ? inArray(projects.id, onlyIds) : undefined))
    .orderBy(sql`${projects.targetLaunchDate} asc nulls last`, desc(projects.createdAt))
    .limit(limit);
  const ids = rows.map((r) => r.p.id);
  const progress = await projectProgress(ids);
  const phases = ids.length
    ? await db
        .select()
        .from(projectPhases)
        .where(and(inArray(projectPhases.projectId, ids), inArray(projectPhases.status, ["active", "awaiting_approval"])))
        .orderBy(asc(projectPhases.position))
    : [];
  return rows.map(({ p, clientName }) => {
    const phase = phases.find((ph) => ph.projectId === p.id);
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      clientName,
      targetLaunchDate: p.targetLaunchDate,
      phase: phase ? { label: `P${phase.position} · ${phase.name}`, awaiting: phase.status === "awaiting_approval" } : null,
      done: progress.get(p.id)?.done ?? 0,
      total: progress.get(p.id)?.total ?? 0,
    };
  });
}

export async function recentNotifications(userId: string, orgId: string, limit = 6) {
  const items = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), eq(notifications.orgId, orgId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const [unread] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), eq(notifications.orgId, orgId), isNull(notifications.readAt)));
  return { items, unread: unread?.n ?? 0 };
}

// ---------------------------------------------------------------------------

export async function teamDashboard(orgId: string, membershipId: string, userId: string) {
  const inOrg = eq(tickets.orgId, orgId);
  const [open, overdue, dueWeek, unassigned] = await Promise.all([
    countTickets(inOrg),
    countTickets(inOrg, lt(tickets.dueAt, now())),
    countTickets(inOrg, gte(tickets.dueAt, now()), lte(tickets.dueAt, inDays(7))),
    countTickets(inOrg, isNull(tickets.assigneeMembershipId)),
  ]);
  const [waitingStatus] = await db
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.category, "waiting"), eq(ticketStatuses.isActive, true)))
    .orderBy(asc(ticketStatuses.sortOrder))
    .limit(1);
  const waiting = waitingStatus ? await countTickets(inOrg, eq(tickets.statusId, waitingStatus.id)) : 0;

  const approvals = await db
    .select({ id: projectPhases.id, position: projectPhases.position, name: projectPhases.name, gate: projectPhases.gateApprover, projectId: projects.id, projectKey: projects.key, projectName: projects.name, clientName: clients.name })
    .from(projectPhases)
    .innerJoin(projects, eq(projects.id, projectPhases.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projectPhases.orgId, orgId), eq(projectPhases.status, "awaiting_approval"), isNull(projects.deletedAt)))
    .orderBy(asc(projects.key));

  // Open tickets per person (plus unassigned)
  const loadRows = await db
    .select({ membershipId: tickets.assigneeMembershipId, n: count() })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(and(inOrg, isNull(tickets.deletedAt), OPEN))
    .groupBy(tickets.assigneeMembershipId);
  const people = await db
    .select({ id: memberships.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, "active"), ne(memberships.role, "client")));
  const workload = people
    .map((p) => ({ id: p.id, name: p.name || p.email, open: loadRows.find((r) => r.membershipId === p.id)?.n ?? 0 }))
    .sort((a, b) => b.open - a.open);

  const [activeCount] = await db
    .select({ n: count() })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.status, "active"), isNull(projects.deletedAt)));

  return {
    stats: { open, overdue, dueWeek, unassigned, waiting, waitingStatusId: waitingStatus?.id ?? null, activeProjects: activeCount?.n ?? 0 },
    approvals,
    workload,
    unassignedLoad: loadRows.find((r) => r.membershipId === null)?.n ?? 0,
    projects: await activeProjects(orgId),
    mine: await myTickets(membershipId),
    notifications: await recentNotifications(userId, orgId),
  };
}

export async function personalDashboard(orgId: string, membershipId: string, userId: string) {
  const mineWhere = eq(tickets.assigneeMembershipId, membershipId);
  const [open, overdue, dueWeek, blocked] = await Promise.all([
    countTickets(mineWhere),
    countTickets(mineWhere, lt(tickets.dueAt, now())),
    countTickets(mineWhere, gte(tickets.dueAt, now()), lte(tickets.dueAt, inDays(7))),
    myBlockedCount(membershipId),
  ]);
  const projectIds = (await db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.membershipId, membershipId))).map((r) => r.id);
  return {
    stats: { open, overdue, dueWeek, blocked },
    mine: await myTickets(membershipId, 12),
    projects: await activeProjects(orgId, projectIds),
    notifications: await recentNotifications(userId, orgId),
  };
}
