"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { audit } from "@/lib/audit";
import { canOpenFile, resolveTarget, type FileTarget } from "@/lib/file-access";
import { can, type Role } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { buildStorageKey, DEFAULT_ALLOWED_TYPES, extensionOf, headObject, signedUploadUrl } from "@/lib/storage";

export type Result = { ok?: string; error?: string; id?: string };

async function ctxOf() {
  const u = await requireUser();
  return { ...u, orgId: u.membership.orgId, role: u.membership.role as Role };
}

/** Step 1: check the file and hand back a signed link the browser uploads straight to R2. */
export async function requestUpload(target: FileTarget, file: { name: string; type: string; size: number }) {
  const ctx = await ctxOf();
  const t = await resolveTarget(ctx, target);
  if (!t) return { error: "You can't add files here." };

  const allowed = (t.org.settings.allowedFileTypes ?? DEFAULT_ALLOWED_TYPES).map((x) => x.toLowerCase());
  const ext = extensionOf(file.name);
  if (!ext || !allowed.includes(ext)) return { error: `.${ext || "?"} files aren't allowed. Allowed: ${allowed.join(", ")}.` };
  const maxMb = t.org.settings.maxUploadMb ?? 25;
  if (file.size <= 0) return { error: "That file is empty." };
  if (file.size > maxMb * 1024 * 1024) return { error: `Files can be up to ${maxMb} MB.` };

  const key = buildStorageKey({ ...t.keyParts, fileName: file.name });
  const type = file.type || "application/octet-stream";
  return { url: await signedUploadUrl(key, type), key, type };
}

/** Step 2: after the upload finishes, check it really landed and record it. */
export async function confirmUpload(target: FileTarget, upload: { key: string; name: string }): Promise<Result> {
  const ctx = await ctxOf();
  const t = await resolveTarget(ctx, target);
  if (!t) return { error: "You can't add files here." };

  // The key must be in this target's folder (no saving into someone else's path)
  const folder = buildStorageKey({ ...t.keyParts, fileName: "x" }).split("/").slice(0, 4).join("/") + "/";
  if (!upload.key.startsWith(folder)) return { error: "Upload didn't match. Try again." };

  const head = await headObject(upload.key);
  if (!head) return { error: "The upload didn't finish. Try again." };
  const maxMb = t.org.settings.maxUploadMb ?? 25;
  if (head.size > maxMb * 1024 * 1024) return { error: `Files can be up to ${maxMb} MB.` };

  const [row] = await db
    .insert(files)
    .values({
      orgId: ctx.orgId,
      storageKey: upload.key,
      originalName: upload.name.slice(0, 255),
      mimeType: head.type,
      sizeBytes: head.size,
      uploadedByUserId: ctx.user.id,
      clientId: t.clientId,
      projectId: t.projectId,
      ticketId: t.ticketId,
      visibility: ctx.role === "client" ? "client" : "internal", // a client's own uploads are visible to them
    })
    .onConflictDoNothing()
    .returning();
  if (row) {
    await audit({
      orgId: ctx.orgId,
      actorUserId: ctx.user.id,
      actorRole: ctx.role,
      action: "file.upload",
      entityType: "file",
      entityId: row.id,
      metadata: { name: row.originalName, size: row.sizeBytes, ticketId: t.ticketId, projectId: t.projectId },
    });
  }
  t.revalidate.forEach((p) => revalidatePath(p));
  return { ok: `Uploaded ${upload.name}.`, id: row?.id };
}

async function editableFile(fileId: string) {
  const ctx = await ctxOf();
  const [file] = await db.select().from(files).where(and(eq(files.id, fileId), eq(files.orgId, ctx.orgId), isNull(files.deletedAt)));
  if (!file || !(await canOpenFile(ctx, file))) return { ctx, file: null };
  const manager = ctx.role !== "client" && (await can(ctx.orgId, ctx.role, "projects.manage"));
  return { ctx, file: manager || file.uploadedByUserId === ctx.user.id ? file : null };
}

function refreshFor(file: { ticketId: string | null; projectId: string | null }) {
  if (file.projectId) revalidatePath(`/projects/${file.projectId}`);
  revalidatePath("/tickets/[key]", "page");
  revalidatePath("/portal", "layout");
}

export async function setFileVisibility(fileId: string, visibility: "internal" | "client"): Promise<Result> {
  const { ctx, file } = await editableFile(fileId);
  if (!file || ctx.role === "client") return { error: "You can't change this file." };
  await db.update(files).set({ visibility }).where(eq(files.id, file.id));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "file.visibility", entityType: "file", entityId: file.id, changes: { before: { visibility: file.visibility }, after: { visibility } } });
  refreshFor(file);
  return { ok: visibility === "client" ? "The client can see this file." : "Hidden from the client." };
}

/** Moves the file to Trash (restorable for 30 days; the stored file is purged later). */
export async function deleteFile(fileId: string): Promise<Result> {
  const { ctx, file } = await editableFile(fileId);
  if (!file) return { error: "You can only delete files you uploaded." };
  await db.update(files).set({ deletedAt: new Date(), deletedBy: ctx.user.id }).where(eq(files.id, file.id));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "file.delete", entityType: "file", entityId: file.id, metadata: { name: file.originalName } });
  refreshFor(file);
  return { ok: `Deleted ${file.originalName}.` };
}
