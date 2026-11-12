import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, memberships, priorities, projectMembers, projects, ticketStatuses, ticketTypes, tickets, users } from "@/db/schema";

export type TicketFilters = {
  q?: string;
  status?: string; // "open" (default), "all", "done", or a status id
  priority?: string;
  assignee?: string; // "me", "none", or a membership id
  type?: string;
  project?: string;
  sort?: "updated" | "due" | "priority" | "key";
};

export const FILTER_KEYS = ["q", "status", "priority", "assignee", "type", "project", "sort"] as const;

export function parseFilters(sp: Record<string, string | string[] | undefined>): TicketFilters {
  const get = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const sort = get("sort");
  return {
    q: get("q"),
    status: get("status") ?? "open",
    priority: get("priority"),
    assignee: get("assignee"),
    type: get("type"),
    project: get("project"),
    sort: sort === "due" || sort === "priority" || sort === "key" ? sort : "updated",
  };
}

/**
 * Tickets the user may see, filtered. Admins/managers see everything; others see tickets
 * on their projects, assigned to them, or reported by them.
 */
export async function findTickets(opts: {
  orgId: string;
  membershipId: string;
  userId: string;
  viewAll: boolean;
  filters: TicketFilters;
  board?: boolean;
  limit?: number;
}) {
  const { filters: f } = opts;
  const where: (SQL | undefined)[] = [eq(tickets.orgId, opts.orgId), isNull(tickets.deletedAt)];

  if (!opts.viewAll) {
    const mine = await db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.membershipId, opts.membershipId));
    const projectIds = mine.map((m) => m.id);
    where.push(
      or(
        eq(tickets.assigneeMembershipId, opts.membershipId),
        eq(tickets.reporterUserId, opts.userId),
        projectIds.length ? inArray(tickets.projectId, projectIds) : undefined,
      ),
    );
  }

  if (opts.board) {
    // The board shows every column, so only hide finished work older than 14 days.
    if (f.status && !["open", "all", "done"].includes(f.status)) where.push(eq(tickets.statusId, f.status));
    where.push(
      or(
        notInArray(ticketStatuses.category, ["done", "cancelled"]),
        sql`${tickets.closedAt} > now() - interval '14 days'`,
      ),
    );
  } else if (f.status === "open") where.push(notInArray(ticketStatuses.category, ["done", "cancelled"]));
  else if (f.status === "done") where.push(inArray(ticketStatuses.category, ["done", "cancelled"]));
  else if (f.status && f.status !== "all") where.push(eq(tickets.statusId, f.status));

  if (f.priority) where.push(eq(tickets.priorityId, f.priority));
  if (f.type) where.push(eq(tickets.ticketTypeId, f.type));
  if (f.project) where.push(eq(tickets.projectId, f.project));
  if (f.assignee === "me") where.push(eq(tickets.assigneeMembershipId, opts.membershipId));
  else if (f.assignee === "none") where.push(isNull(tickets.assigneeMembershipId));
  else if (f.assignee) where.push(eq(tickets.assigneeMembershipId, f.assignee));

  if (f.q) {
    const term = `%${f.q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      or(
        ilike(tickets.key, term),
        ilike(tickets.title, term),
        ilike(tickets.description, term),
        ilike(projects.name, term),
        ilike(clients.name, term),
      ),
    );
  }

  const order =
    f.sort === "due"
      ? [sql`${tickets.dueAt} asc nulls last`, desc(tickets.updatedAt)]
      : f.sort === "priority"
        ? [desc(priorities.sortOrder), desc(tickets.updatedAt)]
        : f.sort === "key"
          ? [desc(tickets.number)]
          : [desc(tickets.updatedAt)];

  return db
    .select({
      id: tickets.id,
      key: tickets.key,
      title: tickets.title,
      statusId: tickets.statusId,
      statusName: ticketStatuses.name,
      statusColor: ticketStatuses.color,
      statusCategory: ticketStatuses.category,
      priorityName: priorities.name,
      priorityColor: priorities.color,
      prioritySort: priorities.sortOrder,
      typeName: ticketTypes.name,
      dueAt: tickets.dueAt,
      updatedAt: tickets.updatedAt,
      isClientVisible: tickets.isClientVisible,
      projectId: tickets.projectId,
      projectKey: projects.key,
      projectName: projects.name,
      clientName: clients.name,
      assigneeName: users.name,
      assigneeEmail: users.email,
    })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .innerJoin(priorities, eq(priorities.id, tickets.priorityId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .leftJoin(projects, eq(projects.id, tickets.projectId))
    .leftJoin(clients, eq(clients.id, tickets.clientId))
    .leftJoin(memberships, eq(memberships.id, tickets.assigneeMembershipId))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(and(...where))
    .orderBy(...order)
    .limit(opts.limit ?? 200);
}

export type TicketRow = Awaited<ReturnType<typeof findTickets>>[number];

export async function filterOptions(orgId: string, viewAll: boolean, membershipId: string) {
  const statusRows = await db
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.isActive, true)))
    .orderBy(asc(ticketStatuses.sortOrder));
  const priorityRows = await db
    .select()
    .from(priorities)
    .where(and(eq(priorities.orgId, orgId), eq(priorities.isActive, true)))
    .orderBy(desc(priorities.sortOrder));
  const typeRows = await db
    .select()
    .from(ticketTypes)
    .where(and(eq(ticketTypes.orgId, orgId), eq(ticketTypes.isActive, true)))
    .orderBy(asc(ticketTypes.sortOrder));
  const team = await db
    .select({ id: memberships.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, "active")))
    .orderBy(asc(users.name));

  let projectRows = await db
    .select({ id: projects.id, key: projects.key, name: projects.name })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.createdAt));
  if (!viewAll) {
    const mine = new Set(
      (await db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.membershipId, membershipId))).map((m) => m.id),
    );
    projectRows = projectRows.filter((p) => mine.has(p.id));
  }

  return {
    statuses: statusRows.map((s) => ({ value: s.id, label: s.name, color: s.color, category: s.category })),
    priorities: priorityRows.map((p) => ({ value: p.id, label: p.name, color: p.color })),
    types: typeRows.map((t) => ({ value: t.id, label: t.name, kind: t.kind })),
    team: team.filter((m) => m.role !== "client").map((m) => ({ value: m.id, label: m.name || m.email })),
    projects: projectRows.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` })),
  };
}
