import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { changeRequests, priorities, projectPhases, projects, ticketStatuses, ticketTypes, tickets } from "@/db/schema";
import { nextNumber, nextTicketNumber, ticketKey } from "@/lib/keys";
import { pickAssignee } from "@/lib/team-roles";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class ChangeRequestError extends Error {}

/** Creates a draft change request with the next key, e.g. FDP-WEB-2601-CR2. */
export async function createChangeRequest(
  tx: Tx,
  input: {
    orgId: string;
    projectId: string;
    title: string;
    description: string | null;
    projectPhaseId: string | null;
    teamRoleId: string | null;
    priceCents: number | null;
    estimateMinutes: number | null;
    requestedByUserId: string;
  },
) {
  const [project] = await tx.select().from(projects).where(eq(projects.id, input.projectId));
  if (!project) throw new ChangeRequestError("Project not found.");
  const n = await nextNumber(tx, input.orgId, `cr:${project.id}`);
  const [cr] = await tx
    .insert(changeRequests)
    .values({ ...input, key: `${project.key}-CR${n}`, status: "draft" })
    .returning();
  return cr;
}

/**
 * Approval turns the change request into a ticket in its phase (routed by team role).
 * If that phase was waiting for sign-off, it goes back to active for the new work.
 */
export async function approveChangeRequest(tx: Tx, crId: string, userId: string, orgPrefix: string, comment: string | null) {
  const [cr] = await tx.select().from(changeRequests).where(eq(changeRequests.id, crId));
  if (!cr) throw new ChangeRequestError("Change request not found.");
  if (cr.status !== "pending_client" && cr.status !== "draft") throw new ChangeRequestError("Only an open change request can be approved.");
  const [project] = await tx.select().from(projects).where(eq(projects.id, cr.projectId));

  // Ticket defaults: "Change request" type, default priority, To do
  const [type] = await tx
    .select()
    .from(ticketTypes)
    .where(and(eq(ticketTypes.orgId, cr.orgId), eq(ticketTypes.kind, "change_request")))
    .limit(1);
  const [fallbackType] = type ? [type] : await tx.select().from(ticketTypes).where(and(eq(ticketTypes.orgId, cr.orgId), eq(ticketTypes.kind, "project_task"))).limit(1);
  const [priority] = await tx.select().from(priorities).where(and(eq(priorities.orgId, cr.orgId), eq(priorities.isDefault, true))).limit(1);
  const [anyPriority] = priority ? [priority] : await tx.select().from(priorities).where(eq(priorities.orgId, cr.orgId)).limit(1);
  const [todo] = await tx
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, cr.orgId), eq(ticketStatuses.category, "todo"), eq(ticketStatuses.isActive, true)))
    .orderBy(asc(ticketStatuses.sortOrder))
    .limit(1);
  if (!fallbackType || !anyPriority || !todo) throw new ChangeRequestError("Ticket types, priorities or statuses are missing. Check Settings.");

  const n = await nextTicketNumber(tx, cr.orgId);
  const [ticket] = await tx
    .insert(tickets)
    .values({
      orgId: cr.orgId,
      number: n,
      key: ticketKey(orgPrefix, n),
      ticketTypeId: fallbackType.id,
      statusId: todo.id,
      priorityId: anyPriority.id,
      title: cr.title,
      description: [cr.description, `From change request ${cr.key}.`].filter(Boolean).join("\n\n"),
      source: "automation",
      clientId: project.clientId,
      projectId: cr.projectId,
      projectPhaseId: cr.projectPhaseId,
      teamRoleId: cr.teamRoleId,
      assigneeMembershipId: await pickAssignee(cr.orgId, cr.teamRoleId),
      reporterUserId: cr.requestedByUserId ?? userId,
      estimateMinutes: cr.estimateMinutes,
      isClientVisible: true,
    })
    .returning();

  await tx
    .update(changeRequests)
    .set({ status: "approved", decidedByUserId: userId, decidedAt: new Date(), decisionComment: comment, ticketId: ticket.id })
    .where(eq(changeRequests.id, cr.id));

  if (cr.projectPhaseId) {
    const [phase] = await tx.select().from(projectPhases).where(eq(projectPhases.id, cr.projectPhaseId));
    if (phase?.status === "awaiting_approval") {
      await tx.update(projectPhases).set({ status: "active" }).where(eq(projectPhases.id, phase.id));
    }
  }
  return { cr, ticket };
}

export async function openChangeRequestCount(projectId: string) {
  const rows = await db
    .select({ id: changeRequests.id, status: changeRequests.status })
    .from(changeRequests)
    .where(and(eq(changeRequests.projectId, projectId), isNull(changeRequests.decidedAt)));
  return rows.filter((r) => r.status === "draft" || r.status === "pending_client").length;
}
