import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  packageVersions,
  packages,
  phaseTemplates,
  taskTemplateDependencies,
  taskTemplates,
} from "@/db/schema";

// How versioning works:
// - A package's current_version_id is the PUBLISHED version new projects use.
// - Edits go to a single DRAFT version (published_at is null), copied from the current one.
// - Publishing the draft makes it current. Running projects keep the version they started with.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getDraft(packageId: string) {
  const [draft] = await db
    .select()
    .from(packageVersions)
    .where(and(eq(packageVersions.packageId, packageId), isNull(packageVersions.publishedAt)))
    .limit(1);
  return draft ?? null;
}

export async function getCurrentVersion(packageId: string) {
  const [pkg] = await db.select().from(packages).where(eq(packages.id, packageId));
  if (!pkg?.currentVersionId) return null;
  const [v] = await db.select().from(packageVersions).where(eq(packageVersions.id, pkg.currentVersionId));
  return v ?? null;
}

/** The version being edited: the draft if there is one, otherwise the current version. */
export async function getEditableVersion(packageId: string) {
  return (await getDraft(packageId)) ?? (await getCurrentVersion(packageId));
}

/** Copies phases, tasks and dependencies from one version to another (inside a transaction). */
export async function copyTemplate(tx: Tx, orgId: string, fromVersionId: string, toVersionId: string) {
  const phases = await tx
    .select()
    .from(phaseTemplates)
    .where(eq(phaseTemplates.packageVersionId, fromVersionId))
    .orderBy(phaseTemplates.position);
  if (phases.length === 0) return;

  const taskIdMap = new Map<string, string>();
  for (const phase of phases) {
    const [newPhase] = await tx
      .insert(phaseTemplates)
      .values({
        orgId,
        packageVersionId: toVersionId,
        position: phase.position,
        name: phase.name,
        description: phase.description,
        gateApprover: phase.gateApprover,
        revisionRounds: phase.revisionRounds,
      })
      .returning();

    const tasks = await tx
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.phaseTemplateId, phase.id))
      .orderBy(taskTemplates.position);
    for (const t of tasks) {
      const [newTask] = await tx
        .insert(taskTemplates)
        .values({
          orgId,
          phaseTemplateId: newPhase.id,
          position: t.position,
          code: t.code,
          title: t.title,
          description: t.description,
          ticketTypeId: t.ticketTypeId,
          defaultRole: t.defaultRole,
          teamRoleId: t.teamRoleId,
          estimateMinutes: t.estimateMinutes,
          checklist: t.checklist,
          isClientVisible: t.isClientVisible,
        })
        .returning();
      taskIdMap.set(t.id, newTask.id);
    }
  }

  const oldIds = [...taskIdMap.keys()];
  if (oldIds.length === 0) return;
  const deps = await tx
    .select()
    .from(taskTemplateDependencies)
    .where(inArray(taskTemplateDependencies.taskTemplateId, oldIds));
  const copied = deps
    .filter((d) => taskIdMap.has(d.dependsOnTaskTemplateId))
    .map((d) => ({
      taskTemplateId: taskIdMap.get(d.taskTemplateId)!,
      dependsOnTaskTemplateId: taskIdMap.get(d.dependsOnTaskTemplateId)!,
    }));
  if (copied.length > 0) await tx.insert(taskTemplateDependencies).values(copied);
}

/** Returns the draft, creating it from the current version if needed. */
export async function ensureDraft(orgId: string, packageId: string, userId: string) {
  const existing = await getDraft(packageId);
  if (existing) return existing;

  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select()
      .from(packageVersions)
      .where(eq(packageVersions.packageId, packageId))
      .orderBy(desc(packageVersions.version))
      .limit(1);
    const [pkg] = await tx.select().from(packages).where(eq(packages.id, packageId));
    const [current] = pkg?.currentVersionId
      ? await tx.select().from(packageVersions).where(eq(packageVersions.id, pkg.currentVersionId))
      : [];

    const [draft] = await tx
      .insert(packageVersions)
      .values({
        orgId,
        packageId,
        version: (latest?.version ?? 0) + 1,
        revisionRounds: current?.revisionRounds ?? 2,
        responseTargetMinutes: current?.responseTargetMinutes ?? null,
        pickerAccess: current?.pickerAccess ?? "none",
        websiteDesignsOffered: current?.websiteDesignsOffered ?? null,
        logoConceptsPerBatch: current?.logoConceptsPerBatch ?? null,
        closeoutChecklist: current?.closeoutChecklist ?? [],
        createdByUserId: userId,
        publishedAt: null,
      })
      .returning();

    if (current) await copyTemplate(tx, orgId, current.id, draft.id);
    return draft;
  });
}

export const packageKey = (prefix: string, serviceLineCode: string, tierCode: string) =>
  `${prefix}-${serviceLineCode}-${tierCode}`;
