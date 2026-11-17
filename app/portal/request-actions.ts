"use server";
import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { memberships, priorities, projectPhases, requestForms, teamRoles, ticketStatuses, ticketTypes, tickets } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createChangeRequest } from "@/lib/change-requests";
import { answersToText, validateAnswers, type Field } from "@/lib/forms";
import { nextTicketNumber, ticketKey } from "@/lib/keys";
import { announce, notify } from "@/lib/notify";
import { PortalError, portalProject, requirePortalWrite } from "@/lib/portal";
import { responseDueFor } from "@/lib/response-targets";
import { pickAssignee } from "@/lib/team-roles";
import { assignByRule } from "@/lib/assignment";

export type SubmitResult = {
  error?: string;
  errors?: Record<string, string>;
  ok?: string;
  ticket?: { id: string; key: string };
  projectId?: string; // where files go for a change request
  href?: string;
};

async function teamUserIds(orgId: string, extraMembershipId: string | null) {
  const rows = await db
    .select({ userId: memberships.userId, id: memberships.id, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, "active"), inArray(memberships.role, ["admin", "manager", "worker", "contractor"])));
  return rows.filter((r) => r.role === "admin" || r.role === "manager" || r.id === extraMembershipId).map((r) => r.userId);
}

/**
 * A client submits a portal request form. Support-type forms become a client-visible
 * ticket routed to Support; change-request forms become a draft change request the team
 * prices and sends back. File fields are uploaded right after, by the browser.
 */
