"use server";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { legalDocuments } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/session";

/** Publishes a new version. Every client accepts it again on their next visit. */
export async function publishLegal(kind: "terms" | "privacy", body: string): Promise<{ ok?: string; error?: string }> {
  const ctx = await requirePermission("settings.manage");
  const text = body.trim();
  if (text.length < 50) return { error: "That looks too short to be the full document." };
  const [latest] = await db
    .select()
    .from(legalDocuments)
    .where(and(eq(legalDocuments.orgId, ctx.orgId), eq(legalDocuments.kind, kind)))
    .orderBy(desc(legalDocuments.version))
    .limit(1);
  if (latest && latest.body.trim() === text) return { error: "Nothing changed since the current version." };
  const version = (latest?.version ?? 0) + 1;
  const [doc] = await db.insert(legalDocuments).values({ orgId: ctx.orgId, kind, version, body: text, publishedAt: new Date() }).returning();
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "legal.publish", entityType: "legal_document", entityId: doc.id, metadata: { kind, version } });
  revalidatePath("/settings/legal");
  return { ok: `Version ${version} published. Clients will be asked to accept it next time they sign in.` };
}
