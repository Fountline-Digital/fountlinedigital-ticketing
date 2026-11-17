"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projectDesignOffers, projectPhases, projects, websiteSelections } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createChangeRequest } from "@/lib/change-requests";
import { notify } from "@/lib/notify";
import { clientUserIds } from "@/lib/portal";
import { requirePermission } from "@/lib/session";
import { designPhase, eligibleDesigns, pickerFor } from "@/lib/website-picker";

export type Result = { ok?: string; error?: string };

async function projectOf(orgId: string, id: string) {
  const [p] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.orgId, orgId), isNull(projects.deletedAt)));
  return p ?? null;
}
const refresh = (id: string) => {
  revalidatePath(`/projects/${id}`);
  revalidatePath(`/portal/projects/${id}`);
};

export async function offerDesigns(projectId: string, designIds: string[]): Promise<Result> {
  const ctx = await requirePermission("projects.manage");
  const p = await projectOf(ctx.orgId, projectId);
  if (!p) return { error: "Project not found." };
  const picker = await pickerFor(p.id);
  if (!picker || picker.access === "none") return { error: "This package doesn't include the website picker." };
  const [sel] = await db.select().from(websiteSelections).where(eq(websiteSelections.projectId, p.id));
  if (sel?.lockedAt) return { error: "The client already chose. Unlock their choice first." };

  const eligible = (await eligibleDesigns(ctx.orgId, picker.access)).map((x) => x.d.id);
  const chosen = [...new Set(designIds)].filter((id) => eligible.includes(id));
  if (chosen.length === 0) return { error: "Pick at least one design." };
  const existing = await db.select().from(projectDesignOffers).where(eq(projectDesignOffers.projectId, p.id));
  const fresh = chosen.filter((id) => !existing.some((e) => e.designId === id));
  if (existing.length + fresh.length > picker.maxOffers) return { error: `This package offers up to ${picker.maxOffers} designs.` };
  if (fresh.length === 0) return { ok: "Those are already offered." };

  await db.insert(projectDesignOffers).values(fresh.map((designId) => ({ orgId: ctx.orgId, projectId: p.id, designId, offeredByUserId: ctx.user.id })));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "picker.offer", entityType: "project", entityId: p.id, entityKey: p.key, metadata: { designs: fresh.length } });
  if (existing.length === 0) {
    await notify(db, {
      orgId: ctx.orgId,
      userIds: await clientUserIds(p.clientId),
      eventKey: "portal.approval_needed",
      title: "Your website designs are ready to choose from",
      body: p.name,
      url: `/portal/projects/${p.id}/website`,
    });
  }
  refresh(p.id);
  return { ok: `${fresh.length} design${fresh.length === 1 ? "" : "s"} offered.${existing.length === 0 ? " The client has been told." : ""}` };
}

export async function removeOffer(offerId: string): Promise<Result> {
  const ctx = await requirePermission("projects.manage");
  const [o] = await db.select().from(projectDesignOffers).where(and(eq(projectDesignOffers.id, offerId), eq(projectDesignOffers.orgId, ctx.orgId)));
  if (!o) return { error: "Not found." };
  const [sel] = await db.select().from(websiteSelections).where(eq(websiteSelections.projectId, o.projectId));
  if (sel && sel.designId === o.designId) return { error: "That's the design the client chose." };
  await db.delete(projectDesignOffers).where(eq(projectDesignOffers.id, o.id));
  refresh(o.projectId);
  return { ok: "Removed from the client's options." };
}

/**
 * Lets the client change a submitted choice. Uses one of the design phase's revision
 * rounds; when none are left, a draft change request is created instead (unless `free`).
 */
export async function unlockSelection(projectId: string, free = false): Promise<Result> {
  const ctx = await requirePermission("projects.manage");
  const p = await projectOf(ctx.orgId, projectId);
  if (!p) return { error: "Project not found." };
  const [sel] = await db.select().from(websiteSelections).where(eq(websiteSelections.projectId, p.id));
  if (!sel?.lockedAt) return { error: "Nothing to unlock." };
  const phase = await designPhase(p.id);
  let note: string;

  if (!free && phase && phase.revisionRoundsUsed >= phase.revisionRoundsAllowed) {
    const cr = await db.transaction((tx) =>
      createChangeRequest(tx, {
        orgId: ctx.orgId,
        projectId: p.id,
        title: "Change the chosen website design",
        description: "The client wants to change their website design after submitting it, and the included revision rounds are used up.",
        projectPhaseId: phase.id,
        teamRoleId: null,
        priceCents: null,
        estimateMinutes: null,
        requestedByUserId: ctx.user.id,
      }),
    );
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "picker.unlock_change_request", entityType: "project", entityId: p.id, entityKey: p.key, metadata: { changeRequest: cr.key } });
    refresh(p.id);
    return { ok: `No revision rounds left, so ${cr.key} was created. Price it and send it; once it's approved, use "Unlock without charge".` };
  }

  if (!free && phase) {
    await db.update(projectPhases).set({ revisionRoundsUsed: phase.revisionRoundsUsed + 1 }).where(eq(projectPhases.id, phase.id));
    note = `Used revision round ${phase.revisionRoundsUsed + 1} of ${phase.revisionRoundsAllowed}.`;
  } else note = "No revision round used.";
  await db.update(websiteSelections).set({ lockedAt: null, submittedAt: null }).where(eq(websiteSelections.id, sel.id));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "picker.unlock", entityType: "project", entityId: p.id, entityKey: p.key, metadata: { free, note } });
  await notify(db, {
    orgId: ctx.orgId,
    userIds: await clientUserIds(p.clientId, { approversOnly: true }),
    eventKey: "portal.approval_needed",
    title: "You can change your website design choice",
    body: p.name,
    url: `/portal/projects/${p.id}/website`,
  });
  refresh(p.id);
  return { ok: `Unlocked. ${note}` };
}

