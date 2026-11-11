"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, packageVersions, packages, serviceLines, tiers } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ensureDraft, getDraft, packageKey } from "@/lib/packages";
import { requirePermission } from "@/lib/session";

export type FormState = { ok?: string; error?: string; at?: number };
export type ActionResult = { ok?: string; error?: string };

const done = (ok: string): FormState => ({ ok, at: Date.now() });
const failed = (error: string): FormState => ({ error, at: Date.now() });

async function packageInOrg(orgId: string, packageId: string) {
  const [pkg] = await db
    .select()
    .from(packages)
    .where(and(eq(packages.id, packageId), eq(packages.orgId, orgId)));
  return pkg ?? null;
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createPackage(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("packages.manage");
  const serviceLineId = String(formData.get("serviceLineId") ?? "");
  const tierId = String(formData.get("tierId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!serviceLineId || !tierId) return failed("Choose a service line and a tier.");

  const [sl] = await db.select().from(serviceLines).where(and(eq(serviceLines.id, serviceLineId), eq(serviceLines.orgId, ctx.orgId)));
  const [tier] = await db.select().from(tiers).where(and(eq(tiers.id, tierId), eq(tiers.orgId, ctx.orgId)));
  if (!sl || !tier) return failed("That service line or tier wasn't found.");

  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const key = packageKey(org.keyPrefix, sl.code, tier.code);
  const [exists] = await db.select({ id: packages.id }).from(packages).where(and(eq(packages.orgId, ctx.orgId), eq(packages.key, key)));
  if (exists) return failed(`${key} already exists.`);

  const pkgId = await db.transaction(async (tx) => {
    const [pkg] = await tx
      .insert(packages)
      .values({ orgId: ctx.orgId, key, serviceLineId: sl.id, tierId: tier.id, name: name || `${sl.name} ${tier.name}`, status: "draft" })
      .returning();
    const [v1] = await tx
      .insert(packageVersions)
      .values({ orgId: ctx.orgId, packageId: pkg.id, version: 1, createdByUserId: ctx.user.id, publishedAt: new Date() })
      .returning();
    await tx.update(packages).set({ currentVersionId: v1.id }).where(eq(packages.id, pkg.id));
    return pkg.id;
  });

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "package.create",
    entityType: "package",
    entityId: pkgId,
    entityKey: key,
  });
  revalidatePath("/packages");
  redirect(`/packages/${pkgId}`);
}

// ---------------------------------------------------------------------------
// General details (not versioned): name, description, price
// ---------------------------------------------------------------------------

export async function saveDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("packages.manage");
  const pkg = await packageInOrg(ctx.orgId, String(formData.get("packageId")));
  if (!pkg) return failed("Package not found.");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const price = num(formData.get("price"));
  if (!name) return failed("Give the package a name.");
  if (Number.isNaN(price) || (price !== null && price < 0)) return failed("Enter a valid price.");
  const priceCents = price === null ? null : Math.round(price * 100);

  await db.update(packages).set({ name, description, priceCents }).where(eq(packages.id, pkg.id));
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "package.update_details",
    entityType: "package",
    entityId: pkg.id,
    entityKey: pkg.key,
    changes: {
      before: { name: pkg.name, description: pkg.description, priceCents: pkg.priceCents },
      after: { name, description, priceCents },
    },
  });
  revalidatePath(`/packages/${pkg.id}`);
  revalidatePath("/packages");
  return done("Details saved.");
}

// ---------------------------------------------------------------------------
// Versioned settings: saved to the draft, live after Publish
// ---------------------------------------------------------------------------

