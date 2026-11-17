"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { comments, logoBatches, logoConcepts, memberships, projectPhases, tickets } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createChangeRequest } from "@/lib/change-requests";
import { announce, notify } from "@/lib/notify";
import { canApprove, PortalError, portalProject, requirePortalWrite, type PortalCtx } from "@/lib/portal";
import { designPhase } from "@/lib/website-picker";

export type Result = { ok?: string; error?: string };

async function guarded(fn: () => Promise<Result>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PortalError) return { error: err.message };
    throw err;
  }
}

/** The concept's batch and project, if this client may act on it. */
async function load(ctx: PortalCtx, conceptId: string) {
  const [c] = await db.select().from(logoConcepts).where(and(eq(logoConcepts.id, conceptId), eq(logoConcepts.orgId, ctx.orgId)));
  const [b] = c ? await db.select().from(logoBatches).where(eq(logoBatches.id, c.batchId)) : [];
  const p = b?.projectId ? await portalProject(ctx, b.projectId) : null;
  if (!c || !b || !p || b.status === "draft") return null;
  return { c, b, p };
}

async function tellTeam(orgId: string, title: string, body: string | null, url: string) {
  const managers = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, "active"), inArray(memberships.role, ["admin", "manager"])));
  await notify(db, { orgId, userIds: managers.map((m) => m.userId), eventKey: "client.activity", title, body, url });
  announce(orgId, "client.activity", { title, body, url });
}

export async function setConceptFavorite(conceptId: string, favorite: boolean): Promise<Result> {
  return guarded(async () => {
    const ctx = await requirePortalWrite();
    const x = await load(ctx, conceptId);
    if (!x || x.b.status !== "published") return { error: "This batch is closed." };
    await db.update(logoConcepts).set({ isFavorite: favorite }).where(eq(logoConcepts.id, x.c.id));
    revalidatePath(`/portal/projects/${x.p.id}/logos`);
    return {};
  });
}

/** The client picks a logo: the batch closes as chosen and the design team is told. */
export async function chooseConcept(conceptId: string, comment: string): Promise<Result> {
  return guarded(async () => {
    const ctx = await requirePortalWrite();
    const x = await load(ctx, conceptId);
    if (!x) return { error: "Not found." };
    if (x.b.status !== "published") return { error: "This batch is already decided." };
    if (!canApprove(ctx, x.p.clientId)) return { error: "Only your company's approver can choose the logo. Your favorites are saved for them." };
    const note = comment.trim().slice(0, 5000) || null;

    await db.update(logoConcepts).set({ isChosen: true }).where(eq(logoConcepts.id, x.c.id));
    await db
      .update(logoBatches)
      .set({ status: "chosen", decidedAt: new Date(), decidedByUserId: ctx.user.id, clientComment: note })
      .where(eq(logoBatches.id, x.b.id));

    const phase = await designPhase(x.p.id);
    const phaseTickets = phase ? await db.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.projectPhaseId, phase.id), isNull(tickets.deletedAt))) : [];
    const summary = [`Logo chosen by ${ctx.user.name || ctx.user.email}: concept ${x.c.number} (${x.c.key}), batch ${String(x.b.number).padStart(2, "0")}.`, note ? `Notes:\n${note}` : null, "Upload the final logo files to the project files and share them with the client."]
      .filter(Boolean)
      .join("\n");
    if (phaseTickets.length) await db.insert(comments).values(phaseTickets.map((t) => ({ orgId: ctx.orgId, ticketId: t.id, authorUserId: null, body: summary, visibility: "internal" as const })));

    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: "client", action: "logo.choose", entityType: "project", entityId: x.p.id, entityKey: x.p.key, metadata: { concept: x.c.key, comment: note } });
    await tellTeam(ctx.orgId, `${ctx.user.name || ctx.user.email} chose logo concept ${x.c.key}`, note ?? x.p.name, `/projects/${x.p.id}`);
    revalidatePath(`/portal/projects/${x.p.id}`, "layout");
    revalidatePath("/portal");
    return { ok: "Great choice! We'll prepare the final logo files for you." };
  });
}

/** None of these work: ask for a new batch. Uses a design revision round, or becomes a change request when they're used up. */
export async function requestNewBatch(batchId: string, comment: string): Promise<Result> {
  return guarded(async () => {
    const ctx = await requirePortalWrite();
    const [b] = await db.select().from(logoBatches).where(and(eq(logoBatches.id, batchId), eq(logoBatches.orgId, ctx.orgId)));
    const p = b?.projectId ? await portalProject(ctx, b.projectId) : null;
    if (!b || !p) return { error: "Not found." };
    if (b.status !== "published") return { error: "This batch is already decided." };
    if (!canApprove(ctx, p.clientId)) return { error: "Only your company's approver can ask for a new batch." };
    const note = comment.trim().slice(0, 5000);
    if (!note) return { error: "Tell us what to change so the next batch is closer." };

    await db.update(logoBatches).set({ status: "revision_requested", decidedAt: new Date(), decidedByUserId: ctx.user.id, clientComment: note }).where(eq(logoBatches.id, b.id));
    const phase = await designPhase(p.id);
    let message: string;
    if (phase && phase.revisionRoundsUsed < phase.revisionRoundsAllowed) {
      await db.update(projectPhases).set({ revisionRoundsUsed: phase.revisionRoundsUsed + 1 }).where(eq(projectPhases.id, phase.id));
      message = `Thanks. We'll design a new batch (revision ${phase.revisionRoundsUsed + 1} of ${phase.revisionRoundsAllowed}).`;
    } else {
      const cr = await db.transaction((tx) =>
        createChangeRequest(tx, {
          orgId: ctx.orgId,
          projectId: p.id,
          title: `Another batch of logo concepts (after batch ${String(b.number).padStart(2, "0")})`,
          description: note,
          projectPhaseId: phase?.id ?? null,
          teamRoleId: null,
          priceCents: null,
          estimateMinutes: null,
          requestedByUserId: ctx.user.id,
        }),
      );
      message = `Thanks. You've used the included revisions, so we'll send you a change request (${cr.key}) to approve first.`;
    }
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: "client", action: "logo.request_new_batch", entityType: "project", entityId: p.id, entityKey: p.key, metadata: { batch: b.number, comment: note } });
    await tellTeam(ctx.orgId, `${ctx.user.name || ctx.user.email} asked for a new logo batch on ${p.key}`, note, `/projects/${p.id}`);
    revalidatePath(`/portal/projects/${p.id}`, "layout");
    revalidatePath("/portal");
    return { ok: message };
  });
}
