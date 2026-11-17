"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { changeRequests, clientContacts, comments, memberships, projectPhases, termsAcceptances, ticketStatuses, tickets } from "@/db/schema";
import { audit } from "@/lib/audit";
import { approveChangeRequest, ChangeRequestError } from "@/lib/change-requests";
import { announce, notify } from "@/lib/notify";
import { can, type Role } from "@/lib/permissions";
import { decide } from "@/lib/phases";
import {
  canApprove,
  pendingLegalDocs,
  PortalError,
  portalProject,
  portalTicket,
  PREVIEW_COOKIE,
  previewCookieValue,
  requestIp,
  requirePortal,
  requirePortalWrite,
} from "@/lib/portal";
import { requireUser } from "@/lib/session";

export type Result = { ok?: string; error?: string };

async function guarded(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PortalError || err instanceof ChangeRequestError) return { error: err.message };
    throw err;
  }
}

/** Admins and managers, plus the assignee/reporter where given, hear what the client did. */
async function tellTeam(orgId: string, title: string, body: string | null, url: string, extra: (string | null)[] = []) {
  const managers = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, "active"), inArray(memberships.role, ["admin", "manager"])));
  const ids = extra.filter((id): id is string => Boolean(id));
  const staff = ids.length
    ? await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.orgId, orgId), eq(memberships.status, "active"), inArray(memberships.userId, ids), inArray(memberships.role, ["admin", "manager", "worker", "contractor"])))
    : [];
  await notify(db, { orgId, userIds: [...managers, ...staff].map((m) => m.userId), eventKey: "client.activity", title, body, url });
  announce(orgId, "client.activity", { title, body, url });
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export async function replyToTicket(ticketId: string, body: string): Promise<Result> {
  return guarded(async () => {
    const ctx = await requirePortalWrite();
    const t = await portalTicket(ctx, { id: ticketId });
    if (!t) return { error: "Request not found." };
    const text = body.trim();
    if (!text) return { error: "Write a message first." };
    if (text.length > 10_000) return { error: "That message is too long." };

    await db.insert(comments).values({ orgId: ctx.orgId, ticketId: t.id, authorUserId: ctx.user.id, body: text, visibility: "client" });
    // A reply on something waiting for the client puts it back in the team's queue
    const [status] = await db.select().from(ticketStatuses).where(eq(ticketStatuses.id, t.statusId));
    if (status?.category === "waiting") {
      const [active] = await db
        .select()
        .from(ticketStatuses)
        .where(and(eq(ticketStatuses.orgId, ctx.orgId), eq(ticketStatuses.category, "in_progress"), eq(ticketStatuses.isActive, true)))
        .orderBy(asc(ticketStatuses.sortOrder))
        .limit(1);
      if (active) await db.update(tickets).set({ statusId: active.id }).where(eq(tickets.id, t.id));
    } else {
      await db.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, t.id));
    }
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: "client", action: "ticket.comment", entityType: "ticket", entityId: t.id, entityKey: t.key, metadata: { visibility: "client", fromPortal: true } });

    const [assignee] = t.assigneeMembershipId ? await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.id, t.assigneeMembershipId)) : [];
    await tellTeam(ctx.orgId, `${ctx.user.name || ctx.user.email} replied on ${t.key}`, text.slice(0, 300), `/tickets/${t.key}`, [assignee?.userId ?? null, t.reporterUserId]);
    revalidatePath(`/portal/tickets/${t.key}`);
    return { ok: "Reply sent." };
  });
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export async function decidePhase(phaseId: string, approve: boolean, comment: string): Promise<Result> {
  return guarded(async () => {
    const ctx = await requirePortalWrite();
    const [phase] = await db.select().from(projectPhases).where(and(eq(projectPhases.id, phaseId), eq(projectPhases.orgId, ctx.orgId)));
    const project = phase ? await portalProject(ctx, phase.projectId) : null;
    if (!phase || !project) return { error: "Not found." };
    if (!canApprove(ctx, project.clientId)) return { error: "Only your company's approvers can sign off. Ask your main contact, or let us know who should approve." };
    const note = comment.trim() || null;
    if (!approve && !note) return { error: "Tell us what you'd like changed." };

    let r: Awaited<ReturnType<typeof decide>>;
    try {
      r = await decide({ phaseId, kind: "client", approve, comment: note, userId: ctx.user.id, orgPrefix: ctx.org.keyPrefix });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Couldn't save your decision." };
    }
    await audit({
      orgId: ctx.orgId,
      actorUserId: ctx.user.id,
      actorRole: "client",
      action: approve ? "phase.approve" : "phase.request_changes",
      entityType: "project",
      entityId: project.id,
      entityKey: project.key,
      metadata: { phase: `P${phase.position} ${phase.name}`, approver: "client", fromPortal: true, comment: note },
    });
    await tellTeam(
      ctx.orgId,
      `${ctx.user.name || ctx.user.email} ${approve ? "approved" : "requested changes to"} ${project.key} P${phase.position} ${phase.name}`,
      note,
      `/projects/${project.id}`,
    );
    if (r.completed) announce(ctx.orgId, "phase.approved", { title: `${project.key}: P${phase.position} ${phase.name} approved by the client`, body: r.message, url: `/projects/${project.id}` });
    revalidatePath(`/portal/projects/${project.id}`);
    revalidatePath("/portal");
    if (approve) return { ok: r.completed ? `Thanks! ${phase.name} is approved and the next step has started.` : "Thanks! Your approval is recorded." };
    return { ok: r.overLimit ? "Thanks. Those changes go beyond the included revisions, so we'll send you a change request to review." : "Thanks. We've got your notes and will get started on the changes." };
  });
}

