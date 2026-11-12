import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { memberships, notifications, phaseApprovals, projectPhases, projects, ticketStatuses, tickets } from "@/db/schema";
import { nextTicketNumber, ticketKey } from "@/lib/keys";
import { pickAssignee } from "@/lib/team-roles";
import { createChangeRequest } from "@/lib/change-requests";
import { unlockNextPhase } from "@/lib/tickets";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ApproverKind = "manager" | "client";

export const requiredApprovers = (gate: string): ApproverKind[] =>
  gate === "both" ? ["manager", "client"] : gate === "manager" ? ["manager"] : gate === "client" ? ["client"] : [];

/** The sign-off round in progress: round 1 first, +1 after each "request changes". */
export const currentRound = (phase: { revisionRoundsUsed: number }) => phase.revisionRoundsUsed + 1;

/** Creates the pending approvals for the phase's current round (safe to call twice). */
export async function openApprovals(tx: Tx, phase: typeof projectPhases.$inferSelect) {
  const round = currentRound(phase);
  const existing = await tx
    .select()
    .from(phaseApprovals)
    .where(and(eq(phaseApprovals.projectPhaseId, phase.id), eq(phaseApprovals.roundNumber, round)));
  for (const kind of requiredApprovers(phase.gateApprover)) {
    if (!existing.some((e) => e.approverKind === kind)) {
      await tx.insert(phaseApprovals).values({ orgId: phase.orgId, projectPhaseId: phase.id, approverKind: kind, roundNumber: round });
    }
  }
}

/** Tells admins and managers a phase is ready for sign-off. */
export async function notifySignOffNeeded(tx: Tx, phase: typeof projectPhases.$inferSelect) {
  const [project] = await tx.select().from(projects).where(eq(projects.id, phase.projectId));
  if (!project) return;
  const people = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, phase.orgId), eq(memberships.status, "active"), inArray(memberships.role, ["admin", "manager"])));
  if (people.length === 0) return;
  await tx.insert(notifications).values(
    people.map((p) => ({
      orgId: phase.orgId,
      recipientUserId: p.userId,
      eventKey: "phase.awaiting_approval",
      title: `${project.key}: P${phase.position} ${phase.name} is ready for sign-off`,
      body: project.name,
      url: `/projects/${project.id}`,
    })),
  );
}

export async function approvalsFor(phaseIds: string[]) {
  if (phaseIds.length === 0) return [];
  return db.select().from(phaseApprovals).where(inArray(phaseApprovals.projectPhaseId, phaseIds));
}

/**
 * Records one approver's decision. Approving: when every required approver for this round
 * has approved, the phase completes and the next one unlocks. Requesting changes: the
 * round is used up, the phase goes back to active, and a revision ticket is created.
 */
