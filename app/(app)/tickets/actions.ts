"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull, max, or } from "drizzle-orm";
import { db } from "@/db";
import {
  commentMentions,
  comments,
  memberships,
  notifications,
  organizations,
  priorities,
  projectMembers,
  projectPhases,
  projects,
  ticketChecklistItems,
  ticketLinks,
  ticketStatuses,
  ticketTypes,
  tickets,
  users,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { nextTicketNumber, ticketKey } from "@/lib/keys";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { advancePhaseIfDone, ticketAccess } from "@/lib/tickets";

export type Result = { ok?: string; error?: string };
export type FormState = Result & { at?: number };

async function ctxOf() {
  const u = await requireUser();
  return { ...u, orgId: u.membership.orgId, role: u.membership.role as "admin" | "manager" | "worker" | "contractor" | "client" };
}

function refresh(key: string, projectId: string | null) {
  revalidatePath(`/tickets/${key}`);
  revalidatePath("/tickets");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

async function logTicket(
  ctx: Awaited<ReturnType<typeof ctxOf>>,
  t: { id: string; key: string },
  action: string,
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> },
  metadata?: Record<string, unknown>,
) {
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: `ticket.${action}`,
    entityType: "ticket",
    entityId: t.id,
    entityKey: t.key,
    changes,
    metadata,
  });
}

async function notify(orgId: string, recipientUserId: string, eventKey: string, title: string, ticket: { id: string; key: string }, body?: string) {
  await db.insert(notifications).values({ orgId, recipientUserId, eventKey, title, body: body ?? null, url: `/tickets/${ticket.key}`, ticketId: ticket.id });
}

// ---------------------------------------------------------------------------
// Ticket fields
// ---------------------------------------------------------------------------

export type TicketPatch = {
  title?: string;
  description?: string;
  statusId?: string;
  priorityId?: string;
  assigneeMembershipId?: string | null;
  dueDate?: string | null; // yyyy-mm-dd
  estimateHours?: string;
  isClientVisible?: boolean;
};

