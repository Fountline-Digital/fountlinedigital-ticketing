"use server";
import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clientContacts, clients, leadStages, lostReasons, organizations, ticketStatuses, tickets } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createInvite } from "@/lib/invites";
import { clientKey } from "@/lib/keys";
import { canSeeLeads } from "@/lib/leads";
import { announce } from "@/lib/notify";
import { can, type Role } from "@/lib/permissions";
import { createProjectFromPackage, ProjectError } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { ticketAccess } from "@/lib/tickets";

export type Result = { ok?: string; error?: string; href?: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function ctxOf() {
  const u = await requireUser();
  return { ...u, orgId: u.membership.orgId, role: u.membership.role as Role };
}

async function leadFor(ctx: Awaited<ReturnType<typeof ctxOf>>, ticketId: string) {
  if (!(await canSeeLeads(ctx))) {
    const access = await ticketAccess(ctx, { id: ticketId });
    if (!access) return null;
  }
  const [t] = await db.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.orgId, ctx.orgId), isNull(tickets.deletedAt)));
  return t && t.leadStageId ? t : null;
}

/** Status to match a stage: Won -> done, Lost -> cancelled, open stages -> reopened. */
async function statusFor(orgId: string, kind: "open" | "won" | "lost") {
  const category = kind === "won" ? "done" : kind === "lost" ? "cancelled" : null;
  const rows = await db
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.isActive, true)))
    .orderBy(asc(ticketStatuses.sortOrder));
  return category ? rows.find((r) => r.category === category) : (rows.find((r) => r.category === "in_progress") ?? rows.find((r) => r.isDefault));
}

export async function setLeadStage(ticketId: string, stageId: string, lostReasonId: string | null = null): Promise<Result> {
  const ctx = await ctxOf();
  const t = await leadFor(ctx, ticketId);
  if (!t) return { error: "Lead not found." };
  const [stage] = await db.select().from(leadStages).where(and(eq(leadStages.id, stageId), eq(leadStages.orgId, ctx.orgId)));
  if (!stage) return { error: "Unknown stage." };
  if (stage.kind === "lost") {
    const [reason] = lostReasonId ? await db.select().from(lostReasons).where(and(eq(lostReasons.id, lostReasonId), eq(lostReasons.orgId, ctx.orgId))) : [];
    if (!reason) return { error: "Choose why it was lost." };
  }
  const [before] = t.leadStageId ? await db.select().from(leadStages).where(eq(leadStages.id, t.leadStageId)) : [];
  const status = await statusFor(ctx.orgId, stage.kind);
  const closing = stage.kind !== "open";
  await db
    .update(tickets)
    .set({
      leadStageId: stage.id,
      lostReasonId: stage.kind === "lost" ? lostReasonId : null,
      ...(status ? { statusId: status.id } : {}),
      resolvedAt: closing ? new Date() : null,
      closedAt: closing ? new Date() : null,
    })
    .where(eq(tickets.id, t.id));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "ticket.lead_stage", entityType: "ticket", entityId: t.id, entityKey: t.key, changes: { before: { stage: before?.name }, after: { stage: stage.name } } });
  revalidatePath("/leads");
  revalidatePath(`/tickets/${t.key}`);
  return { ok: `${t.key} moved to ${stage.name}.` };
}

export type ConvertInput = {
  clientName: string;
  code: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  packageId: string; // "" = client only, no project yet
  projectName: string;
  startDate: string;
  invite: boolean;
};

/**
 * One click from a won lead: the client and its main contact, a project from the
 * package's current version, a portal invite (which brings them to the intake
 * questionnaire), and the lead marked Won.
 */
