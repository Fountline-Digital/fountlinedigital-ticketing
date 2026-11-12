import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { packageVersions, packages, phaseTemplates, taskTemplateDependencies, taskTemplates } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class TemplateError extends Error {}

/** The package's draft version, checked against the org. Throws if there's no draft. */
export async function requireDraft(orgId: string, packageId: string) {
  const [row] = await db
    .select({ pkg: packages, draft: packageVersions })
    .from(packages)
    .innerJoin(packageVersions, and(eq(packageVersions.packageId, packages.id), isNull(packageVersions.publishedAt)))
    .where(and(eq(packages.id, packageId), eq(packages.orgId, orgId)));
  if (!row) throw new TemplateError("Start editing first. The template is only changed in a draft.");
  return row;
}

/** A phase that belongs to the given draft version. */
export async function phaseInVersion(versionId: string, phaseId: string) {
  const [phase] = await db
    .select()
    .from(phaseTemplates)
    .where(and(eq(phaseTemplates.id, phaseId), eq(phaseTemplates.packageVersionId, versionId)));
  if (!phase) throw new TemplateError("That phase isn't part of this draft. Refresh the page.");
  return phase;
}

/** A task that belongs to the given draft version. */
export async function taskInVersion(versionId: string, taskId: string) {
  const [row] = await db
    .select({ task: taskTemplates })
    .from(taskTemplates)
    .innerJoin(phaseTemplates, eq(phaseTemplates.id, taskTemplates.phaseTemplateId))
    .where(and(eq(taskTemplates.id, taskId), eq(phaseTemplates.packageVersionId, versionId)));
  if (!row) throw new TemplateError("That task isn't part of this draft. Refresh the page.");
  return row.task;
}

/**
 * Rewrites positions (P1, P2...) and task codes (1.01, 1.02...) so they're always
 * gapless and in order. Positions are unique, so they're parked on negative
 * numbers first to avoid clashes mid-update.
 */
export async function renumber(tx: Tx, versionId: string, phaseOrder?: string[], taskOrder?: Map<string, string[]>) {
  const phases = await tx
    .select()
    .from(phaseTemplates)
    .where(eq(phaseTemplates.packageVersionId, versionId))
    .orderBy(asc(phaseTemplates.position));
  const orderedPhases = phaseOrder
    ? [...phaseOrder.map((id) => phases.find((p) => p.id === id)).filter((p) => p !== undefined), ...phases.filter((p) => !phaseOrder.includes(p.id))]
    : phases;

  for (const [i, p] of orderedPhases.entries()) {
    await tx.update(phaseTemplates).set({ position: -(i + 1) }).where(eq(phaseTemplates.id, p.id));
  }
  for (const [i, p] of orderedPhases.entries()) {
    await tx.update(phaseTemplates).set({ position: i + 1 }).where(eq(phaseTemplates.id, p.id));

    const tasks = await tx
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.phaseTemplateId, p.id))
      .orderBy(asc(taskTemplates.position));
    const wanted = taskOrder?.get(p.id);
    const orderedTasks = wanted
      ? [...wanted.map((id) => tasks.find((t) => t.id === id)).filter((t) => t !== undefined), ...tasks.filter((t) => !wanted.includes(t.id))]
      : tasks;

    for (const [j, t] of orderedTasks.entries()) {
      await tx.update(taskTemplates).set({ position: -(j + 1) }).where(eq(taskTemplates.id, t.id));
    }
    for (const [j, t] of orderedTasks.entries()) {
      await tx
        .update(taskTemplates)
        .set({ position: j + 1, code: `${i + 1}.${String(j + 1).padStart(2, "0")}` })
        .where(eq(taskTemplates.id, t.id));
    }
  }
}

/** True if making `taskId` depend on `dependsOn` would create a loop. */
export async function wouldCreateCycle(versionId: string, taskId: string, dependsOn: string[]) {
  const phases = await db.select({ id: phaseTemplates.id }).from(phaseTemplates).where(eq(phaseTemplates.packageVersionId, versionId));
  if (phases.length === 0) return false;
  const tasks = await db
    .select({ id: taskTemplates.id })
    .from(taskTemplates)
    .where(inArray(taskTemplates.phaseTemplateId, phases.map((p) => p.id)));
  const ids = tasks.map((t) => t.id);
  if (ids.length === 0) return false;
  const deps = await db.select().from(taskTemplateDependencies).where(inArray(taskTemplateDependencies.taskTemplateId, ids));

  const edges = new Map<string, string[]>();
  for (const d of deps) {
    if (d.taskTemplateId === taskId) continue; // replaced by the new list
    edges.set(d.taskTemplateId, [...(edges.get(d.taskTemplateId) ?? []), d.dependsOnTaskTemplateId]);
  }
  edges.set(taskId, dependsOn);

  // Walk from taskId's dependencies; reaching taskId again means a loop.
  const seen = new Set<string>();
  const stack = [...dependsOn];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (next === taskId) return true;
    if (seen.has(next)) continue;
    seen.add(next);
    stack.push(...(edges.get(next) ?? []));
  }
  return false;
}
