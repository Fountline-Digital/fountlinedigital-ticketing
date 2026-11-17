"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { comments, files, memberships, projectDesignOffers, tickets, websiteDesigns, websiteSelections } from "@/db/schema";
import { audit } from "@/lib/audit";
import { announce, notify } from "@/lib/notify";
import { canApprove, PortalError, portalProject, requirePortalWrite } from "@/lib/portal";
import { designPhase, pickerFor } from "@/lib/website-picker";

export type Result = { ok?: string; error?: string };
const HEX = /^#[0-9a-f]{6}$/i;

async function guarded(fn: () => Promise<Result>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PortalError) return { error: err.message };
    throw err;
  }
}

export async function setFavorite(offerId: string, favorite: boolean): Promise<Result> {
  return guarded(async () => {
    const ctx = await requirePortalWrite();
    const [o] = await db.select().from(projectDesignOffers).where(and(eq(projectDesignOffers.id, offerId), eq(projectDesignOffers.orgId, ctx.orgId)));
    if (!o || !(await portalProject(ctx, o.projectId))) return { error: "Not found." };
    await db.update(projectDesignOffers).set({ isFavorite: favorite }).where(eq(projectDesignOffers.id, o.id));
    revalidatePath(`/portal/projects/${o.projectId}/website`);
    return {};
  });
}

/**
 * The client's final pick. Locks the choice, tells the team, and adds the choice,
 * notes and files to every ticket in the design phase.
 */
export async function submitWebsite(
  projectId: string,
  input: { designId: string; colors: string[]; font: string; note: string; fileIds: string[] },
): Promise<Result> {
  return guarded(async () => {
    const ctx = await requirePortalWrite();
    const p = await portalProject(ctx, projectId);
    if (!p) return { error: "Project not found." };
    if (!canApprove(ctx, p.clientId)) return { error: "Only your company's approver can submit the final choice. You can still mark favorites." };
    const picker = await pickerFor(p.id);
    if (!picker || picker.access === "none") return { error: "This project doesn't include the website picker." };
    const [existing] = await db.select().from(websiteSelections).where(eq(websiteSelections.projectId, p.id));
    if (existing?.lockedAt) return { error: "Your choice is already submitted. Contact us to change it." };

    const [offer] = await db.select().from(projectDesignOffers).where(and(eq(projectDesignOffers.projectId, p.id), eq(projectDesignOffers.designId, input.designId)));
    const [design] = offer ? await db.select().from(websiteDesigns).where(eq(websiteDesigns.id, offer.designId)) : [];
    if (!offer || !design) return { error: "Pick one of the designs offered to you." };

    // Colors and fonts are a Business option
    const full = picker.access === "full";
    const colors = full ? [...new Set(input.colors.map((c) => c.trim()).filter(Boolean))].slice(0, 6) : [];
    if (colors.some((c) => !HEX.test(c))) return { error: "Colors must be hex codes like #1a2b3c." };
    const font = full ? input.font.trim().slice(0, 60) : "";
    const note = input.note.trim().slice(0, 5000);

    const ids = [...new Set(input.fileIds)].slice(0, 50);
    const fileRows = ids.length
      ? await db.select({ id: files.id, name: files.originalName }).from(files).where(and(inArray(files.id, ids), eq(files.projectId, p.id), isNull(files.deletedAt)))
      : [];
    if (fileRows.length !== ids.length) return { error: "One of your files is missing. Upload it again." };

    const now = new Date();
    await db
      .insert(websiteSelections)
      .values({ orgId: ctx.orgId, projectId: p.id, designId: design.id, colors, fonts: font ? [font] : [], submittedAt: now, submittedByUserId: ctx.user.id, lockedAt: now })
      .onConflictDoUpdate({
        target: websiteSelections.projectId,
        set: { designId: design.id, colors, fonts: font ? [font] : [], submittedAt: now, submittedByUserId: ctx.user.id, lockedAt: now },
      });

    // Hand the choice to whoever builds it: an internal note on each design-phase ticket
    const summary = [
      `Website design chosen by ${ctx.user.name || ctx.user.email}: ${design.name} (${design.key})`,
      design.previewUrl ? `Preview: ${design.previewUrl}` : null,
      colors.length ? `Colors: ${colors.join(", ")}` : null,
      font ? `Font: ${font}` : null,
      fileRows.length ? `Files from the client (in project files): ${fileRows.map((f) => f.name).join(", ")}` : null,
      note ? `Notes:\n${note}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const phase = await designPhase(p.id);
    const phaseTickets = phase
      ? await db.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.projectPhaseId, phase.id), isNull(tickets.deletedAt)))
      : [];
    if (phaseTickets.length) {
      await db.insert(comments).values(phaseTickets.map((t) => ({ orgId: ctx.orgId, ticketId: t.id, authorUserId: null, body: summary, visibility: "internal" as const })));
    }

    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: "client", action: "picker.submit", entityType: "project", entityId: p.id, entityKey: p.key, metadata: { design: design.key, colors, font, files: fileRows.length } });
    const managers = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.status, "active"), inArray(memberships.role, ["admin", "manager"])));
    const msg = { title: `${ctx.user.name || ctx.user.email} chose the ${design.name} design for ${p.key}`, body: p.name, url: `/projects/${p.id}` };
    await notify(db, { orgId: ctx.orgId, userIds: managers.map((m) => m.userId), eventKey: "client.activity", ...msg });
    announce(ctx.orgId, "client.activity", msg);
    revalidatePath(`/portal/projects/${p.id}`);
    revalidatePath(`/portal/projects/${p.id}/website`);
    revalidatePath("/portal");
    return { ok: `Thanks! ${design.name} is locked in and we've started on it.` };
  });
}
