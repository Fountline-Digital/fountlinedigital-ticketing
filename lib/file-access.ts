import "server-only";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { clientContacts, clients, files, organizations, projectDesignOffers, projectMembers, projects, tickets, users, websiteDesignImages, websiteDesigns } from "@/db/schema";
import { can } from "@/lib/permissions";
import type { UserContext } from "@/lib/session";
import { ticketAccess } from "@/lib/tickets";

export type FileCtx = Pick<UserContext, "orgId" | "role" | "membership" | "user">;
export type FileTarget = { ticketId?: string; projectId?: string; designId?: string };

export async function canSeeProject(ctx: FileCtx, projectId: string) {
  if (ctx.role === "client") return false;
  if (await can(ctx.orgId, ctx.role, "projects.view_all")) return true;
  const [m] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.membershipId, ctx.membership.id)));
  return Boolean(m);
}

/** The clients a portal user is a contact for. */
export async function clientIdsOf(ctx: FileCtx) {
  if (ctx.role !== "client") return [];
  const rows = await db
    .select({ clientId: clientContacts.clientId })
    .from(clientContacts)
    .where(and(eq(clientContacts.userId, ctx.user.id), eq(clientContacts.orgId, ctx.orgId), isNull(clientContacts.deletedAt)));
  return rows.map((r) => r.clientId);
}

/** Portal users: client-visible tickets and projects of their own company only. */
async function clientCanReach(ctx: FileCtx, target: { ticketId?: string | null; projectId?: string | null }) {
  const mine = await clientIdsOf(ctx);
  if (mine.length === 0) return null;
  if (target.ticketId) {
    const [t] = await db.select().from(tickets).where(and(eq(tickets.id, target.ticketId), eq(tickets.orgId, ctx.orgId), isNull(tickets.deletedAt)));
    return t && t.isClientVisible && t.clientId && mine.includes(t.clientId) ? { ticket: t, project: null } : null;
  }
  if (target.projectId) {
    const [p] = await db.select().from(projects).where(and(eq(projects.id, target.projectId), eq(projects.orgId, ctx.orgId), isNull(projects.deletedAt)));
    return p && mine.includes(p.clientId) ? { ticket: null, project: p } : null;
  }
  return null;
}

/** Checks access to where a file is going and returns the pieces of its storage path. */
export async function resolveTarget(ctx: FileCtx, target: FileTarget) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  // Website catalog screenshots (admins who manage packages)
  if (target.designId) {
    if (ctx.role === "client" || !(await can(ctx.orgId, ctx.role, "packages.manage"))) return null;
    const [d] = await db.select().from(websiteDesigns).where(and(eq(websiteDesigns.id, target.designId), eq(websiteDesigns.orgId, ctx.orgId)));
    if (!d) return null;
    return {
      org,
      ticketId: null,
      projectId: null,
      clientId: null,
      keyParts: { org: org.keyPrefix, client: null, project: "catalog", ticket: d.key },
      revalidate: [`/designs/${d.id}`],
    };
  }
  if (ctx.role === "client") {
    const reach = await clientCanReach(ctx, target);
    if (!reach) return null;
    const t = reach.ticket;
    const projectId = t ? t.projectId : reach.project!.id;
    const clientId = t ? t.clientId : reach.project!.clientId;
    const [project] = projectId ? await db.select().from(projects).where(eq(projects.id, projectId)) : [];
    const [client] = clientId ? await db.select().from(clients).where(eq(clients.id, clientId)) : [];
    return {
      org,
      ticketId: t?.id ?? null,
      projectId,
      clientId,
      keyParts: { org: org.keyPrefix, client: client?.code ?? null, project: project?.key ?? null, ticket: t?.key ?? null },
      revalidate: t ? [`/portal/tickets/${t.key}`] : [`/portal/projects/${projectId}`],
    };
  }
  if (target.ticketId) {
    const access = await ticketAccess(ctx, { id: target.ticketId });
    if (!access) return null;
    const t = access.ticket;
    const [project] = t.projectId ? await db.select().from(projects).where(eq(projects.id, t.projectId)) : [];
    const [client] = t.clientId ? await db.select().from(clients).where(eq(clients.id, t.clientId)) : [];
    return {
      org,
      ticketId: t.id,
      projectId: t.projectId,
      clientId: t.clientId,
      keyParts: { org: org.keyPrefix, client: client?.code ?? null, project: project?.key ?? null, ticket: t.key },
      revalidate: [`/tickets/${t.key}`, ...(t.projectId ? [`/projects/${t.projectId}`] : [])],
    };
  }
  if (target.projectId) {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, target.projectId), eq(projects.orgId, ctx.orgId), isNull(projects.deletedAt)));
    if (!project || !(await canSeeProject(ctx, project.id))) return null;
    const [client] = await db.select().from(clients).where(eq(clients.id, project.clientId));
    return {
      org,
      ticketId: null,
      projectId: project.id,
      clientId: project.clientId,
      keyParts: { org: org.keyPrefix, client: client?.code ?? null, project: project.key, ticket: null },
      revalidate: [`/projects/${project.id}`],
    };
  }
  return null;
}

