import "server-only";
import { and, asc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  files,
  organizations,
  packageVersions,
  projectDesignOffers,
  projectPhases,
  projects,
  websiteCollections,
  websiteDesignImages,
  websiteDesigns,
  websiteSelections,
} from "@/db/schema";

export type PickerAccess = "none" | "starter" | "full";

/** FDWD-01-04-Harbor */
export const designKey = (prefix: string, collection: number, number: number, name: string) =>
  `${prefix}WD-${String(collection).padStart(2, "0")}-${String(number).padStart(2, "0")}-${name.replace(/[^A-Za-z0-9]+/g, "").slice(0, 24) || "Design"}`;

/** What the project's package allows: who picks from what, and how many designs to offer. */
export async function pickerFor(projectId: string) {
  const [row] = await db
    .select({ access: packageVersions.pickerAccess, offered: packageVersions.websiteDesignsOffered, settings: organizations.settings })
    .from(projects)
    .innerJoin(packageVersions, eq(packageVersions.id, projects.packageVersionId))
    .innerJoin(organizations, eq(organizations.id, projects.orgId))
    .where(eq(projects.id, projectId));
  if (!row) return null;
  return { access: row.access as PickerAccess, maxOffers: row.offered ?? row.settings.defaultWebsiteDesignsOffered ?? 5 };
}

/** Designs the team may offer: active, and in the starter set for Essentials. */
export async function eligibleDesigns(orgId: string, access: PickerAccess) {
  if (access === "none") return [];
  return db
    .select({ d: websiteDesigns, collection: websiteCollections.number })
    .from(websiteDesigns)
    .innerJoin(websiteCollections, eq(websiteCollections.id, websiteDesigns.collectionId))
    .where(
      and(
        eq(websiteDesigns.orgId, orgId),
        eq(websiteDesigns.status, "active"),
        access === "starter" ? eq(websiteDesigns.inStarterSet, true) : eq(websiteDesigns.inBusiness, true),
      ),
    )
    .orderBy(asc(websiteCollections.number), asc(websiteDesigns.number));
}

/** Screenshot file ids per design, in order. */
export async function designImages(designIds: string[]) {
  if (designIds.length === 0) return new Map<string, string[]>();
  const rows = await db
    .select({ designId: websiteDesignImages.designId, fileId: websiteDesignImages.fileId })
    .from(websiteDesignImages)
    .innerJoin(files, eq(files.id, websiteDesignImages.fileId))
    .where(inArray(websiteDesignImages.designId, designIds))
    .orderBy(asc(websiteDesignImages.position));
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.designId, [...(map.get(r.designId) ?? []), r.fileId]);
  return map;
}

/** Offers for a project (with designs and screenshots) and the client's selection, if any. */
export async function projectPicker(projectId: string) {
  const offers = await db
    .select({ o: projectDesignOffers, d: websiteDesigns })
    .from(projectDesignOffers)
    .innerJoin(websiteDesigns, eq(websiteDesigns.id, projectDesignOffers.designId))
    .where(eq(projectDesignOffers.projectId, projectId))
    .orderBy(asc(projectDesignOffers.createdAt));
  const [selection] = await db.select().from(websiteSelections).where(eq(websiteSelections.projectId, projectId));
  const images = await designImages(offers.map((x) => x.d.id));
  return { offers: offers.map((x) => ({ ...x, images: images.get(x.d.id) ?? [] })), selection: selection ?? null };
}

/** The phase design work belongs to: one named like "Design", else the current one. */
export async function designPhase(projectId: string) {
  const [named] = await db
    .select()
    .from(projectPhases)
    .where(and(eq(projectPhases.projectId, projectId), ilike(projectPhases.name, "%design%")))
    .orderBy(asc(projectPhases.position))
    .limit(1);
  if (named) return named;
  const phases = await db.select().from(projectPhases).where(eq(projectPhases.projectId, projectId)).orderBy(asc(projectPhases.position));
  return phases.find((p) => p.status === "active") ?? phases[0] ?? null;
}
