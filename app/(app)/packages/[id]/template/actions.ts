"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import { packages, phaseTemplates, taskTemplateDependencies, taskTemplates, ticketTypes } from "@/db/schema";
import { audit } from "@/lib/audit";
import { copyTemplate, ensureDraft } from "@/lib/packages";
import { requirePermission, type UserContext } from "@/lib/session";
import { TemplateError, phaseInVersion, renumber, requireDraft, taskInVersion, wouldCreateCycle } from "@/lib/templates";

export type Result = { ok?: string; error?: string };

const GATES = ["none", "manager", "client", "both"] as const;
const ROLES = ["manager", "worker", "contractor"] as const;
type Gate = (typeof GATES)[number];
type TaskRole = (typeof ROLES)[number];

/** Runs a template change with permission check, draft lookup, audit and refresh. */
async function change(
  packageId: string,
  action: string,
  fn: (ctx: UserContext, draft: { id: string; version: number }, pkgKey: string) => Promise<string>,
): Promise<Result> {
  const ctx = await requirePermission("packages.manage");
  try {
    const { pkg, draft } = await requireDraft(ctx.orgId, packageId);
    const message = await fn(ctx, draft, pkg.key);
    await audit({
      orgId: ctx.orgId,
      actorUserId: ctx.user.id,
      actorRole: ctx.role,
      action: `template.${action}`,
      entityType: "package_version",
      entityId: draft.id,
      entityKey: `${pkg.key}-v${draft.version}`,
    });
    revalidatePath(`/packages/${packageId}/template`);
    revalidatePath(`/packages/${packageId}`);
    revalidatePath("/packages");
    return { ok: message };
  } catch (err) {
    if (err instanceof TemplateError) return { error: err.message };
    throw err;
  }
}

const clean = (v: unknown) => String(v ?? "").trim();

// ---------------------------------------------------------------------------

export async function startEditing(packageId: string): Promise<Result> {
  const ctx = await requirePermission("packages.manage");
  const [pkg] = await db.select().from(packages).where(and(eq(packages.id, packageId), eq(packages.orgId, ctx.orgId)));
  if (!pkg) return { error: "Package not found." };
  const draft = await ensureDraft(ctx.orgId, packageId, ctx.user.id);
  revalidatePath(`/packages/${packageId}/template`);
  revalidatePath(`/packages/${packageId}`);
  return { ok: `Editing draft v${draft.version}.` };
}

// ---- Phases ----------------------------------------------------------------

export async function addPhase(packageId: string, name: string): Promise<Result> {
  return change(packageId, "add_phase", async (ctx, draft) => {
    const n = clean(name);
    if (!n) throw new TemplateError("Give the phase a name.");
    const [{ top }] = await db
      .select({ top: max(phaseTemplates.position) })
      .from(phaseTemplates)
      .where(eq(phaseTemplates.packageVersionId, draft.id));
    await db.insert(phaseTemplates).values({ orgId: ctx.orgId, packageVersionId: draft.id, position: (top ?? 0) + 1, name: n });
    return `Added phase "${n}".`;
  });
}

export async function updatePhase(
  packageId: string,
  phaseId: string,
  input: { name: string; description: string; gate: string; revisionRounds: string },
): Promise<Result> {
  return change(packageId, "update_phase", async (_ctx, draft) => {
    await phaseInVersion(draft.id, phaseId);
    const name = clean(input.name);
    if (!name) throw new TemplateError("Give the phase a name.");
    if (!GATES.includes(input.gate as Gate)) throw new TemplateError("Choose who approves the phase.");
    const rounds = clean(input.revisionRounds);
    const revisionRounds = rounds === "" ? null : Number(rounds);
    if (revisionRounds !== null && (!Number.isInteger(revisionRounds) || revisionRounds < 0 || revisionRounds > 20))
      throw new TemplateError("Revision rounds must be a whole number from 0 to 20.");

    await db
      .update(phaseTemplates)
      .set({ name, description: clean(input.description) || null, gateApprover: input.gate as Gate, revisionRounds })
      .where(eq(phaseTemplates.id, phaseId));
    return "Phase saved.";
  });
}

export async function deletePhase(packageId: string, phaseId: string): Promise<Result> {
  return change(packageId, "delete_phase", async (_ctx, draft) => {
    const phase = await phaseInVersion(draft.id, phaseId);
    await db.transaction(async (tx) => {
      await tx.delete(phaseTemplates).where(eq(phaseTemplates.id, phaseId)); // tasks + their dependencies cascade
      await renumber(tx, draft.id);
    });
    return `Deleted phase "${phase.name}".`;
  });
}

export async function reorderPhases(packageId: string, orderedIds: string[]): Promise<Result> {
  return change(packageId, "reorder_phases", async (_ctx, draft) => {
    await db.transaction(async (tx) => renumber(tx, draft.id, orderedIds));
    return "Phase order saved.";
  });
}

// ---- Tasks -----------------------------------------------------------------

