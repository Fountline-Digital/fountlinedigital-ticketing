import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { changeRequests, clientContacts, phaseApprovals, projectPhases, projects, ticketStatuses, tickets } from "@/db/schema";
import type { PortalCtx } from "@/lib/portal";
import { requiredApprovers } from "@/lib/phases";
import { questionnaireForProject } from "@/lib/questionnaire";
import { projectPicker } from "@/lib/website-picker";
import { projectBatches } from "@/lib/logo-picker";

/** Plain-language phase status for clients. */
export function phaseLabel(status: string, waitingOnClient: boolean) {
  if (status === "complete") return "Done";
  if (status === "awaiting_approval") return waitingOnClient ? "Waiting on your approval" : "In review";
  if (status === "active") return "In progress";
  return "Up next";
}

export async function portalProjects(ctx: PortalCtx) {
  if (ctx.clientIds.length === 0) return [];
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, ctx.orgId), inArray(projects.clientId, ctx.clientIds), isNull(projects.deletedAt), ne(projects.status, "archived")))
    .orderBy(desc(projects.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((p) => p.id);

  const phases = await db.select().from(projectPhases).where(inArray(projectPhases.projectId, ids)).orderBy(asc(projectPhases.position));
  const progress = await db
    .select({ projectId: tickets.projectId, category: ticketStatuses.category, n: count() })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(and(inArray(tickets.projectId, ids), isNull(tickets.deletedAt)))
    .groupBy(tickets.projectId, ticketStatuses.category);
  const waiting = await waitingOnClient(ctx);

  return rows.map((p) => {
    const mine = phases.filter((ph) => ph.projectId === p.id);
    const current = mine.find((ph) => ph.status === "awaiting_approval") ?? mine.find((ph) => ph.status === "active") ?? null;
    const counted = progress.filter((r) => r.projectId === p.id && r.category !== "cancelled");
    const total = counted.reduce((a, r) => a + r.n, 0);
    const done = counted.filter((r) => r.category === "done").reduce((a, r) => a + r.n, 0);
    const actions = waiting.filter((w) => w.projectId === p.id);
    return {
      project: p,
      phases: mine,
      current,
      percent: total ? Math.round((done / total) * 100) : 0,
      nextAction: actions[0]?.label ?? (current ? `We're working on ${current.name}.` : p.status === "completed" ? "This project is complete." : "Getting started."),
      actionCount: actions.length,
    };
  });
}

/** Everything waiting on the client: phase sign-offs and change requests. */
export async function waitingOnClient(ctx: PortalCtx) {
  if (ctx.clientIds.length === 0) return [];
  const mineProjects = await db
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .where(and(eq(projects.orgId, ctx.orgId), inArray(projects.clientId, ctx.clientIds), isNull(projects.deletedAt)));
  if (mineProjects.length === 0) return [];
  const ids = mineProjects.map((p) => p.id);
  const name = (id: string) => mineProjects.find((p) => p.id === id)?.name ?? "";

  const awaiting = await db
    .select()
    .from(projectPhases)
    .where(and(inArray(projectPhases.projectId, ids), eq(projectPhases.status, "awaiting_approval")));
  const items: { projectId: string; kind: "phase" | "change_request" | "questionnaire" | "website" | "logos"; id: string; label: string; projectName: string }[] = [];
  // Intake questionnaires not submitted yet, on active projects
  for (const p of mineProjects.filter((p) => p.status === "active")) {
    const q = await questionnaireForProject(p.id);
    if (q && !q.response?.submittedAt) items.push({ projectId: p.id, kind: "questionnaire", id: q.questionnaire.id, label: `Fill in the ${q.questionnaire.name.toLowerCase()}`, projectName: p.name });
    const picker = await projectPicker(p.id);
    if (picker.offers.length > 0 && !picker.selection?.lockedAt) items.push({ projectId: p.id, kind: "website", id: p.id, label: "Choose your website design", projectName: p.name });
    const batches = await projectBatches(p.id);
    if (batches[0]?.batch.status === "published") items.push({ projectId: p.id, kind: "logos", id: batches[0].batch.id, label: "Review your logo concepts", projectName: p.name });
  }
  for (const ph of awaiting) {
    if (!requiredApprovers(ph.gateApprover).includes("client")) continue;
    const [a] = await db
      .select()
      .from(phaseApprovals)
      .where(and(eq(phaseApprovals.projectPhaseId, ph.id), eq(phaseApprovals.roundNumber, ph.revisionRoundsUsed + 1), eq(phaseApprovals.approverKind, "client")));
    if (a && a.decision !== "pending") continue;
    items.push({ projectId: ph.projectId, kind: "phase", id: ph.id, label: `Review and approve ${ph.name}`, projectName: name(ph.projectId) });
  }
  const crs = await db
    .select()
    .from(changeRequests)
    .where(and(inArray(changeRequests.projectId, ids), eq(changeRequests.status, "pending_client")));
  for (const cr of crs) {
    items.push({ projectId: cr.projectId, kind: "change_request", id: cr.id, label: `Approve change request: ${cr.title}`, projectName: name(cr.projectId) });
  }
  return items;
}

const NONE = "00000000-0000-0000-0000-000000000000";

/**
 * Client-visible tickets for the client's companies.
 * - requestsOnly: things the client asked for (portal requests, revision requests, anything
 *   outside a phase), not the project's planned work, which lives on the project page.
 * - order "activity": waiting on the client first, then most recently updated.
 *   order "number": the order the work was planned in (FDT number).
 */
export async function portalTickets(
  ctx: PortalCtx,
  opts: { projectId?: string; open?: boolean; limit?: number; requestsOnly?: boolean; order?: "activity" | "number" } = {},
) {
  const ids = ctx.clientIds.length ? ctx.clientIds : [NONE];
  const clientUsers = opts.requestsOnly
    ? (
        await db
          .select({ userId: clientContacts.userId })
          .from(clientContacts)
          .where(and(inArray(clientContacts.clientId, ids), isNotNull(clientContacts.userId)))
      ).map((r) => r.userId as string)
    : [];
  return db
    .select({ t: tickets, statusName: ticketStatuses.name, statusColor: ticketStatuses.color, category: ticketStatuses.category, projectName: projects.name })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .leftJoin(projects, eq(projects.id, tickets.projectId))
    .where(
      and(
        eq(tickets.orgId, ctx.orgId),
        inArray(tickets.clientId, ids),
        eq(tickets.isClientVisible, true),
        isNull(tickets.deletedAt),
        opts.projectId ? eq(tickets.projectId, opts.projectId) : undefined,
        opts.open === undefined ? undefined : opts.open ? inArray(ticketStatuses.category, ["new", "todo", "in_progress", "waiting", "review", "blocked"]) : inArray(ticketStatuses.category, ["done", "cancelled"]),
        opts.requestsOnly
          ? or(isNull(tickets.projectPhaseId), eq(tickets.source, "portal"), inArray(tickets.reporterUserId, clientUsers.length ? clientUsers : [NONE]))
          : undefined,
      ),
    )
    .orderBy(
      ...(opts.order === "number"
        ? [asc(tickets.number)]
        : [desc(sql`(${ticketStatuses.category} = 'waiting')`), desc(tickets.updatedAt), desc(tickets.number)]),
    )
    .limit(opts.limit ?? 200);
}
