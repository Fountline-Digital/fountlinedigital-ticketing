import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  assignmentRules,
  closeoutItems,
  organizations,
  packageVersions,
  packages,
  phaseTemplates,
  priorities,
  projectMembers,
  projectPhases,
  projects,
  serviceLines,
  taskTemplateDependencies,
  taskTemplates,
  ticketChecklistItems,
  ticketLinks,
  ticketStatuses,
  ticketTypes,
  tickets,
} from "@/db/schema";
import { nextNumber, nextTicketNumber, projectKey, ticketKey } from "@/lib/keys";
import { pickAssignee } from "@/lib/team-roles";

export class ProjectError extends Error {}

export type NewProjectInput = {
  orgId: string;
  clientId: string;
  packageId: string;
  name: string;
  startDate: string | null; // yyyy-mm-dd
  targetLaunchDate: string | null;
  createdByUserId: string;
  creatorMembershipId: string;
};

/**
 * Creates a project from a package's LIVE version:
 * project → phases (P1 active, rest locked) → one ticket per task (with checklist),
 * dependencies as "blocks" links, and the closeout checklist.
 * Everything happens in one transaction: it all exists or none of it does.
 */
export async function createProjectFromPackage(input: NewProjectInput) {
  const { orgId } = input;

  const [pkg] = await db.select().from(packages).where(and(eq(packages.id, input.packageId), eq(packages.orgId, orgId)));
  if (!pkg) throw new ProjectError("Package not found.");
  if (pkg.status !== "active") throw new ProjectError(`${pkg.key} isn't active. Activate it in Packages first.`);
  if (!pkg.currentVersionId) throw new ProjectError(`${pkg.key} has no published version.`);

  const [version] = await db.select().from(packageVersions).where(eq(packageVersions.id, pkg.currentVersionId));
  const [line] = await db.select().from(serviceLines).where(eq(serviceLines.id, pkg.serviceLineId));
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));

  const phases = await db
    .select()
    .from(phaseTemplates)
    .where(eq(phaseTemplates.packageVersionId, version.id))
    .orderBy(asc(phaseTemplates.position));
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

  // Lookups: statuses by category, default priority, project-task type, assignment rules
  const statuses = await db.select().from(ticketStatuses).where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.isActive, true))).orderBy(asc(ticketStatuses.sortOrder));
  const statusFor = (category: string) => statuses.find((s) => s.category === category) ?? statuses[0];
  const [priority] = await db
    .select()
    .from(priorities)
    .where(and(eq(priorities.orgId, orgId), eq(priorities.isDefault, true)))
    .limit(1);
  const [fallbackPriority] = priority ? [priority] : await db.select().from(priorities).where(eq(priorities.orgId, orgId)).limit(1);
  const [projectType] = await db
    .select()
    .from(ticketTypes)
    .where(and(eq(ticketTypes.orgId, orgId), eq(ticketTypes.kind, "project_task")))
    .limit(1);
  if (!statuses.length || !fallbackPriority || !projectType) throw new ProjectError("Ticket statuses, priorities or types are missing. Check Settings.");

  const rules = await db
    .select()
    .from(assignmentRules)
    .where(and(eq(assignmentRules.orgId, orgId), eq(assignmentRules.isActive, true), eq(assignmentRules.strategy, "fixed")));
  const ruleAssignee = (ticketTypeId: string | null) =>
    rules.find((r) => r.serviceLineId === line.id && r.ticketTypeId === ticketTypeId)?.assigneeMembershipId ??
    rules.find((r) => r.serviceLineId === line.id && !r.ticketTypeId)?.assigneeMembershipId ??
    null;

  // Who gets each task: an assignment rule if one matches, otherwise whoever has that
  // task's team role and the fewest open tickets (counting tickets planned for this project).
  const planned = new Map<string, number>();
  const assigneeByTask = new Map<string, string | null>();
  for (const t of tasks) {
    const typeId = t.ticketTypeId ?? projectType.id;
    assigneeByTask.set(t.id, ruleAssignee(typeId) ?? (await pickAssignee(orgId, t.teamRoleId, planned)));
  }

  const year2 = new Date().getFullYear() % 100;

  return db.transaction(async (tx) => {
    const seq = await nextNumber(tx, orgId, `project:${line.code}:${year2}`);
    const key = projectKey(org.keyPrefix, line.code, year2, seq);

    const [project] = await tx
      .insert(projects)
      .values({
        orgId,
        key,
        year: year2,
        sequence: seq,
        clientId: input.clientId,
        packageVersionId: version.id,
        serviceLineId: line.id,
        name: input.name,
        status: "active",
        startDate: input.startDate,
        targetLaunchDate: input.targetLaunchDate,
      })
      .returning();

    // The creator and everyone assigned a ticket are on the project team.
    const team = new Set([input.creatorMembershipId, ...[...assigneeByTask.values()].filter((v): v is string => Boolean(v))]);
    await tx
      .insert(projectMembers)
      .values([...team].map((membershipId) => ({ projectId: project.id, membershipId })))
      .onConflictDoNothing();

    const ticketByTask = new Map<string, string>();
    for (const [i, pt] of phases.entries()) {
      const gated = pt.gateApprover !== "none";
      const [phase] = await tx
        .insert(projectPhases)
        .values({
          orgId,
          projectId: project.id,
          phaseTemplateId: pt.id,
          position: pt.position,
          name: pt.name,
          status: i === 0 ? "active" : "locked",
          gateApprover: pt.gateApprover,
          revisionRoundsAllowed: gated ? (pt.revisionRounds ?? version.revisionRounds) : 0,
          startedAt: i === 0 ? new Date() : null,
        })
        .returning();

      for (const t of tasks.filter((x) => x.phaseTemplateId === pt.id)) {
        const n = await nextTicketNumber(tx, orgId);
        const typeId = t.ticketTypeId ?? projectType.id;
        const [ticket] = await tx
          .insert(tickets)
          .values({
            orgId,
            number: n,
            key: ticketKey(org.keyPrefix, n),
            ticketTypeId: typeId,
            statusId: statusFor(i === 0 ? "todo" : "new").id,
            priorityId: fallbackPriority.id,
            title: t.title,
            description: t.description,
            source: "template",
            clientId: input.clientId,
            projectId: project.id,
            projectPhaseId: phase.id,
            taskTemplateId: t.id,
            teamRoleId: t.teamRoleId,
            assigneeMembershipId: assigneeByTask.get(t.id) ?? null,
            reporterUserId: input.createdByUserId,
            estimateMinutes: t.estimateMinutes,
            isClientVisible: t.isClientVisible,
          })
          .returning();
        ticketByTask.set(t.id, ticket.id);

        if (t.checklist.length > 0) {
          await tx
            .insert(ticketChecklistItems)
            .values(t.checklist.map((label, j) => ({ orgId, ticketId: ticket.id, position: j + 1, label })));
        }
      }
    }

    const links = deps
      .filter((d) => ticketByTask.has(d.taskTemplateId) && ticketByTask.has(d.dependsOnTaskTemplateId))
      .map((d) => ({
        orgId,
        fromTicketId: ticketByTask.get(d.dependsOnTaskTemplateId)!,
        toTicketId: ticketByTask.get(d.taskTemplateId)!,
        kind: "blocks" as const,
        createdByUserId: input.createdByUserId,
      }));
    if (links.length > 0) await tx.insert(ticketLinks).values(links);

    if (version.closeoutChecklist.length > 0) {
      await tx
        .insert(closeoutItems)
        .values(version.closeoutChecklist.map((label, i) => ({ orgId, projectId: project.id, position: i + 1, label })));
    }

    return { project, ticketCount: ticketByTask.size, packageKey: `${pkg.key}-v${version.version}` };
  });
}