export async function addTask(packageId: string, phaseId: string, title: string): Promise<Result> {
  return change(packageId, "add_task", async (ctx, draft) => {
    await phaseInVersion(draft.id, phaseId);
    const t = clean(title);
    if (!t) throw new TemplateError("Give the task a title.");
    const [projectTask] = await db
      .select({ id: ticketTypes.id })
      .from(ticketTypes)
      .where(and(eq(ticketTypes.orgId, ctx.orgId), eq(ticketTypes.kind, "project_task")))
      .limit(1);
    const [{ top }] = await db
      .select({ top: max(taskTemplates.position) })
      .from(taskTemplates)
      .where(eq(taskTemplates.phaseTemplateId, phaseId));

    await db.transaction(async (tx) => {
      await tx.insert(taskTemplates).values({
        orgId: ctx.orgId,
        phaseTemplateId: phaseId,
        position: (top ?? 0) + 1,
        code: "0.00", // set by renumber
        title: t,
        ticketTypeId: projectTask?.id ?? null,
        defaultRole: "worker",
      });
      await renumber(tx, draft.id);
    });
    return `Added task "${t}".`;
  });
}

export async function updateTask(
  packageId: string,
  taskId: string,
  input: {
    title: string;
    description: string;
    phaseId: string;
    defaultRole: string;
    estimateHours: string;
    isClientVisible: boolean;
    checklist: string;
    dependsOn: string[];
  },
): Promise<Result> {
  return change(packageId, "update_task", async (_ctx, draft) => {
    const task = await taskInVersion(draft.id, taskId);
    await phaseInVersion(draft.id, input.phaseId);

    const title = clean(input.title);
    if (!title) throw new TemplateError("Give the task a title.");
    if (!ROLES.includes(input.defaultRole as TaskRole)) throw new TemplateError("Choose a default role.");
    const hours = clean(input.estimateHours);
    const estimateMinutes = hours === "" ? null : Math.round(Number(hours) * 60);
    if (estimateMinutes !== null && (!Number.isFinite(estimateMinutes) || estimateMinutes < 0))
      throw new TemplateError("Enter the estimate in hours, like 1.5.");

    const dependsOn = [...new Set(input.dependsOn)].filter((id) => id !== taskId);
    for (const id of dependsOn) await taskInVersion(draft.id, id);
    if (await wouldCreateCycle(draft.id, taskId, dependsOn))
      throw new TemplateError("Those dependencies would create a loop (tasks waiting on each other).");

    const checklist = input.checklist
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const moved = input.phaseId !== task.phaseTemplateId;

    await db.transaction(async (tx) => {
      let position = task.position;
      if (moved) {
        const [{ top }] = await tx
          .select({ top: max(taskTemplates.position) })
          .from(taskTemplates)
          .where(eq(taskTemplates.phaseTemplateId, input.phaseId));
        position = (top ?? 0) + 1;
      }
      await tx
        .update(taskTemplates)
        .set({
          title,
          description: clean(input.description) || null,
          phaseTemplateId: input.phaseId,
          position,
          defaultRole: input.defaultRole as TaskRole,
          estimateMinutes,
          isClientVisible: input.isClientVisible,
          checklist,
        })
        .where(eq(taskTemplates.id, taskId));

      await tx.delete(taskTemplateDependencies).where(eq(taskTemplateDependencies.taskTemplateId, taskId));
      if (dependsOn.length > 0) {
        await tx.insert(taskTemplateDependencies).values(dependsOn.map((d) => ({ taskTemplateId: taskId, dependsOnTaskTemplateId: d })));
      }
      if (moved) await renumber(tx, draft.id);
    });
    return "Task saved.";
  });
}

export async function deleteTask(packageId: string, taskId: string): Promise<Result> {
  return change(packageId, "delete_task", async (_ctx, draft) => {
    const task = await taskInVersion(draft.id, taskId);
    await db.transaction(async (tx) => {
      await tx.delete(taskTemplates).where(eq(taskTemplates.id, taskId));
      await renumber(tx, draft.id);
    });
    return `Deleted task "${task.title}".`;
  });
}

export async function reorderTasks(packageId: string, phaseId: string, orderedIds: string[]): Promise<Result> {
  return change(packageId, "reorder_tasks", async (_ctx, draft) => {
    await phaseInVersion(draft.id, phaseId);
    await db.transaction(async (tx) => renumber(tx, draft.id, undefined, new Map([[phaseId, orderedIds]])));
    return "Task order saved.";
  });
}

// ---- Copy from another package -----------------------------------------------

export async function replaceWithTemplateFrom(packageId: string, sourcePackageId: string): Promise<Result> {
  return change(packageId, "copy_from", async (ctx, draft) => {
    const [source] = await db
      .select()
      .from(packages)
      .where(and(eq(packages.id, sourcePackageId), eq(packages.orgId, ctx.orgId)));
    if (!source?.currentVersionId) throw new TemplateError("That package has no published template to copy.");
    if (source.id === packageId) throw new TemplateError("Pick a different package.");

    await db.transaction(async (tx) => {
      const existing = await tx.select({ id: phaseTemplates.id }).from(phaseTemplates).where(eq(phaseTemplates.packageVersionId, draft.id));
      if (existing.length > 0) {
        await tx.delete(phaseTemplates).where(inArray(phaseTemplates.id, existing.map((p) => p.id)));
      }
      await copyTemplate(tx, ctx.orgId, source.currentVersionId!, draft.id);
    });
    return `Copied the template from ${source.key}.`;
  });
}