/** Whether this person may open a stored file. */
export async function canOpenFile(ctx: FileCtx, file: typeof files.$inferSelect) {
  if (file.orgId !== ctx.orgId || file.deletedAt) return false;
  // Catalog screenshots: the team always; clients only for designs offered to their projects
  if (!file.ticketId && !file.projectId) {
    const [img] = await db.select({ designId: websiteDesignImages.designId }).from(websiteDesignImages).where(eq(websiteDesignImages.fileId, file.id));
    if (img) {
      if (ctx.role !== "client") return true;
      const mine = await clientIdsOf(ctx);
      if (mine.length === 0) return false;
      const [offer] = await db
        .select({ id: projectDesignOffers.id })
        .from(projectDesignOffers)
        .innerJoin(projects, eq(projects.id, projectDesignOffers.projectId))
        .where(and(eq(projectDesignOffers.designId, img.designId), inArray(projects.clientId, mine), isNull(projects.deletedAt)));
      return Boolean(offer);
    }
  }
  // Clients: files shared with them (or that they uploaded) on their own tickets/projects
  if (ctx.role === "client") {
    if (file.visibility !== "client" && file.uploadedByUserId !== ctx.user.id) return false;
    return Boolean(await clientCanReach(ctx, file.ticketId ? { ticketId: file.ticketId } : { projectId: file.projectId }));
  }
  if (file.ticketId) return Boolean(await ticketAccess(ctx, { id: file.ticketId }));
  if (file.projectId) return canSeeProject(ctx, file.projectId);
  return ctx.role === "admin" || ctx.role === "manager";
}

export type FileRow = {
  id: string;
  name: string;
  size: number;
  type: string;
  visibility: "internal" | "client";
  uploadedBy: string;
  uploadedByMe: boolean;
  when: string;
  ticketKey: string | null;
};

/**
 * Files on a ticket, or everything on a project (including its tickets' files), newest first.
 * `clientIds` = portal view: only files shared with the client, on tickets they can see.
 */
export async function listFiles(
  where: { ticketId?: string; projectId?: string; clientIds?: string[] },
  me: string,
  timezone: string,
): Promise<FileRow[]> {
  const portal = where.clientIds
    ? and(
        eq(files.visibility, "client"),
        inArray(files.clientId, where.clientIds.length ? where.clientIds : ["00000000-0000-0000-0000-000000000000"]),
        or(isNull(files.ticketId), and(eq(tickets.isClientVisible, true), isNull(tickets.deletedAt))),
      )
    : undefined;
  const scope = where.ticketId ? eq(files.ticketId, where.ticketId) : where.projectId ? eq(files.projectId, where.projectId) : undefined;
  const rows = await db
    .select({ f: files, name: users.name, email: users.email, ticketKey: tickets.key })
    .from(files)
    .leftJoin(users, eq(users.id, files.uploadedByUserId))
    .leftJoin(tickets, eq(tickets.id, files.ticketId))
    .where(and(scope, portal, isNull(files.deletedAt)))
    .orderBy(desc(files.createdAt))
    .limit(500);
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  return rows.map(({ f, name, email, ticketKey }) => ({
    id: f.id,
    name: f.originalName,
    size: f.sizeBytes,
    type: f.mimeType,
    visibility: f.visibility,
    uploadedBy: name || email || "Deleted user",
    uploadedByMe: f.uploadedByUserId === me,
    when: fmt.format(f.createdAt),
    ticketKey: where.ticketId ? null : ticketKey,
  }));
}
