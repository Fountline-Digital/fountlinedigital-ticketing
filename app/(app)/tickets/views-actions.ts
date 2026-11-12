"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedFilters } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import type { Result } from "./actions";

const ALLOWED = ["q", "status", "priority", "assignee", "type", "project", "teamRole", "due", "sort"];

export async function saveView(name: string, isShared: boolean, view: "list" | "board", filters: Record<string, string>): Promise<Result> {
  const { user, membership } = await requireUser();
  const n = name.trim();
  if (!n) return { error: "Name the view." };
  const clean = Object.fromEntries(Object.entries(filters).filter(([k, v]) => ALLOWED.includes(k) && typeof v === "string" && v));
  const shared = isShared && (membership.role === "admin" || membership.role === "manager");

  const [row] = await db
    .insert(savedFilters)
    .values({ orgId: membership.orgId, ownerMembershipId: membership.id, name: n, filters: clean, view, isShared: shared })
    .returning();
  await audit({ orgId: membership.orgId, actorUserId: user.id, actorRole: membership.role, action: "saved_view.create", entityType: "saved_filter", entityId: row.id, metadata: { name: n, shared } });
  revalidatePath("/tickets");
  return { ok: shared ? `Saved "${n}" for the whole team.` : `Saved "${n}".` };
}

export async function deleteView(id: string): Promise<Result> {
  const { user, membership } = await requireUser();
  const [row] = await db.select().from(savedFilters).where(and(eq(savedFilters.id, id), eq(savedFilters.orgId, membership.orgId)));
  if (!row) return { error: "View not found." };
  const isAdmin = membership.role === "admin" || membership.role === "manager";
  if (row.ownerMembershipId !== membership.id && !(row.isShared && isAdmin)) return { error: "You can only delete your own views." };
  await db.delete(savedFilters).where(eq(savedFilters.id, id));
  await audit({ orgId: membership.orgId, actorUserId: user.id, actorRole: membership.role, action: "saved_view.delete", entityType: "saved_filter", entityId: id });
  revalidatePath("/tickets");
  return { ok: `Deleted "${row.name}".` };
}