export async function saveVersionSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePermission("packages.manage");
  const pkg = await packageInOrg(ctx.orgId, String(formData.get("packageId")));
  if (!pkg) return failed("Package not found.");

  const revisionRounds = num(formData.get("revisionRounds"));
  const responseHours = num(formData.get("responseHours"));
  const designsOffered = num(formData.get("websiteDesignsOffered"));
  const logoConcepts = num(formData.get("logoConceptsPerBatch"));
  const pickerAccess = String(formData.get("pickerAccess") ?? "none");
  const closeoutChecklist = String(formData.get("closeoutChecklist") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (revisionRounds === null || Number.isNaN(revisionRounds) || revisionRounds < 0 || revisionRounds > 20)
    return failed("Revision rounds must be between 0 and 20.");
  if (Number.isNaN(responseHours) || (responseHours !== null && responseHours <= 0)) return failed("Enter a valid response target.");
  if (!["none", "starter", "full"].includes(pickerAccess)) return failed("Choose website picker access.");
  if (Number.isNaN(designsOffered) || (designsOffered !== null && (designsOffered < 1 || designsOffered > 20)))
    return failed("Designs offered must be between 1 and 20.");
  if (Number.isNaN(logoConcepts) || (logoConcepts !== null && (logoConcepts < 1 || logoConcepts > 20)))
    return failed("Logo concepts must be between 1 and 20.");

  const draft = await ensureDraft(ctx.orgId, pkg.id, ctx.user.id);
  const values = {
    revisionRounds: Math.round(revisionRounds),
    responseTargetMinutes: responseHours === null ? null : Math.round(responseHours * 60),
    pickerAccess: pickerAccess as "none" | "starter" | "full",
    websiteDesignsOffered: pickerAccess === "none" ? null : designsOffered === null ? null : Math.round(designsOffered),
    logoConceptsPerBatch: logoConcepts === null ? null : Math.round(logoConcepts),
    closeoutChecklist,
  };
  await db.update(packageVersions).set(values).where(eq(packageVersions.id, draft.id));
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "package.update_draft_settings",
    entityType: "package_version",
    entityId: draft.id,
    entityKey: `${pkg.key}-v${draft.version}`,
    changes: { after: values },
  });
  revalidatePath(`/packages/${pkg.id}`);
  revalidatePath("/packages");
  return done(`Saved to draft v${draft.version}. Publish when you're ready.`);
}

// ---------------------------------------------------------------------------
// Publish / discard draft, change status
// ---------------------------------------------------------------------------

export async function publishDraft(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission("packages.manage");
  const pkg = await packageInOrg(ctx.orgId, String(formData.get("packageId")));
  if (!pkg) return { error: "Package not found." };
  const draft = await getDraft(pkg.id);
  if (!draft) return { error: "There are no unpublished changes." };

  const notes = String(formData.get("notes") ?? "").trim() || null;
  await db.transaction(async (tx) => {
    await tx.update(packageVersions).set({ publishedAt: new Date(), notes }).where(eq(packageVersions.id, draft.id));
    await tx.update(packages).set({ currentVersionId: draft.id }).where(eq(packages.id, pkg.id));
  });
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "package.publish",
    entityType: "package_version",
    entityId: draft.id,
    entityKey: `${pkg.key}-v${draft.version}`,
    metadata: { notes },
  });
  revalidatePath(`/packages/${pkg.id}`);
  revalidatePath("/packages");
  return { ok: `Published ${pkg.key}-v${draft.version}. New projects will use it.` };
}

export async function discardDraft(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission("packages.manage");
  const pkg = await packageInOrg(ctx.orgId, String(formData.get("packageId")));
  if (!pkg) return { error: "Package not found." };
  const draft = await getDraft(pkg.id);
  if (!draft) return { error: "There's no draft to discard." };

  await db.delete(packageVersions).where(eq(packageVersions.id, draft.id)); // phases and tasks cascade
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "package.discard_draft",
    entityType: "package",
    entityId: pkg.id,
    entityKey: `${pkg.key}-v${draft.version}`,
  });
  revalidatePath(`/packages/${pkg.id}`);
  revalidatePath("/packages");
  return { ok: "Draft discarded." };
}

export async function setPackageStatus(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission("packages.manage");
  const pkg = await packageInOrg(ctx.orgId, String(formData.get("packageId")));
  if (!pkg) return { error: "Package not found." };
  const status = String(formData.get("status")) as "draft" | "active" | "retired";
  if (!["draft", "active", "retired"].includes(status)) return { error: "Unknown status." };
  if (status === "active" && !pkg.currentVersionId) return { error: "Publish a version before activating." };

  await db.update(packages).set({ status }).where(eq(packages.id, pkg.id));
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: "package.status_change",
    entityType: "package",
    entityId: pkg.id,
    entityKey: pkg.key,
    changes: { before: { status: pkg.status }, after: { status } },
  });
  revalidatePath(`/packages/${pkg.id}`);
  revalidatePath("/packages");
  const label = { draft: "moved back to draft", active: "is now active and can be sold", retired: "is retired" }[status];
  return { ok: `${pkg.key} ${label}.` };
}
