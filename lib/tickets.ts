import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projectMembers, projectPhases, ticketStatuses, tickets } from "@/db/schema";
import { can, type Role } from "@/lib/permissions";
import type { UserContext } from "@/lib/session";
import { leadRoleIds } from "@/lib/team-roles";
import { notifySignOffNeeded, openApprovals } from "@/lib/phases";

export type TicketAccess = {
  ticket: typeof tickets.$inferSelect;
  canEdit: boolean; // status, checklist, comments, description...
  canAssign: boolean;
  assignScope: string | null; // team role id a lead is limited to, or null for no limit
  canDelete: boolean;
};

/**
 * Who can open a ticket: admins/managers (tickets.view_all), anyone on the ticket's
 * project, its assignee, or whoever reported it. Clients get their own portal view later.
 */
export async function ticketAccess(ctx: Pick<UserContext, "orgId" | "role" | "membership" | "user">, where: { id?: string; key?: string }) {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.orgId, ctx.orgId),
        isNull(tickets.deletedAt),
        where.id ? eq(tickets.id, where.id) : eq(tickets.key, where.key ?? ""),
      ),
    );
  if (!ticket) return null;
  if (ctx.role === "client") return null;

  const viewAll = await can(ctx.orgId, ctx.role as Role, "tickets.view_all");
  // Team leads see (and assign) every ticket in the team roles they lead.
  const leads = ctx.role === "contractor" ? [] : await leadRoleIds(ctx.membership.id);
  const leadsThis = Boolean(ticket.teamRoleId && leads.includes(ticket.teamRoleId));
  let allowed = viewAll || leadsThis || ticket.assigneeMembershipId === ctx.membership.id || ticket.reporterUserId === ctx.user.id;
  if (!allowed && ticket.projectId) {
    const [m] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, ticket.projectId), eq(projectMembers.membershipId, ctx.membership.id)));
    allowed = Boolean(m);
  }
  if (!allowed) return null;

  return {
    ticket,
    canEdit: true,
    canAssign: leadsThis || (await can(ctx.orgId, ctx.role as Role, "tickets.assign")),
    // Leads (without the global permission) may only assign within their team role.
    assignScope: (await can(ctx.orgId, ctx.role as Role, "tickets.assign")) ? null : leadsThis ? ticket.teamRoleId : null,
    canDelete: await can(ctx.orgId, ctx.role as Role, "projects.manage"),
  } satisfies TicketAccess;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * After a ticket changes status: if every ticket in its active phase is done (or cancelled),
 * the phase either waits for sign-off (gated) or completes and unlocks the next phase.
 * Returns a short message when something moved, for the toast.
 */
export async function advancePhaseIfDone(tx: Tx, phaseId: string): Promise<string | null> {
  const [phase] = await tx.select().from(projectPhases).where(eq(projectPhases.id, phaseId));
  if (!phase || phase.status !== "active") return null;

  const rows = await tx
    .select({ category: ticketStatuses.category })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(and(eq(tickets.projectPhaseId, phaseId), isNull(tickets.deletedAt)));
  if (rows.length === 0 || rows.some((r) => r.category !== "done" && r.category !== "cancelled")) return null;

  if (phase.gateApprover !== "none") {
    await tx.update(projectPhases).set({ status: "awaiting_approval" }).where(eq(projectPhases.id, phaseId));
    await openApprovals(tx, phase);
    await notifySignOffNeeded(tx, phase);
    return `All of P${phase.position} ${phase.name} is done. It's waiting for sign-off.`;
  }

  await tx.update(projectPhases).set({ status: "complete", completedAt: new Date() }).where(eq(projectPhases.id, phaseId));
  return (await unlockNextPhase(tx, phase.projectId, phase.position)) ?? `P${phase.position} ${phase.name} is complete.`;
}

/** Activates the next locked phase and moves its "New" tickets to "To do". */
export async function unlockNextPhase(tx: Tx, projectId: string, afterPosition: number): Promise<string | null> {
  const next = (
    await tx.select().from(projectPhases).where(eq(projectPhases.projectId, projectId)).orderBy(asc(projectPhases.position))
  ).find((p) => p.position > afterPosition && p.status === "locked");
  if (!next) return "Every phase is complete.";

  await tx.update(projectPhases).set({ status: "active", startedAt: new Date() }).where(eq(projectPhases.id, next.id));

  const phaseTickets = await tx
    .select({ id: tickets.id, orgId: tickets.orgId, category: ticketStatuses.category })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(and(eq(tickets.projectPhaseId, next.id), isNull(tickets.deletedAt)));
  const toMove = phaseTickets.filter((t) => t.category === "new");
  if (toMove.length > 0) {
    const [todo] = await tx
      .select()
      .from(ticketStatuses)
      .where(and(eq(ticketStatuses.orgId, toMove[0].orgId), eq(ticketStatuses.category, "todo"), eq(ticketStatuses.isActive, true)))
      .orderBy(asc(ticketStatuses.sortOrder))
      .limit(1);
    if (todo) {
      await tx.update(tickets).set({ statusId: todo.id }).where(inArray(tickets.id, toMove.map((t) => t.id)));
    }
  }
  return `P${next.position} ${next.name} is now active.`;
}