export async function submitRequest(
  formId: string,
  projectId: string | null,
  values: Record<string, unknown>,
  attachments: Record<string, string[]>, // file field key -> chosen file names
): Promise<SubmitResult> {
  try {
    const ctx = await requirePortalWrite();
    const [form] = await db.select().from(requestForms).where(and(eq(requestForms.id, formId), eq(requestForms.orgId, ctx.orgId), eq(requestForms.isActive, true)));
    if (!form) return { error: "That form isn't available." };
    const [type] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, form.ticketTypeId));
    if (!type) return { error: "That form isn't set up correctly. Please contact us." };

    const project = projectId ? await portalProject(ctx, projectId) : null;
    if (projectId && !project) return { error: "Project not found." };
    const isCR = type.kind === "change_request";
    if (isCR && !project) return { error: "Choose which project the change is for." };
    if (!project && ctx.clientIds.length === 0) return { error: "Your account isn't linked to a company yet." };

    const fields = form.fields as Field[];
    const { clean, errors, ok } = validateAnswers(
      fields.filter((f) => f.kind !== "file"),
      values,
    );
    for (const f of fields.filter((f) => f.kind === "file" && f.required)) {
      if (!(attachments[f.key]?.length > 0)) errors[f.key] = "Attach at least one file.";
    }
    if (!ok || Object.keys(errors).length) return { error: "Check the highlighted fields.", errors };

    const firstText = fields.find((f) => f.kind === "short_text" && typeof clean[f.key] === "string");
    const title = ((firstText && (clean[firstText.key] as string)) || form.name).slice(0, 200);
    const fileLines = fields
      .filter((f) => f.kind === "file" && attachments[f.key]?.length)
      .map((f) => `${f.label}: ${attachments[f.key].map((n) => n.slice(0, 120)).join(", ")} (attached)`);
    const description = [answersToText(fields.filter((f) => f.kind !== "file"), clean), ...fileLines].filter(Boolean).join("\n\n");
    const who = ctx.user.name || ctx.user.email;

    if (isCR) {
      const [activePhase] = await db
        .select()
        .from(projectPhases)
        .where(and(eq(projectPhases.projectId, project!.id), inArray(projectPhases.status, ["active", "awaiting_approval"])))
        .orderBy(asc(projectPhases.position))
        .limit(1);
      const cr = await db.transaction((tx) =>
        createChangeRequest(tx, {
          orgId: ctx.orgId,
          projectId: project!.id,
          title,
          description,
          projectPhaseId: activePhase?.id ?? null,
          teamRoleId: null,
          priceCents: null,
          estimateMinutes: null,
          requestedByUserId: ctx.user.id,
        }),
      );
      await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: "client", action: "change_request.create", entityType: "change_request", entityId: cr.id, entityKey: cr.key, metadata: { projectId: project!.id, fromPortal: true, form: form.name } });
      const msg = { title: `${who} requested a change: ${cr.key}`, body: title, url: `/projects/${project!.id}` };
      await notify(db, { orgId: ctx.orgId, userIds: await teamUserIds(ctx.orgId, null), eventKey: "client.activity", ...msg });
      announce(ctx.orgId, "client.activity", msg);
      revalidatePath(`/portal/projects/${project!.id}`);
      return { ok: "Thanks! We'll review your change request and send you a price to approve.", projectId: project!.id, href: `/portal/projects/${project!.id}#changes` };
    }

    // Ticket: default status/priority ("Site is down"-style answers get Urgent), routed to Support
    const statuses = await db
      .select()
      .from(ticketStatuses)
      .where(and(eq(ticketStatuses.orgId, ctx.orgId), eq(ticketStatuses.isActive, true)))
      .orderBy(asc(ticketStatuses.sortOrder));
    const status = statuses.find((s) => s.isDefault) ?? statuses[0];
    const prios = await db.select().from(priorities).where(and(eq(priorities.orgId, ctx.orgId), eq(priorities.isActive, true))).orderBy(asc(priorities.sortOrder));
    const urgentAnswer = Object.values(clean).some((v) => typeof v === "string" && /site is down|urgent|emergency/i.test(v));
    const priority = (urgentAnswer && prios.find((p) => /urgent/i.test(p.name))) || prios.find((p) => p.isDefault) || prios[0];
    if (!status || !priority) return { error: "Requests aren't set up yet. Please contact us." };
    const [support] = await db.select().from(teamRoles).where(and(eq(teamRoles.orgId, ctx.orgId), eq(teamRoles.key, "support"), eq(teamRoles.isActive, true)));
    const assignee =
      (await assignByRule(ctx.orgId, { serviceLineId: project?.serviceLineId ?? null, ticketTypeId: type.id })) ?? (await pickAssignee(ctx.orgId, support?.id ?? null));
    const responseDueAt = await responseDueFor(ctx.orgId, type.kind, project?.id ?? null);

    const t = await db.transaction(async (tx) => {
      const n = await nextTicketNumber(tx, ctx.orgId);
      const [row] = await tx
        .insert(tickets)
        .values({
          orgId: ctx.orgId,
          number: n,
          key: ticketKey(ctx.org.keyPrefix, n),
          ticketTypeId: type.id,
          statusId: status.id,
          priorityId: priority.id,
          title,
          description,
          source: "portal",
          clientId: project?.clientId ?? ctx.clientIds[0],
          projectId: project?.id ?? null,
          teamRoleId: support?.id ?? null,
          assigneeMembershipId: assignee,
          reporterUserId: ctx.user.id,
          isClientVisible: true,
          formData: { form: form.name, ...clean },
          responseDueAt,
        })
        .returning();
      return row;
    });
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: "client", action: "ticket.create", entityType: "ticket", entityId: t.id, entityKey: t.key, metadata: { fromPortal: true, form: form.name, priority: priority.name } });
    const msg = { title: `${who} submitted ${t.key}: ${title}`, body: `${form.name} · ${priority.name}`, url: `/tickets/${t.key}` };
    await notify(db, { orgId: ctx.orgId, userIds: await teamUserIds(ctx.orgId, assignee), eventKey: "client.activity", ticketId: t.id, ...msg });
    announce(ctx.orgId, "ticket.created", msg);
    revalidatePath("/portal/tickets");
    return { ok: `Thanks! We've got it (${t.key}).`, ticket: { id: t.id, key: t.key }, href: `/portal/tickets/${t.key}` };
  } catch (err) {
    if (err instanceof PortalError) return { error: err.message };
    throw err;
  }
}

