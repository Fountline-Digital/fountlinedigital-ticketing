"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { files, organizations, websiteCollections, websiteDesignImages, websiteDesigns } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/session";
import { designKey } from "@/lib/website-picker";

export type Result = { ok?: string; error?: string };
const HEX = /^#[0-9a-f]{6}$/i;

async function ctxOf() {
  return requirePermission("packages.manage");
}

export async function createCollection(): Promise<Result> {
  const ctx = await ctxOf();
  const [m] = await db.select({ n: max(websiteCollections.number) }).from(websiteCollections).where(eq(websiteCollections.orgId, ctx.orgId));
  const number = (m?.n ?? 0) + 1;
  const [c] = await db
    .insert(websiteCollections)
    .values({ orgId: ctx.orgId, number, name: `Collection ${String(number).padStart(2, "0")}`, publishedAt: new Date() })
    .returning();
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "design.collection_create", entityType: "website_collection", entityId: c.id, metadata: { name: c.name } });
  revalidatePath("/designs");
  return { ok: `${c.name} created.` };
}

export async function createDesign(collectionId: string, name: string): Promise<Result> {
  const ctx = await ctxOf();
  const clean = name.trim().slice(0, 60);
  if (!clean) return { error: "Give the design a name." };
  const [c] = await db.select().from(websiteCollections).where(and(eq(websiteCollections.id, collectionId), eq(websiteCollections.orgId, ctx.orgId)));
  if (!c) return { error: "Collection not found." };
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const [m] = await db.select({ n: max(websiteDesigns.number) }).from(websiteDesigns).where(eq(websiteDesigns.collectionId, c.id));
  const number = (m?.n ?? 0) + 1;
  const [d] = await db
    .insert(websiteDesigns)
    .values({ orgId: ctx.orgId, collectionId: c.id, number, key: designKey(org.keyPrefix, c.number, number, clean), name: clean, status: "draft" })
    .returning();
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "design.create", entityType: "website_design", entityId: d.id, entityKey: d.key });
  redirect(`/designs/${d.id}`);
}

export type DesignInput = {
  name: string;
  description: string;
  previewUrl: string;
  pages: string; // comma separated
  fonts: string; // comma separated
  palettes: string; // one palette per line: #111111, #c0c0c0, #ffffff
  inStarterSet: boolean;
  inBusiness: boolean;
  status: "draft" | "active" | "hidden" | "retired";
};

const list = (s: string) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 30);

export async function updateDesign(id: string, input: DesignInput): Promise<Result> {
  const ctx = await ctxOf();
  const [d] = await db.select().from(websiteDesigns).where(and(eq(websiteDesigns.id, id), eq(websiteDesigns.orgId, ctx.orgId)));
  if (!d) return { error: "Design not found." };
  const name = input.name.trim();
  if (!name) return { error: "The name can't be empty." };
  let previewUrl = input.previewUrl.trim() || null;
  if (previewUrl) {
    if (!/^https?:\/\//i.test(previewUrl)) previewUrl = `https://${previewUrl}`;
    try {
      new URL(previewUrl);
    } catch {
      return { error: "Check the live preview link." };
    }
  }
  const palettes = input.palettes
    .split("\n")
    .map((line) => line.split(",").map((x) => x.trim()).filter(Boolean))
    .filter((p) => p.length > 0);
  if (palettes.some((p) => p.some((c) => !HEX.test(c)))) return { error: "Colors must be hex codes like #1a2b3c, separated by commas, one palette per line." };
  if (!["draft", "active", "hidden", "retired"].includes(input.status)) return { error: "Choose a status." };
  if (!input.inStarterSet && !input.inBusiness) return { error: "Tag it for Essentials, Business, or both." };

  const values = {
    name,
    description: input.description.trim() || null,
    previewUrl,
    pages: list(input.pages),
    styleOptions: { colorPalettes: palettes.slice(0, 12), fonts: list(input.fonts) },
    inStarterSet: input.inStarterSet,
    inBusiness: input.inBusiness,
    status: input.status,
  };
  await db.update(websiteDesigns).set(values).where(eq(websiteDesigns.id, d.id));
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "design.update",
    entityType: "website_design",
    entityId: d.id,
    entityKey: d.key,
    changes: { before: { status: d.status, inStarterSet: d.inStarterSet, inBusiness: d.inBusiness }, after: { status: values.status, inStarterSet: values.inStarterSet, inBusiness: values.inBusiness } },
  });
  revalidatePath(`/designs/${d.id}`);
  revalidatePath("/designs");
  return { ok: "Saved." };
}

/** Links an uploaded screenshot (uploaded with target { designId }) to the design. */
export async function addDesignImage(designId: string, fileId: string): Promise<Result> {
  const ctx = await ctxOf();
  const [d] = await db.select().from(websiteDesigns).where(and(eq(websiteDesigns.id, designId), eq(websiteDesigns.orgId, ctx.orgId)));
  const [f] = await db.select().from(files).where(and(eq(files.id, fileId), eq(files.orgId, ctx.orgId)));
  if (!d || !f) return { error: "Not found." };
  if (!f.mimeType.startsWith("image/")) return { error: "Screenshots must be images." };
  const [m] = await db.select({ n: max(websiteDesignImages.position) }).from(websiteDesignImages).where(eq(websiteDesignImages.designId, d.id));
  await db.insert(websiteDesignImages).values({ designId: d.id, fileId: f.id, position: (m?.n ?? -1) + 1 }).onConflictDoNothing();
  revalidatePath(`/designs/${d.id}`);
  return { ok: "Screenshot added." };
}

export async function removeDesignImage(designId: string, fileId: string): Promise<Result> {
  const ctx = await ctxOf();
  const [d] = await db.select().from(websiteDesigns).where(and(eq(websiteDesigns.id, designId), eq(websiteDesigns.orgId, ctx.orgId)));
  if (!d) return { error: "Not found." };
  await db.delete(websiteDesignImages).where(and(eq(websiteDesignImages.designId, d.id), eq(websiteDesignImages.fileId, fileId)));
  await db.update(files).set({ deletedAt: new Date(), deletedBy: ctx.user.id }).where(and(eq(files.id, fileId), eq(files.orgId, ctx.orgId)));
  revalidatePath(`/designs/${d.id}`);
  return { ok: "Screenshot removed." };
}

/** Makes the first screenshot the cover. */
export async function makeCover(designId: string, fileId: string): Promise<Result> {
  const ctx = await ctxOf();
  const [d] = await db.select().from(websiteDesigns).where(and(eq(websiteDesigns.id, designId), eq(websiteDesigns.orgId, ctx.orgId)));
  if (!d) return { error: "Not found." };
  const rows = await db.select().from(websiteDesignImages).where(eq(websiteDesignImages.designId, d.id));
  const order = [fileId, ...rows.map((r) => r.fileId).filter((id) => id !== fileId)];
  for (const [i, id] of order.entries()) {
    await db.update(websiteDesignImages).set({ position: i }).where(and(eq(websiteDesignImages.designId, d.id), eq(websiteDesignImages.fileId, id)));
  }
  revalidatePath(`/designs/${d.id}`);
  return { ok: "Cover updated." };
}
