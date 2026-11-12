"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { closeoutItems, organizations, projectPhases, projects } from "@/db/schema";
import { audit } from "@/lib/audit";
import { decide, notifySignOffNeeded, openApprovals, type ApproverKind } from "@/lib/phases";
import { requirePermission } from "@/lib/session";

export type Result = { ok?: string; error?: string };

async function projectFor(orgId: string, projectId: string) {
  const [p] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.orgId, orgId), isNull(projects.deletedAt)));
  return p ?? null;
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

// ---- Phase sign-off -----------------------------------------------------------

export async function decidePhase(phaseId: string, kind: ApproverKind, approve: boolean, comment: string): Promise<Result> {
  const ctx = await requirePermission("projects.manage");
  const [phase] = await db.select().from(projectPhases).where(and(eq(projectPhases.id, phaseId), eq(projectPhases.orgId, ctx.orgId)));
  if (!phase) return { error: "Phase not found." };
  if (!approve && !comment.trim()) return { error: "Say what needs to change." };
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));

  try {
    const r = await decide({ phaseId, kind, approve, comment: comment.trim() || null, userId: ctx.user.id, orgPrefix: org.keyPrefix });
    const [project] = await db.select().from(projects).where(eq(projects.id, phase.projectId));
    await audit({
      orgId: ctx.orgId,
      actorUserId: ctx.user.id,
      actorRole: ctx.role,
      action: approve ? "phase.approve" : "phase.request_changes",
      entityType: "project",
      entityId: phase.projectId,
      entityKey: project?.key,
      // A manager recording the client's decision is logged as such
      metadata: { phase: `P${phase.position} ${phase.name}`, approver: kind, recordedByStaff: kind === "client", comment: comment.trim() || null },
    });
    refresh(phase.projectId);
    return { ok: r.message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save the decision." };
  }
}

/** Sends an active phase for sign-off early, even if some tickets are still open. */
export async function sendForSignOff(phaseId: string): Promise<Result> {
  const ctx = await requirePermission("projects.manage");
  const [phase] = await db.select().from(projectPhases).where(and(eq(projectPhases.id, phaseId), eq(projectPhases.orgId, ctx.orgId)));
  if (!phase || phase.status !== "active") return { error: "Only an active phase can be sent for sign-off." };
  if (phase.gateApprover === "none") return { error: "This phase doesn't need sign-off. It completes when its tickets are done." };
  await db.transaction(async (tx) => {
    await tx.update(projectPhases).set({ status: "awaiting_approval" }).where(eq(projectPhases.id, phase.id));
    await openApprovals(tx, phase);
    await notifySignOffNeeded(tx, phase);
  });
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "phase.send_for_signoff", entityType: "project", entityId: phase.projectId, metadata: { phase: `P${phase.position} ${phase.name}` } });
  refresh(phase.projectId);
  return { ok: `P${phase.position} ${phase.name} sent for sign-off.` };
}

// ---- Project details & status -----------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function updateProjectDetails(projectId: string, input: { name: string; startDate: string; targetLaunchDate: string }): Promise<Result> {
  const ctx = await requirePermission("projects.manage");
  const p = await projectFor(ctx.orgId, projectId);
  if (!p) return { error: "Project not found." };
  const name = input.name.trim();
  if (!name) return { error: "Give the project a name." };
  const startDate = input.startDate || null;
  const targetLaunchDate = input.targetLaunchDate || null;
  if ((startDate && !DATE.test(startDate)) || (targetLaunchDate && !DATE.test(targetLaunchDate))) return { error: "Check the dates." };
  if (startDate && targetLaunchDate && targetLaunchDate < startDate) return { error: "Target launch can't be before the start date." };

  await db.update(projects).set({ name, startDate, targetLaunchDate }).where(eq(projects.id, p.id));
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "project.update",
    entityType: "project",
    entityId: p.id,
    entityKey: p.key,
    changes: { before: { name: p.name, startDate: p.startDate, targetLaunchDate: p.targetLaunchDate }, after: { name, startDate, targetLaunchDate } },
  });
  refresh(p.id);
  return { ok: "Project saved." };
}

type Status = "active" | "on_hold" | "completed" | "archived" | "cancelled";

export async function setProjectStatus(projectId: string, status: Status, force = false): Promise<Result> {
  const ctx = await requirePermission("projects.manage");
  const p = await projectFor(ctx.orgId, projectId);
  if (!p) return { error: "Project not found." };
  if (!["active", "on_hold", "completed", "archived", "cancelled"].includes(status)) return { error: "Unknown status." };

  if (status === "completed" && !force) {
    const phases = await db.select().from(projectPhases).where(eq(projectPhases.projectId, p.id));
    const open = phases.filter((ph) => ph.status !== "complete");
    if (open.length > 0) return { error: `${open.length} phase${open.length === 1 ? " isn't" : "s aren't"} complete yet.` };
    const items = await db.select().from(closeoutItems).where(eq(closeoutItems.projectId, p.id));
    if (items.some((i) => !i.doneAt)) return { error: "Finish the closeout checklist first." };
  }

  const now = new Date();
  await db
    .update(projects)
    .set({
      status,
      completedAt: status === "completed" ? now : status === "active" ? null : p.completedAt,
      archivedAt: status === "archived" ? now : status === "active" ? null : p.archivedAt,
    })
    .where(eq(projects.id, p.id));
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "project.status_change",
    entityType: "project",
    entityId: p.id,
    entityKey: p.key,
    changes: { before: { status: p.status }, after: { status } },
    metadata: force ? { forced: true } : undefined,
  });
  refresh(p.id);
  const label = { active: "is active again", on_hold: "is on hold", completed: "is complete", archived: "is archived", cancelled: "is cancelled" }[status];
  return { ok: `${p.key} ${label}.` };
}

// ---- Closeout --------------------------------------------------------------------

export async function toggleCloseoutItem(itemId: string, done: boolean): Promise<Result> {
  const ctx = await requirePermission("projects.manage");
  const [item] = await db.select().from(closeoutItems).where(and(eq(closeoutItems.id, itemId), eq(closeoutItems.orgId, ctx.orgId)));
  if (!item) return { error: "Item not found." };
  await db
    .update(closeoutItems)
    .set({ doneAt: done ? new Date() : null, doneByUserId: done ? ctx.user.id : null })
    .where(eq(closeoutItems.id, item.id));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: done ? "closeout.check" : "closeout.uncheck", entityType: "project", entityId: item.projectId, metadata: { label: item.label } });
  refresh(item.projectId);
  return {};
}

export async function recordClientSignOff(projectId: string): Promise<Result> {
  const ctx = await requirePermission("projects.manage");
  const p = await projectFor(ctx.orgId, projectId);
  if (!p) return { error: "Project not found." };
  await db.update(projects).set({ closeoutSignedOffAt: new Date(), closeoutSignedOffByUserId: ctx.user.id }).where(eq(projects.id, p.id));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "closeout.client_signoff_recorded", entityType: "project", entityId: p.id, entityKey: p.key });
  refresh(p.id);
  return { ok: "Final sign-off recorded. Clients will do this themselves once the portal is live." };
}
