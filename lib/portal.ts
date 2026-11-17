import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { clientContacts, clients, legalDocuments, organizations, projects, termsAcceptances, tickets } from "@/db/schema";
import { can, type Role } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

// Everything a client sees is scoped through PortalCtx.clientIds. Never query portal
// data without it.

export const PREVIEW_COOKIE = "portal_preview";

export type PortalCtx = {
  user: { id: string; name: string; email: string };
  membershipId: string;
  orgId: string;
  org: typeof organizations.$inferSelect;
  role: Role;
  contacts: { id: string; clientId: string; name: string; isApprover: boolean; isPrimary: boolean }[];
  clientIds: string[];
  /** Set when an admin is previewing as a contact: everything is read-only. */
  preview: { contactName: string; clientId: string } | null;
};

export class PortalError extends Error {}

const sign = (value: string) => createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "").update(`portal-preview:${value}`).digest("base64url");

/** Cookie value binding a preview to the admin who started it. */
export const previewCookieValue = (contactId: string, adminUserId: string) => `${contactId}.${adminUserId}.${sign(`${contactId}.${adminUserId}`)}`;

function readPreview(raw: string | undefined, userId: string) {
  if (!raw) return null;
  const [contactId, adminId, mac] = raw.split(".");
  if (!contactId || adminId !== userId || !mac) return null;
  const expected = Buffer.from(sign(`${contactId}.${adminId}`));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? contactId : null;
}

/** Terms/privacy versions this person still needs to accept (latest published of each kind). */
export async function pendingLegalDocs(orgId: string, userId: string) {
  const docs = await db
    .select()
    .from(legalDocuments)
    .where(and(eq(legalDocuments.orgId, orgId), isNotNull(legalDocuments.publishedAt)))
    .orderBy(desc(legalDocuments.version));
  const latest = (["terms", "privacy"] as const).map((k) => docs.find((d) => d.kind === k)).filter((d) => d !== undefined);
  if (latest.length === 0) return [];
  const accepted = await db
    .select({ documentId: termsAcceptances.documentId })
    .from(termsAcceptances)
    .where(and(eq(termsAcceptances.userId, userId), inArray(termsAcceptances.documentId, latest.map((d) => d.id))));
  return latest.filter((d) => !accepted.some((a) => a.documentId === d.id));
}

/**
 * The portal's front door: a signed-in client (with two-factor), or an admin previewing
 * as a client contact. Sends clients to /portal/terms until they've accepted the current terms.
 */
export async function requirePortal(opts: { skipTerms?: boolean } = {}): Promise<PortalCtx> {
  const { user, membership } = await requireUser();
  const role = membership.role as Role;
  const orgId = membership.orgId;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const base = { user: { id: user.id, name: user.name, email: user.email }, membershipId: membership.id, orgId, org, role };

  if (role !== "client") {
    const contactId = readPreview((await cookies()).get(PREVIEW_COOKIE)?.value, user.id);
    if (!contactId || !(await can(orgId, role, "settings.manage"))) redirect("/dashboard");
    const [c] = await db
      .select()
      .from(clientContacts)
      .where(and(eq(clientContacts.id, contactId), eq(clientContacts.orgId, orgId), isNull(clientContacts.deletedAt)));
    if (!c) redirect("/clients");
    const contact = { id: c.id, clientId: c.clientId, name: c.name, isApprover: c.isApprover, isPrimary: c.isPrimary };
    return { ...base, contacts: [contact], clientIds: [c.clientId], preview: { contactName: c.name, clientId: c.clientId } };
  }

  const rows = await db
    .select({ c: clientContacts })
    .from(clientContacts)
    .innerJoin(clients, eq(clients.id, clientContacts.clientId))
    .where(and(eq(clientContacts.userId, user.id), eq(clientContacts.orgId, orgId), isNull(clientContacts.deletedAt), isNull(clients.deletedAt)));
  const contacts = rows.map(({ c }) => ({ id: c.id, clientId: c.clientId, name: c.name, isApprover: c.isApprover, isPrimary: c.isPrimary }));

  if (!opts.skipTerms && (await pendingLegalDocs(orgId, user.id)).length > 0) redirect("/portal/terms");
  return { ...base, contacts, clientIds: [...new Set<string>(contacts.map((c) => c.clientId))], preview: null };
}

/** Same as requirePortal, for server actions: refuses previews and returns a plain error. */
export async function requirePortalWrite() {
  const ctx = await requirePortal();
  if (ctx.preview) throw new PortalError("This is a read-only preview.");
  return ctx;
}

/** Approvers (or the primary contact) can sign off for their company. */
export const canApprove = (ctx: PortalCtx, clientId: string) => ctx.contacts.some((c) => c.clientId === clientId && (c.isApprover || c.isPrimary));

export async function portalProject(ctx: PortalCtx, projectId: string) {
  if (ctx.clientIds.length === 0) return null;
  const [p] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, ctx.orgId), inArray(projects.clientId, ctx.clientIds), isNull(projects.deletedAt)));
  return p ?? null;
}

/** A ticket the client may see: client-visible, not deleted, and theirs. */
export async function portalTicket(ctx: PortalCtx, where: { id?: string; key?: string }) {
  if (ctx.clientIds.length === 0) return null;
  const [t] = await db
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.orgId, ctx.orgId),
        where.id ? eq(tickets.id, where.id) : eq(tickets.key, where.key ?? ""),
        eq(tickets.isClientVisible, true),
        inArray(tickets.clientId, ctx.clientIds),
        isNull(tickets.deletedAt),
      ),
    );
  return t ?? null;
}

/** Client users with a login for a client (who portal notifications go to). */
export async function clientUserIds(clientId: string | null, opts: { approversOnly?: boolean } = {}) {
  if (!clientId) return [];
  const rows = await db
    .select({ userId: clientContacts.userId, isApprover: clientContacts.isApprover, isPrimary: clientContacts.isPrimary })
    .from(clientContacts)
    .where(and(eq(clientContacts.clientId, clientId), isNull(clientContacts.deletedAt), isNotNull(clientContacts.userId)));
  return rows.filter((r) => !opts.approversOnly || r.isApprover || r.isPrimary).map((r) => r.userId as string);
}

export async function requestIp() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/** Portal display options (Settings > Portal later). */
export const portalOptions = (org: typeof organizations.$inferSelect) => ({
  showDueDates: org.settings.portal?.showDueDates ?? true,
  showAssigneeNames: org.settings.portal?.showAssigneeNames ?? false,
  welcomeMessage: org.settings.portal?.welcomeMessage ?? null,
  bannerMessage: org.settings.portal?.bannerMessage ?? null,
  supportEmail: org.settings.portal?.supportEmail ?? null,
  supportPhone: org.settings.portal?.supportPhone ?? null,
});
