import { notFound } from "next/navigation";
import { and, asc, count, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { packages, phaseTemplates, taskTemplateDependencies, taskTemplates } from "@/db/schema";
import { getDraft, getEditableVersion } from "@/lib/packages";
import { requirePermission } from "@/lib/session";
import { TemplateEditor, type PhaseData, type TaskData } from "./template-editor";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("packages.manage");

  const [pkg] = await db.select().from(packages).where(and(eq(packages.id, id), eq(packages.orgId, ctx.orgId)));
  if (!pkg) notFound();

  const draft = await getDraft(pkg.id);
  const version = await getEditableVersion(pkg.id);

  const phases = version
    ? await db.select().from(phaseTemplates).where(eq(phaseTemplates.packageVersionId, version.id)).orderBy(asc(phaseTemplates.position))
    : [];
  const tasks = phases.length
    ? await db
        .select()
        .from(taskTemplates)
        .where(inArray(taskTemplates.phaseTemplateId, phases.map((p) => p.id)))
        .orderBy(asc(taskTemplates.position))
    : [];
  const deps = tasks.length
    ? await db.select().from(taskTemplateDependencies).where(inArray(taskTemplateDependencies.taskTemplateId, tasks.map((t) => t.id)))
    : [];

  // Other packages with a template, for "Copy from"
  const others = await db
    .select({ id: packages.id, key: packages.key, name: packages.name, versionId: packages.currentVersionId })
    .from(packages)
    .where(and(eq(packages.orgId, ctx.orgId), ne(packages.id, pkg.id), isNotNull(packages.currentVersionId)));
  const versionIds = others.map((o) => o.versionId!).filter(Boolean);
  const phaseCounts = versionIds.length
    ? await db
        .select({ versionId: phaseTemplates.packageVersionId, n: count() })
        .from(phaseTemplates)
        .where(inArray(phaseTemplates.packageVersionId, versionIds))
        .groupBy(phaseTemplates.packageVersionId)
    : [];
  const copySources = others
    .map((o) => ({ id: o.id, label: `${o.name} (${o.key})`, phases: phaseCounts.find((c) => c.versionId === o.versionId)?.n ?? 0 }))
    .filter((o) => o.phases > 0)
    .sort((a, b) => a.label.localeCompare(b.label));

  const phaseData: PhaseData[] = phases.map((p) => ({
    id: p.id,
    position: p.position,
    name: p.name,
    description: p.description ?? "",
    gate: p.gateApprover,
    revisionRounds: p.revisionRounds,
  }));
  const taskData: TaskData[] = tasks.map((t) => ({
    id: t.id,
    phaseId: t.phaseTemplateId,
    position: t.position,
    code: t.code,
    title: t.title,
    description: t.description ?? "",
    defaultRole: t.defaultRole ?? "worker",
    estimateMinutes: t.estimateMinutes,
    isClientVisible: t.isClientVisible,
    checklist: t.checklist,
    dependsOn: deps.filter((d) => d.taskTemplateId === t.id).map((d) => d.dependsOnTaskTemplateId),
  }));

  return (
    <TemplateEditor
      packageId={pkg.id}
      packageKey={pkg.key}
      isDraft={Boolean(draft)}
      versionLabel={version ? `v${version.version}` : ""}
      defaultRevisionRounds={version?.revisionRounds ?? 0}
      phases={phaseData}
      tasks={taskData}
      copySources={copySources}
    />
  );
}