export async function updateTicket(ticketId: string, patch: TicketPatch): Promise<Result> {
  const ctx = await ctxOf();
  const access = await ticketAccess(ctx, { id: ticketId });
  if (!access) return { error: "Ticket not found." };
  const t = access.ticket;

  const set: Partial<typeof tickets.$inferInsert> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const note = (field: string, from: unknown, to: unknown) => {
    before[field] = from;
    after[field] = to;
  };

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return { error: "The title can't be empty." };
    if (title !== t.title) (set.title = title), note("title", t.title, title);
  }
  if (patch.description !== undefined) {
    const d = patch.description.trim() || null;
    if (d !== t.description) (set.description = d), note("description", t.description ? "(previous text)" : null, d ? "(updated)" : null);
  }

  let statusMessage: string | null = null;
  let newStatusCategory: string | null = null;
  if (patch.statusId !== undefined && patch.statusId !== t.statusId) {
    const [s] = await db.select().from(ticketStatuses).where(and(eq(ticketStatuses.id, patch.statusId), eq(ticketStatuses.orgId, ctx.orgId)));
    if (!s) return { error: "Unknown status." };
    const [old] = await db.select().from(ticketStatuses).where(eq(ticketStatuses.id, t.statusId));
    set.statusId = s.id;
    newStatusCategory = s.category;
    if (s.category === "done") (set.resolvedAt = new Date()), (set.closedAt = new Date());
    else if (s.category === "cancelled") set.closedAt = new Date();
    else (set.resolvedAt = null), (set.closedAt = null);
    note("status", old?.name, s.name);
  }
  if (patch.priorityId !== undefined && patch.priorityId !== t.priorityId) {
    const [p] = await db.select().from(priorities).where(and(eq(priorities.id, patch.priorityId), eq(priorities.orgId, ctx.orgId)));
    if (!p) return { error: "Unknown priority." };
    const [old] = await db.select().from(priorities).where(eq(priorities.id, t.priorityId));
    set.priorityId = p.id;
    note("priority", old?.name, p.name);
  }

  let newAssigneeUserId: string | null = null;
  if (patch.assigneeMembershipId !== undefined && patch.assigneeMembershipId !== t.assigneeMembershipId) {
    if (!access.canAssign) return { error: "You can't reassign tickets." };
    if (patch.assigneeMembershipId) {
      const [m] = await db
        .select({ m: memberships, name: users.name, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.id, patch.assigneeMembershipId), eq(memberships.orgId, ctx.orgId), eq(memberships.status, "active")));
      if (!m || m.m.role === "client") return { error: "Choose an active team member." };
      newAssigneeUserId = m.m.userId;
      note("assignee", t.assigneeMembershipId, m.name || m.email);
      // Assigning someone to a project ticket puts them on the project so they can see it.
      if (t.projectId) await db.insert(projectMembers).values({ projectId: t.projectId, membershipId: m.m.id }).onConflictDoNothing();
    } else {
      note("assignee", t.assigneeMembershipId, "Unassigned");
    }
    set.assigneeMembershipId = patch.assigneeMembershipId;
  }

  if (patch.dueDate !== undefined) {
    const due = patch.dueDate ? new Date(`${patch.dueDate}T23:59:59Z`) : null;
    if (patch.dueDate && Number.isNaN(due?.getTime())) return { error: "Check the due date." };
    set.dueAt = due;
    note("due", t.dueAt?.toISOString().slice(0, 10) ?? null, patch.dueDate || null);
  }
  if (patch.estimateHours !== undefined) {
    const h = patch.estimateHours.trim();
    const minutes = h === "" ? null : Math.round(Number(h) * 60);
    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0)) return { error: "Enter the estimate in hours." };
    set.estimateMinutes = minutes;
    note("estimate", t.estimateMinutes, minutes);
  }
  if (patch.isClientVisible !== undefined && patch.isClientVisible !== t.isClientVisible) {
    set.isClientVisible = patch.isClientVisible;
    note("clientVisible", t.isClientVisible, patch.isClientVisible);
  }

  if (Object.keys(set).length === 0) return { ok: "No changes." };

  await db.transaction(async (tx) => {
    await tx.update(tickets).set(set).where(eq(tickets.id, t.id));
    if (newStatusCategory && t.projectPhaseId) statusMessage = await advancePhaseIfDone(tx, t.projectPhaseId);
  });
  await logTicket(ctx, t, "update", { before, after });
  if (newAssigneeUserId && newAssigneeUserId !== ctx.user.id) {
    await notify(ctx.orgId, newAssigneeUserId, "ticket.assigned", `${ctx.user.name || ctx.user.email} assigned you ${t.key}`, t, t.title);
  }

  refresh(t.key, t.projectId);
  return { ok: statusMessage ?? "Saved." };
}