export async function decideChangeRequest(crId: string, approve: boolean, comment: string): Promise<Result> {
  return guarded(async () => {
    const ctx = await requirePortalWrite();
    const [cr] = await db.select().from(changeRequests).where(and(eq(changeRequests.id, crId), eq(changeRequests.orgId, ctx.orgId)));
    const project = cr ? await portalProject(ctx, cr.projectId) : null;
    if (!cr || !project) return { error: "Not found." };
    if (cr.status !== "pending_client") return { error: "This change request isn't waiting on you." };
    if (!canApprove(ctx, project.clientId)) return { error: "Only your company's approvers can approve change requests." };
    const note = comment.trim() || null;

    if (approve) {
      await db.transaction((tx) => approveChangeRequest(tx, cr.id, ctx.user.id, ctx.org.keyPrefix, note));
    } else {
      await db
        .update(changeRequests)
        .set({ status: "declined", decidedByUserId: ctx.user.id, decidedAt: new Date(), decisionComment: note })
        .where(eq(changeRequests.id, cr.id));
    }
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: "client", action: `change_request.${approve ? "approve" : "decline"}`, entityType: "change_request", entityId: cr.id, entityKey: cr.key, metadata: { projectId: cr.projectId, fromPortal: true, comment: note } });
    const title = `${ctx.user.name || ctx.user.email} ${approve ? "approved" : "declined"} ${cr.key}`;
    await tellTeam(ctx.orgId, title, [cr.title, note].filter(Boolean).join(" · "), `/projects/${project.id}`, [cr.requestedByUserId]);
    announce(ctx.orgId, "change_request.decided", { title, body: cr.title, url: `/projects/${project.id}` });
    revalidatePath(`/portal/projects/${project.id}`);
    revalidatePath("/portal");
    return { ok: approve ? "Approved. We'll get started." : "Declined. Thanks for letting us know." };
  });
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

export async function acceptTerms(documentIds: string[]): Promise<Result> {
  const ctx = await requirePortal({ skipTerms: true });
  if (ctx.preview) return { error: "This is a read-only preview." };
  const pending = await pendingLegalDocs(ctx.orgId, ctx.user.id);
  if (pending.some((d) => !documentIds.includes(d.id))) return { error: "Please accept both documents." };
  const ip = await requestIp();
  for (const d of pending) {
    await db.insert(termsAcceptances).values({ orgId: ctx.orgId, userId: ctx.user.id, documentId: d.id, ipAddress: ip });
    await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: "client", action: "legal.accept", entityType: "legal_document", entityId: d.id, metadata: { kind: d.kind, version: d.version }, ipAddress: ip });
  }
  redirect("/portal");
}

// ---------------------------------------------------------------------------
// View as client (admins)
// ---------------------------------------------------------------------------

export async function startPreview(contactId: string): Promise<Result> {
  const { user, membership } = await requireUser();
  const role = membership.role as Role;
  if (!(await can(membership.orgId, role, "settings.manage"))) return { error: "Only admins can preview the portal." };
  const [c] = await db
    .select()
    .from(clientContacts)
    .where(and(eq(clientContacts.id, contactId), eq(clientContacts.orgId, membership.orgId), isNull(clientContacts.deletedAt)));
  if (!c) return { error: "Contact not found." };
  (await cookies()).set(PREVIEW_COOKIE, previewCookieValue(c.id, user.id), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 3600 });
  await audit({ orgId: membership.orgId, actorUserId: user.id, actorRole: role, action: "portal.preview_start", entityType: "client_contact", entityId: c.id, metadata: { name: c.name, clientId: c.clientId } });
  redirect("/portal");
}

export async function stopPreview() {
  const { user, membership } = await requireUser();
  const jar = await cookies();
  const had = jar.get(PREVIEW_COOKIE);
  jar.delete(PREVIEW_COOKIE);
  const [contactClient] = had ? await db.select({ clientId: clientContacts.clientId }).from(clientContacts).where(eq(clientContacts.id, had.value.split(".")[0] ?? "")) : [];
  if (had) await audit({ orgId: membership.orgId, actorUserId: user.id, actorRole: membership.role, action: "portal.preview_end" });
  redirect(contactClient ? `/clients/${contactClient.clientId}` : "/clients");
}

