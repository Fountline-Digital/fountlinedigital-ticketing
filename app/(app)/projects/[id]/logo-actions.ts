"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, max } from "drizzle-orm";
import { db } from "@/db";
import { files, logoBatches, logoConcepts, organizations, projects } from "@/db/schema";
import { audit } from "@/lib/audit";
import { canSeeProject } from "@/lib/file-access";
import { batchInOrg, conceptKey, isOpenBatch, logoSettings } from "@/lib/logo-picker";
import { notify } from "@/lib/notify";
import type { Role } from "@/lib/permissions";
import { clientUserIds } from "@/lib/portal";
import { requireUser } from "@/lib/session";

export type Result = { ok?: string; error?: string };

/** Anyone on the team who can see the project (designers included); never clients. */
async function teamCtx(projectId: string) {
  const u = await requireUser();
  const ctx = { ...u, orgId: u.membership.orgId, role: u.membership.role as Role };
  if (ctx.role === "client") return null;
  const [p] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.orgId, ctx.orgId), isNull(projects.deletedAt)));
  if (!p || !(await canSeeProject(ctx, p.id))) return null;
  return { ctx, project: p };
}
const refresh = (projectId: string) => {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`, "layout");
};

export async function startBatch(projectId: string): Promise<Result> {
  const t = await teamCtx(projectId);
  if (!t) return { error: "Project not found." };
  const existing = await db.select().from(logoBatches).where(eq(logoBatches.projectId, projectId));
  if (existing.some((b) => isOpenBatch(b.status))) return { error: "Finish the current batch first." };
  if (existing.some((b) => b.status === "chosen")) return { error: "The client already chose a logo." };
  const [m] = await db.select({ n: max(logoBatches.number) }).from(logoBatches).where(eq(logoBatches.clientId, t.project.clientId));
  const number = (m?.n ?? 0) + 1;
  const [b] = await db.insert(logoBatches).values({ orgId: t.ctx.orgId, clientId: t.project.clientId, projectId, number, status: "draft" }).returning();
  await audit({ orgId: t.ctx.orgId, actorUserId: t.ctx.user.id, actorRole: t.ctx.role, action: "logo.batch_start", entityType: "project", entityId: projectId, entityKey: t.project.key, metadata: { batch: number } });
  refresh(projectId);
  return { ok: `Batch ${String(b.number).padStart(2, "0")} started. Upload the concepts, then publish.` };
}

/** Adds an uploaded image (uploaded to the project) to a draft batch as the next concept. */
export async function addConcept(batchId: string, fileId: string): Promise<Result> {
  const u = await requireUser();
  const b = await batchInOrg(u.membership.orgId, batchId);
  if (!b?.projectId) return { error: "Batch not found." };
  const t = await teamCtx(b.projectId);
  if (!t) return { error: "Batch not found." };
  if (b.status !== "draft") return { error: "This batch is already published." };
  const [f] = await db.select().from(files).where(and(eq(files.id, fileId), eq(files.projectId, b.projectId), isNull(files.deletedAt)));
  if (!f) return { error: "Upload not found." };
  if (!f.mimeType.startsWith("image/")) return { error: "Concepts must be images (PNG, JPG, WebP or SVG). Put source files like .ai in the project files." };
  const settings = await logoSettings(b.projectId);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, t.ctx.orgId));
  const [m] = await db.select({ n: max(logoConcepts.number) }).from(logoConcepts).where(eq(logoConcepts.batchId, b.id));
  const number = (m?.n ?? 0) + 1;
  await db.insert(logoConcepts).values({ orgId: t.ctx.orgId, batchId: b.id, number, key: conceptKey(org.keyPrefix, settings?.clientCode ?? "X", b.number, number), fileId: f.id });
  refresh(b.projectId);
  return { ok: `Concept ${number} added.` };
}

export async function removeConcept(conceptId: string): Promise<Result> {
  const u = await requireUser();
  const [c] = await db.select().from(logoConcepts).where(and(eq(logoConcepts.id, conceptId), eq(logoConcepts.orgId, u.membership.orgId)));
  const b = c ? await batchInOrg(u.membership.orgId, c.batchId) : null;
  if (!c || !b?.projectId || !(await teamCtx(b.projectId))) return { error: "Not found." };
  if (b.status !== "draft") return { error: "Published concepts can't be removed." };
  await db.delete(logoConcepts).where(eq(logoConcepts.id, c.id));
  refresh(b.projectId);
  return { ok: "Concept removed." };
}

export async function deleteDraftBatch(batchId: string): Promise<Result> {
  const u = await requireUser();
  const b = await batchInOrg(u.membership.orgId, batchId);
  if (!b?.projectId || !(await teamCtx(b.projectId))) return { error: "Not found." };
  if (b.status !== "draft") return { error: "Only a draft batch can be discarded." };
  await db.delete(logoBatches).where(eq(logoBatches.id, b.id));
  refresh(b.projectId);
  return { ok: "Draft batch discarded." };
}

/** Shows the batch to the client: concept files become client-visible and approvers are notified. */
export async function publishBatch(batchId: string): Promise<Result> {
  const u = await requireUser();
  const b = await batchInOrg(u.membership.orgId, batchId);
  const t = b?.projectId ? await teamCtx(b.projectId) : null;
  if (!b || !t) return { error: "Not found." };
  if (b.status !== "draft") return { error: "It's already published." };
  const concepts = await db.select().from(logoConcepts).where(eq(logoConcepts.batchId, b.id));
  if (concepts.length === 0) return { error: "Add at least one concept first." };
  await db.update(files).set({ visibility: "client" }).where(inArray(files.id, concepts.map((c) => c.fileId)));
  await db.update(logoBatches).set({ status: "published", publishedAt: new Date() }).where(eq(logoBatches.id, b.id));
  await audit({ orgId: t.ctx.orgId, actorUserId: t.ctx.user.id, actorRole: t.ctx.role, action: "logo.batch_publish", entityType: "project", entityId: t.project.id, entityKey: t.project.key, metadata: { batch: b.number, concepts: concepts.length } });
  await notify(db, {
    orgId: t.ctx.orgId,
    userIds: await clientUserIds(t.project.clientId),
    eventKey: "portal.approval_needed",
    title: `Logo concepts are ready (batch ${String(b.number).padStart(2, "0")})`,
    body: `${concepts.length} concepts to review for ${t.project.name}`,
    url: `/portal/projects/${t.project.id}/logos`,
  });
  refresh(t.project.id);
  return { ok: "Published. The client has been told." };
}