export async function deleteTicket(ticketId: string): Promise<Result> {
  const ctx = await ctxOf();
  const access = await ticketAccess(ctx, { id: ticketId });
  if (!access) return { error: "Ticket not found." };
  if (!access.canDelete) return { error: "You can't delete tickets." };
  const t = access.ticket;
  await db.update(tickets).set({ deletedAt: new Date(), deletedBy: ctx.user.id }).where(eq(tickets.id, t.id));
  await logTicket(ctx, t, "delete");
  refresh(t.key, t.projectId);
  redirect(t.projectId ? `/projects/${t.projectId}` : "/dashboard");
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export async function addChecklistItem(ticketId: string, label: string): Promise<Result> {
  const ctx = await ctxOf();
  const access = await ticketAccess(ctx, { id: ticketId });
  if (!access) return { error: "Ticket not found." };
  const text = label.trim();
  if (!text) return { error: "Type the item first." };
  const [{ top }] = await db.select({ top: max(ticketChecklistItems.position) }).from(ticketChecklistItems).where(eq(ticketChecklistItems.ticketId, ticketId));
  await db.insert(ticketChecklistItems).values({ orgId: ctx.orgId, ticketId, position: (top ?? 0) + 1, label: text });
  await logTicket(ctx, access.ticket, "checklist_add", undefined, { label: text });
  refresh(access.ticket.key, access.ticket.projectId);
  return { ok: "Added." };
}

async function checklistItemAccess(ctx: Awaited<ReturnType<typeof ctxOf>>, itemId: string) {
  const [item] = await db
    .select()
    .from(ticketChecklistItems)
    .where(and(eq(ticketChecklistItems.id, itemId), eq(ticketChecklistItems.orgId, ctx.orgId)));
  if (!item) return null;
  const access = await ticketAccess(ctx, { id: item.ticketId });
  return access ? { item, access } : null;
}

export async function toggleChecklistItem(itemId: string, done: boolean): Promise<Result> {
  const ctx = await ctxOf();
  const found = await checklistItemAccess(ctx, itemId);
  if (!found) return { error: "Item not found." };
  await db
    .update(ticketChecklistItems)
    .set({ doneAt: done ? new Date() : null, doneByUserId: done ? ctx.user.id : null })
    .where(eq(ticketChecklistItems.id, itemId));
  await logTicket(ctx, found.access.ticket, done ? "checklist_done" : "checklist_undone", undefined, { label: found.item.label });
  refresh(found.access.ticket.key, found.access.ticket.projectId);
  return {};
}

export async function deleteChecklistItem(itemId: string): Promise<Result> {
  const ctx = await ctxOf();
  const found = await checklistItemAccess(ctx, itemId);
  if (!found) return { error: "Item not found." };
  await db.delete(ticketChecklistItems).where(eq(ticketChecklistItems.id, itemId));
  await logTicket(ctx, found.access.ticket, "checklist_remove", undefined, { label: found.item.label });
  refresh(found.access.ticket.key, found.access.ticket.projectId);
  return { ok: "Removed." };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addComment(ticketId: string, body: string, visibility: "internal" | "client", mentionUserIds: string[]): Promise<Result> {
  const ctx = await ctxOf();
  const access = await ticketAccess(ctx, { id: ticketId });
  if (!access) return { error: "Ticket not found." };
  const text = body.trim();
  if (!text) return { error: "Write something first." };
  if (visibility === "client" && !access.ticket.isClientVisible)
    return { error: "This ticket is hidden from the client. Make it client-visible first, or post an internal comment." };

  // Only mention active team members in this org
  const mentionable = mentionUserIds.length
    ? await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.status, "active")))
    : [];
  const mentions = [...new Set(mentionUserIds)].filter((id) => mentionable.some((m) => m.userId === id) && id !== ctx.user.id);

  const [comment] = await db
    .insert(comments)
    .values({ orgId: ctx.orgId, ticketId, authorUserId: ctx.user.id, body: text, visibility })
    .returning();
  if (mentions.length > 0) {
    await db.insert(commentMentions).values(mentions.map((userId) => ({ commentId: comment.id, userId })));
    for (const userId of mentions) {
      await notify(ctx.orgId, userId, "ticket.mentioned", `${ctx.user.name || ctx.user.email} mentioned you on ${access.ticket.key}`, access.ticket, text.slice(0, 200));
    }
  }
  await logTicket(ctx, access.ticket, "comment", undefined, { commentId: comment.id, visibility });
  refresh(access.ticket.key, access.ticket.projectId);
  return { ok: visibility === "client" ? "Comment posted. The client can see it." : "Internal comment posted." };
}

