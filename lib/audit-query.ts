import "server-only";
import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";

// Filters shared by the audit log page and its CSV export (same URL params).
export type AuditFilters = { q?: string; actor?: string; area?: string; from?: string; to?: string; page?: string };

export const AUDIT_AREAS: Record<string, string> = {
  auth: "Sign-in & security",
  ticket: "Tickets",
  project: "Projects",
  phase: "Sign-offs",
  change_request: "Change requests",
  client: "Clients",
  file: "Files",
  package: "Packages",
  template: "Package templates",
  invite: "Invites",
  membership: "People & access",
  team_role: "Team roles",
  settings: "Settings",
  discord: "Discord",
  trash: "Trash",
  audit: "Audit log",
};

const isDate = (s?: string) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));

export function auditWhere(orgId: string, f: AuditFilters): SQL {
  const parts: (SQL | undefined)[] = [eq(auditLog.orgId, orgId)];
  if (f.actor === "system") parts.push(eq(auditLog.actorKind, "system"));
  else if (f.actor && /^[0-9a-f-]{36}$/i.test(f.actor)) parts.push(eq(auditLog.actorUserId, f.actor));
  if (f.area && AUDIT_AREAS[f.area]) parts.push(ilike(auditLog.action, `${f.area}.%`));
  // Dates are whole days in UTC; "to" includes that day
  if (isDate(f.from)) parts.push(gte(auditLog.createdAt, new Date(`${f.from}T00:00:00Z`)));
  if (isDate(f.to)) parts.push(lt(auditLog.createdAt, new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86400_000)));
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    parts.push(or(ilike(auditLog.entityKey, like), ilike(auditLog.action, like), sql`${auditLog.metadata}::text ilike ${like}`));
  }
  return and(...parts)!;
}

export function auditRows(orgId: string, f: AuditFilters, limit: number, offset = 0) {
  return db
    .select({ a: auditLog, name: users.name, email: users.email })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(auditWhere(orgId, f))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);
}

/** Where an entry points in the app, if anywhere. */
export function entityHref(a: { entityType: string | null; entityId: string | null; entityKey: string | null; metadata: Record<string, unknown> | null }) {
  switch (a.entityType) {
    case "ticket":
      return a.entityKey ? `/tickets/${a.entityKey}` : null;
    case "project":
      return a.entityId ? `/projects/${a.entityId}` : null;
    case "client":
      return a.entityId ? `/clients/${a.entityId}` : null;
    case "package":
      return a.entityId ? `/packages/${a.entityId}` : null;
    case "change_request":
      return typeof a.metadata?.projectId === "string" ? `/projects/${a.metadata.projectId}` : null;
    default:
      return null;
  }
}
