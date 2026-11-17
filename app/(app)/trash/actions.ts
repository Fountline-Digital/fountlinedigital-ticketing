"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";
import { KIND_LABELS, TRASH_KINDS, purge, restore, trashedRow, type TrashKind } from "@/lib/trash";

export type Result = { ok?: string; error?: string };

async function find(kind: string, id: string) {
  const ctx = await requirePermission("projects.manage");
  if (!TRASH_KINDS.includes(kind as TrashKind)) return { ctx, row: null, kind: "ticket" as TrashKind };
  return { ctx, row: await trashedRow(ctx.orgId, kind as TrashKind, id), kind: kind as TrashKind };
}

export async function restoreItem(kind: string, id: string): Promise<Result> {
  const { ctx, row, kind: k } = await find(kind, id);
  if (!row) return { error: "It's no longer in Trash." };
  // A comment or file on a deleted ticket comes back with the ticket, not on its own
  if ((k === "comment" || k === "file") && row.ticketId) {
    const parent = await trashedRow(ctx.orgId, "ticket", row.ticketId as string);
    if (parent) return { error: "Restore its ticket first." };
  }
  await restore(k, row.id);
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "trash.restore", entityType: k, entityId: row.id, entityKey: (row.key as string) ?? null });
  revalidatePath("/trash");
  return { ok: `${KIND_LABELS[k]} restored.` };
}

export async function deleteForever(kind: string, id: string): Promise<Result> {
  const { ctx, row, kind: k } = await find(kind, id);
  if (!(await can(ctx.orgId, ctx.role, "settings.manage"))) return { error: "Only admins can delete things for good." };
  if (!row) return { error: "It's no longer in Trash." };
  await purge(k, row.id);
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "trash.purge",
    entityType: k,
    entityId: row.id,
    entityKey: (row.key as string) ?? null,
    metadata: { title: row.title ?? row.originalName ?? row.name ?? null },
  });
  revalidatePath("/trash");
  return { ok: `${KIND_LABELS[k]} deleted for good.` };
}