export async function decide(input: {
  phaseId: string;
  kind: ApproverKind;
  approve: boolean;
  comment: string | null;
  userId: string;
  orgPrefix: string;
}): Promise<{ message: string; overLimit?: boolean }> {
  return db.transaction(async (tx) => {
    const [phase] = await tx.select().from(projectPhases).where(eq(projectPhases.id, input.phaseId));
    if (!phase || phase.status !== "awaiting_approval") throw new Error("This phase isn't waiting for sign-off.");
    if (!requiredApprovers(phase.gateApprover).includes(input.kind)) throw new Error("That approval isn't needed for this phase.");

    await openApprovals(tx, phase);
    const round = currentRound(phase);

    // Past the package's revision limit: the extra work becomes a change request instead.
    if (!input.approve && phase.revisionRoundsUsed + 1 > phase.revisionRoundsAllowed) {
      const lastTicket = (
        await tx.select().from(tickets).where(and(eq(tickets.projectPhaseId, phase.id), isNull(tickets.deletedAt))).orderBy(asc(tickets.number))
      ).at(-1);
      const cr = await createChangeRequest(tx, {
        orgId: phase.orgId,
        projectId: phase.projectId,
        title: `Extra revision: ${phase.name}`,
        description: input.comment,
        projectPhaseId: phase.id,
        teamRoleId: lastTicket?.teamRoleId ?? null,
        priceCents: null,
        estimateMinutes: null,
        requestedByUserId: input.userId,
      });
      return {
        message: `This phase has used all ${phase.revisionRoundsAllowed} revision rounds, so ${cr.key} was created instead. Price it and send it to the client.`,
        overLimit: true,
      };
    }
    await tx
      .update(phaseApprovals)
      .set({ decision: input.approve ? "approved" : "rejected", decidedByUserId: input.userId, decidedAt: new Date(), comment: input.comment })
      .where(and(eq(phaseApprovals.projectPhaseId, phase.id), eq(phaseApprovals.roundNumber, round), eq(phaseApprovals.approverKind, input.kind)));

    if (input.approve) {
      const rows = await tx
        .select()
        .from(phaseApprovals)
        .where(and(eq(phaseApprovals.projectPhaseId, phase.id), eq(phaseApprovals.roundNumber, round)));
      const allApproved = requiredApprovers(phase.gateApprover).every((k) => rows.some((r) => r.approverKind === k && r.decision === "approved"));
      if (!allApproved) return { message: `${input.kind === "manager" ? "Manager" : "Client"} approval recorded. Still waiting on the other sign-off.` };

      await tx.update(projectPhases).set({ status: "complete", completedAt: new Date() }).where(eq(projectPhases.id, phase.id));
      const next = await unlockNextPhase(tx, phase.projectId, phase.position);
      return { message: `P${phase.position} ${phase.name} approved. ${next ?? ""}`.trim() };
    }

    // Request changes: use a revision round and send the phase back to work.
    const used = phase.revisionRoundsUsed + 1;
    const overLimit = used > phase.revisionRoundsAllowed;
    await tx.update(projectPhases).set({ status: "active", revisionRoundsUsed: used }).where(eq(projectPhases.id, phase.id));

    // A ticket for the requested changes, routed like the phase's other work
    const phaseTickets = await tx
      .select()
      .from(tickets)
      .where(and(eq(tickets.projectPhaseId, phase.id), isNull(tickets.deletedAt)))
      .orderBy(asc(tickets.number));
    const template = phaseTickets.at(-1);
    const [todo] = await tx
      .select()
      .from(ticketStatuses)
      .where(and(eq(ticketStatuses.orgId, phase.orgId), eq(ticketStatuses.category, "todo"), eq(ticketStatuses.isActive, true)))
      .orderBy(asc(ticketStatuses.sortOrder))
      .limit(1);
    if (template && todo) {
      const n = await nextTicketNumber(tx, phase.orgId);
      const teamRoleId = template.teamRoleId;
      await tx.insert(tickets).values({
        orgId: phase.orgId,
        number: n,
        key: ticketKey(input.orgPrefix, n),
        ticketTypeId: template.ticketTypeId,
        statusId: todo.id,
        priorityId: template.priorityId,
        title: `Revision round ${used}: ${phase.name}`,
        description: input.comment ? `Requested changes:\n${input.comment}` : "Changes were requested at sign-off.",
        source: "automation",
        clientId: template.clientId,
        projectId: phase.projectId,
        projectPhaseId: phase.id,
        teamRoleId,
        assigneeMembershipId: (await pickAssignee(phase.orgId, teamRoleId)) ?? template.assigneeMembershipId,
        reporterUserId: input.userId,
        isClientVisible: true,
      });
    }

    return {
      message: overLimit
        ? `Changes requested. That's round ${used} of ${phase.revisionRoundsAllowed}, so it's over the package limit. Consider a change request.`
        : `Changes requested (round ${used} of ${phase.revisionRoundsAllowed}). A revision ticket was added to the phase.`,
      overLimit,
    };
  });
}