export async function deleteComment(commentId: string): Promise<Result> {
  const ctx = await ctxOf();
  const [c] = await db.select().from(comments).where(and(eq(comments.id, commentId), eq(comments.orgId, ctx.orgId), isNull(comments.deletedAt)));
  if (!c) return { error: "Comment not found." };
  const access = await ticketAccess(ctx, { id: c.ticketId });
  if (!access) return { error: "Ticket not found." };
  if (c.authorUserId !== ctx.user.id && !access.canDelete) return { error: "You can only delete your own comments." };
  await db.update(comments).set({ deletedAt: new Date(), deletedBy: ctx.user.id }).where(eq(comments.id, c.id));
  await logTicket(ctx, access.ticket, "comment_delete", undefined, { commentId: c.id });
  refresh(access.ticket.key, access.ticket.projectId);
  return { ok: "Comment deleted." };
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export async function addLink(ticketId: string, otherKey: string, kind: "blocks" | "blocked_by" | "related" | "duplicate_of"): Promise<Result> {
  const ctx = await ctxOf();
  const access = await ticketAccess(ctx, { id: ticketId });
  if (!access) return { error: "Ticket not found." };
  const key = otherKey.trim().toUpperCase();
  const [other] = await db.select().from(tickets).where(and(eq(tickets.orgId, ctx.orgId), eq(tickets.key, key), isNull(tickets.deletedAt)));
  if (!other) return { error: `No ticket ${key}.` };
  if (other.id === ticketId) return { error: "A ticket can't link to itself." };

  const [from, to, dbKind] =
    kind === "blocked_by" ? [other.id, ticketId, "blocks" as const] : [ticketId, other.id, kind];
  await db.insert(ticketLinks).values({ orgId: ctx.orgId, fromTicketId: from, toTicketId: to, kind: dbKind, createdByUserId: ctx.user.id }).onConflictDoNothing();
  await logTicket(ctx, access.ticket, "link_add", undefined, { kind, other: other.key });
  refresh(access.ticket.key, access.ticket.projectId);
  revalidatePath(`/tickets/${other.key}`);
  return { ok: `Linked to ${other.key}.` };
}

export async function removeLink(linkId: string, fromTicketId: string): Promise<Result> {
  const ctx = await ctxOf();
  const access = await ticketAccess(ctx, { id: fromTicketId });
  if (!access) return { error: "Ticket not found." };
  const [link] = await db
    .select()
    .from(ticketLinks)
    .where(and(eq(ticketLinks.id, linkId), eq(ticketLinks.orgId, ctx.orgId), or(eq(ticketLinks.fromTicketId, fromTicketId), eq(ticketLinks.toTicketId, fromTicketId))));
  if (!link) return { error: "Link not found." };
  await db.delete(ticketLinks).where(eq(ticketLinks.id, link.id));
  await logTicket(ctx, access.ticket, "link_remove", undefined, { kind: link.kind });
  refresh(access.ticket.key, access.ticket.projectId);
  return { ok: "Link removed." };
}

// ---------------------------------------------------------------------------
// New ticket
// ---------------------------------------------------------------------------

export async function createTicket(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ctxOf();
  const fail = (error: string): FormState => ({ error, at: Date.now() });
  const title = String(formData.get("title") ?? "").trim();
  const typeId = String(formData.get("typeId") ?? "");
  const projectId = String(formData.get("projectId") ?? "") || null;
  const phaseId = String(formData.get("phaseId") ?? "") || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!title) return fail("Give the ticket a title.");
  if (ctx.role === "client") return fail("Not allowed.");

  const [type] = await db.select().from(ticketTypes).where(and(eq(ticketTypes.id, typeId), eq(ticketTypes.orgId, ctx.orgId)));
  if (!type) return fail("Choose a ticket type.");

  let clientId: string | null = null;
  if (projectId) {
    const [p] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.orgId, ctx.orgId)));
    if (!p) return fail("Project not found.");
    clientId = p.clientId;
    if (!(await can(ctx.orgId, ctx.role, "projects.view_all"))) {
      const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, p.id), eq(projectMembers.membershipId, ctx.membership.id)));
      if (!m) return fail("You're not on that project.");
    }
    if (phaseId) {
      const [ph] = await db.select().from(projectPhases).where(and(eq(projectPhases.id, phaseId), eq(projectPhases.projectId, p.id)));
      if (!ph) return fail("That phase isn't part of the project.");
    }
  }

  const statuses = await db.select().from(ticketStatuses).where(and(eq(ticketStatuses.orgId, ctx.orgId), eq(ticketStatuses.isActive, true))).orderBy(asc(ticketStatuses.sortOrder));
  const status = statuses.find((s) => s.isDefault) ?? statuses[0];
  const [priority] = await db.select().from(priorities).where(and(eq(priorities.orgId, ctx.orgId), eq(priorities.isDefault, true))).limit(1);
  const [anyPriority] = priority ? [priority] : await db.select().from(priorities).where(eq(priorities.orgId, ctx.orgId)).limit(1);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));

  const created = await db.transaction(async (tx) => {
    const n = await nextTicketNumber(tx, ctx.orgId);
    const [t] = await tx
      .insert(tickets)
      .values({
        orgId: ctx.orgId,
        number: n,
        key: ticketKey(org.keyPrefix, n),
        ticketTypeId: type.id,
        statusId: status.id,
        priorityId: anyPriority.id,
        title,
        description,
        source: "manual",
        clientId,
        projectId,
        projectPhaseId: phaseId,
        assigneeMembershipId: ctx.membership.id,
        reporterUserId: ctx.user.id,
      })
      .returning();
    return t;
  });

  await logTicket(ctx, created, "create", { after: { title, type: type.name } });
  refresh(created.key, projectId);
  redirect(`/tickets/${created.key}`);
}
