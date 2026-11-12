"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { changeRequests, organizations, projectMembers, projectPhases, projects, teamRoles } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ChangeRequestError, approveChangeRequest, createChangeRequest } from "@/lib/change-requests";
import { can, type Role } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export type Result = { ok?: string; error?: string };
export type CRInput = { title: string; description: string; phaseId: string; teamRoleId: string; price: string; estimateHours: string };

async function ctxOf() {
  const u = await requireUser();
  return { ...u, orgId: u.membership.orgId, role: u.membership.role as Role };
}
type Ctx = Awaited<ReturnType<typeof ctxOf>>;

async function canSeeProject(ctx: Ctx, projectId: string) {
  if (ctx.role === "client") return false;
  if (await can(ctx.orgId, ctx.role, "projects.view_all")) return true;
  const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.membershipId, ctx.membership.id)));
  return Boolean(m);
}

async function parse(ctx: Ctx, projectId: string, input: CRInput) {
  const title = input.title.trim();
  if (!title) throw new ChangeRequestError("Give the change request a title.");
  const price = input.price.trim() === "" ? null : Math.round(Number(input.price) * 100);
  if (price !== null && (!Number.isFinite(price) || price < 0)) throw new ChangeRequestError("Enter a valid price.");
  const est = input.estimateHours.trim() === "" ? null : Math.round(Number(input.estimateHours) * 60);
  if (est !== null && (!Number.isFinite(est) || est < 0)) throw new ChangeRequestError("Enter the estimate in hours.");
  let phaseId: string | null = input.phaseId || null;
  if (phaseId) {
    const [ph] = await db.select().from(projectPhases).where(and(eq(projectPhases.id, phaseId), eq(projectPhases.projectId, projectId)));
    if (!ph) phaseId = null;
  }
  let teamRoleId: string | null = input.teamRoleId || null;
  if (teamRoleId) {
    const [r] = await db.select().from(teamRoles).where(and(eq(teamRoles.id, teamRoleId), eq(teamRoles.orgId, ctx.orgId)));
    if (!r) teamRoleId = null;
  }
  return { title, description: input.description.trim() || null, projectPhaseId: phaseId, teamRoleId, priceCents: price, estimateMinutes: est };
}

async function crFor(ctx: Ctx, crId: string) {
  const [cr] = await db.select().from(changeRequests).where(and(eq(changeRequests.id, crId), eq(changeRequests.orgId, ctx.orgId)));
  if (!cr) throw new ChangeRequestError("Change request not found.");
  return cr;
}

async function wrap(fn: () => Promise<{ msg: string; projectId: string }>): Promise<Result> {
  try {
    const { msg, projectId } = await fn();
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/tickets");
    return { ok: msg };
  } catch (err) {
    if (err instanceof ChangeRequestError) return { error: err.message };
    throw err;
  }
}

const log = (ctx: Ctx, action: string, cr: { id: string; key: string; projectId: string }, extra?: Record<string, unknown>) =>
  audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: `change_request.${action}`, entityType: "change_request", entityId: cr.id, entityKey: cr.key, metadata: { projectId: cr.projectId, ...extra } });

// Anyone on the project can raise one; pricing and decisions are for admins/managers.
export async function createCR(projectId: string, input: CRInput): Promise<Result> {
  const ctx = await ctxOf();
  return wrap(async () => {
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.orgId, ctx.orgId)));
    if (!project || !(await canSeeProject(ctx, projectId))) throw new ChangeRequestError("Project not found.");
    const values = await parse(ctx, projectId, input);
    const manager = await can(ctx.orgId, ctx.role, "projects.manage");
    const cr = await db.transaction((tx) =>
      createChangeRequest(tx, {
        orgId: ctx.orgId,
        projectId,
        ...values,
        priceCents: manager ? values.priceCents : null,
        requestedByUserId: ctx.user.id,
      }),
    );
    await log(ctx, "create", cr);
    return { msg: `${cr.key} created as a draft.`, projectId };
  });
}

export async function updateCR(crId: string, input: CRInput): Promise<Result> {
  const ctx = await ctxOf();
  return wrap(async () => {
    const cr = await crFor(ctx, crId);
    const manager = await can(ctx.orgId, ctx.role, "projects.manage");
    if (!manager && !(cr.requestedByUserId === ctx.user.id && cr.status === "draft")) throw new ChangeRequestError("You can't edit this change request.");
    if (cr.status !== "draft" && cr.status !== "pending_client") throw new ChangeRequestError("It's already decided.");
    const values = await parse(ctx, cr.projectId, input);
    await db
      .update(changeRequests)
      .set({ ...values, priceCents: manager ? values.priceCents : cr.priceCents })
      .where(eq(changeRequests.id, cr.id));
    await log(ctx, "update", cr);
    return { msg: "Saved.", projectId: cr.projectId };
  });
}

export async function sendCRToClient(crId: string): Promise<Result> {
  const ctx = await ctxOf();
  return wrap(async () => {
    if (!(await can(ctx.orgId, ctx.role, "projects.manage"))) throw new ChangeRequestError("Only admins and managers can send change requests.");
    const cr = await crFor(ctx, crId);
    if (cr.status !== "draft") throw new ChangeRequestError("Only drafts can be sent.");
    if (cr.priceCents === null) throw new ChangeRequestError("Add a price first (use 0 if there's no charge).");
    await db.update(changeRequests).set({ status: "pending_client" }).where(eq(changeRequests.id, cr.id));
    await log(ctx, "send", cr);
    return { msg: `${cr.key} is waiting on the client. They'll approve it in the portal; until then, record their answer here.`, projectId: cr.projectId };
  });
}

export async function decideCR(crId: string, approve: boolean, comment: string): Promise<Result> {
  const ctx = await ctxOf();
  return wrap(async () => {
    if (!(await can(ctx.orgId, ctx.role, "projects.manage"))) throw new ChangeRequestError("Only admins and managers can record a decision.");
    const cr = await crFor(ctx, crId);
    if (cr.status !== "pending_client" && cr.status !== "draft") throw new ChangeRequestError("It's already decided.");
    const note = comment.trim() || null;
    if (approve) {
      const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
      const { ticket } = await db.transaction((tx) => approveChangeRequest(tx, cr.id, ctx.user.id, org.keyPrefix, note));
      await log(ctx, "approve", cr, { ticket: ticket.key, recordedByStaff: true });
      return { msg: `${cr.key} approved. ${ticket.key} was created for the work.`, projectId: cr.projectId };
    }
    await db
      .update(changeRequests)
      .set({ status: "declined", decidedByUserId: ctx.user.id, decidedAt: new Date(), decisionComment: note })
      .where(eq(changeRequests.id, cr.id));
    await log(ctx, "decline", cr, { recordedByStaff: true });
    return { msg: `${cr.key} declined.`, projectId: cr.projectId };
  });
}

export async function cancelCR(crId: string): Promise<Result> {
  const ctx = await ctxOf();
  return wrap(async () => {
    const cr = await crFor(ctx, crId);
    const manager = await can(ctx.orgId, ctx.role, "projects.manage");
    if (!manager && cr.requestedByUserId !== ctx.user.id) throw new ChangeRequestError("You can't cancel this change request.");
    if (cr.status !== "draft" && cr.status !== "pending_client") throw new ChangeRequestError("It's already decided.");
    await db.update(changeRequests).set({ status: "cancelled" }).where(eq(changeRequests.id, cr.id));
    await log(ctx, "cancel", cr);
    return { msg: `${cr.key} cancelled.`, projectId: cr.projectId };
  });
}