export async function convertLead(ticketId: string, input: ConvertInput): Promise<Result> {
  const ctx = await ctxOf();
  if (!(await can(ctx.orgId, ctx.role, "clients.manage"))) return { error: "You can't create clients." };
  const t = await leadFor(ctx, ticketId);
  if (!t) return { error: "Lead not found." };
  if (t.clientId) return { error: "This lead was already converted." };

  const name = input.clientName.trim();
  const code = input.code.trim().toUpperCase();
  const email = input.contactEmail.trim().toLowerCase();
  if (!name) return { error: "Enter the client's name." };
  if (!/^[A-Z0-9]{2,6}$/.test(code)) return { error: "The code must be 2-6 letters or numbers, like ACME." };
  if (!EMAIL.test(email)) return { error: "Enter a valid contact email." };
  if (input.packageId && !(await can(ctx.orgId, ctx.role, "projects.manage"))) return { error: "You can't create projects. Convert without a package, and ask a manager to start the project." };
  if (input.packageId && !input.projectName.trim()) return { error: "Name the project." };

  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const [taken] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.orgId, ctx.orgId), eq(clients.code, code)));
  if (taken) return { error: `The code ${code} is already used. Try another.` };
  const [existingContact] = await db
    .select({ client: clients.name })
    .from(clientContacts)
    .innerJoin(clients, eq(clients.id, clientContacts.clientId))
    .where(and(eq(clientContacts.orgId, ctx.orgId), eq(clientContacts.email, email), isNull(clientContacts.deletedAt), isNull(clients.deletedAt)));
  if (existingContact) return { error: `${email} is already a contact of ${existingContact.client}. Start a project from that client instead.` };

  const client = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(clients)
      .values({ orgId: ctx.orgId, code, key: clientKey(org.keyPrefix, code), name, phone: input.contactPhone.trim() || null })
      .returning();
    await tx.insert(clientContacts).values({
      orgId: ctx.orgId,
      clientId: c.id,
      name: input.contactName.trim() || email,
      email,
      phone: input.contactPhone.trim() || null,
      isPrimary: true,
      isApprover: true,
    });
    return c;
  });
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "client.create", entityType: "client", entityId: client.id, entityKey: client.key, metadata: { fromLead: t.key } });

  let projectId: string | null = null;
  let projectNote = "";
  if (input.packageId) {
    try {
      const created = await createProjectFromPackage({
        orgId: ctx.orgId,
        clientId: client.id,
        packageId: input.packageId,
        name: input.projectName.trim(),
        startDate: /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ? input.startDate : null,
        targetLaunchDate: null,
        createdByUserId: ctx.user.id,
        creatorMembershipId: ctx.membership.id,
      });
      projectId = created.project.id;
      projectNote = ` Project ${created.project.key} created with ${created.ticketCount} tickets.`;
      await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "project.create", entityType: "project", entityId: created.project.id, entityKey: created.project.key, metadata: { client: client.key, package: created.packageKey, fromLead: t.key } });
    } catch (err) {
      projectNote = ` The client was created, but the project wasn't: ${err instanceof ProjectError ? err.message : "something went wrong"}`;
    }
  }

  let inviteNote = "";
  if (input.invite) {
    if (await can(ctx.orgId, ctx.role, "users.invite")) {
      const r = await createInvite(ctx, { email, role: "client", clientId: client.id, contact: { name: input.contactName.trim(), isPrimary: true, isApprover: true, isBilling: false } });
      inviteNote = r.ok ? ` Portal invite sent to ${email}.` : ` ${r.error}`;
    } else inviteNote = " You can't send invites, so ask an admin to invite them.";
  }

  // Mark the lead Won and link it to the new client
  const [won] = await db.select().from(leadStages).where(and(eq(leadStages.orgId, ctx.orgId), eq(leadStages.kind, "won"))).orderBy(asc(leadStages.sortOrder)).limit(1);
  const done = await statusFor(ctx.orgId, "won");
  await db
    .update(tickets)
    .set({ clientId: client.id, ...(won ? { leadStageId: won.id } : {}), ...(done ? { statusId: done.id } : {}), resolvedAt: new Date(), closedAt: new Date() })
    .where(eq(tickets.id, t.id));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "lead.convert", entityType: "ticket", entityId: t.id, entityKey: t.key, metadata: { client: client.key, projectId } });
  announce(ctx.orgId, "lead.won", { title: `Lead won: ${client.name}`, body: `${t.key} became ${client.key}.${projectNote}`, url: projectId ? `/projects/${projectId}` : `/clients/${client.id}` });

  revalidatePath("/leads");
  revalidatePath("/clients");
  revalidatePath(`/tickets/${t.key}`);
  return { ok: `${client.name} is now a client.${projectNote}${inviteNote}`, href: projectId ? `/projects/${projectId}` : `/clients/${client.id}` };
}
