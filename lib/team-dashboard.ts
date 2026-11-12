import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, notInArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  leadStages,
  projectPhases,
  projects,
  teamRoles,
  ticketLinks,
  ticketStatuses,
  ticketTypes,
  tickets,
} from "@/db/schema";
import { teamRoleMembers } from "@/lib/team-roles";

const OPEN = notInArray(ticketStatuses.category, ["done", "cancelled"]);

type Scope = { orgId: string; teamRoleId: string; onlyMembershipId: string | null };

/** Base filter: open tickets in this team role (optionally only one person's). */
function base(s: Scope): SQL[] {
  const w: SQL[] = [eq(tickets.orgId, s.orgId), isNull(tickets.deletedAt), eq(tickets.teamRoleId, s.teamRoleId), OPEN];
  if (s.onlyMembershipId) w.push(eq(tickets.assigneeMembershipId, s.onlyMembershipId));
  return w;
}

async function countWhere(s: Scope, ...extra: (SQL | undefined)[]) {
  const [row] = await db
    .select({ n: count() })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(and(...base(s), ...extra));
  return row?.n ?? 0;
}

const ticketFields = {
  id: tickets.id,
  key: tickets.key,
  title: tickets.title,
  dueAt: tickets.dueAt,
  statusName: ticketStatuses.name,
  statusColor: ticketStatuses.color,
  projectKey: projects.key,
};

async function listWhere(s: Scope, extra: (SQL | undefined)[], limit = 8, order: SQL[] = [sql`${tickets.dueAt} asc nulls last`, desc(tickets.updatedAt)]) {
  return db
    .select(ticketFields)
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .leftJoin(projects, eq(projects.id, tickets.projectId))
    .where(and(...base(s), ...extra))
    .orderBy(...order)
    .limit(limit);
}

export async function teamTab(orgId: string, teamRoleId: string, onlyMembershipId: string | null) {
  const s: Scope = { orgId, teamRoleId, onlyMembershipId };
  const [role] = await db.select().from(teamRoles).where(and(eq(teamRoles.id, teamRoleId), eq(teamRoles.orgId, orgId)));
  if (!role) return null;
  const now = new Date();
  const week = new Date(Date.now() + 7 * 86_400_000);

  const [open, overdue, dueWeek, unassigned] = await Promise.all([
    countWhere(s),
    countWhere(s, lt(tickets.dueAt, now)),
    countWhere(s, gte(tickets.dueAt, now), lte(tickets.dueAt, week)),
    onlyMembershipId ? Promise.resolve(0) : countWhere(s, isNull(tickets.assigneeMembershipId)),
  ]);

  const list = await listWhere(s, [], 10);

  // Workload inside this team (team view only)
  let workload: { id: string; name: string; open: number }[] = [];
  if (!onlyMembershipId) {
    const members = await teamRoleMembers(orgId, teamRoleId);
    const load = await db
      .select({ id: tickets.assigneeMembershipId, n: count() })
      .from(tickets)
      .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
      .where(and(...base(s)))
      .groupBy(tickets.assigneeMembershipId);
    workload = members
      .map((m) => ({ id: m.membershipId, name: m.name || m.email, open: load.find((l) => l.id === m.membershipId)?.n ?? 0 }))
      .sort((a, b) => b.open - a.open);
  }

  type Rows = Awaited<ReturnType<typeof listWhere>>;
  const widgets: {
    waiting_on_client?: Rows;
    blocked?: Rows;
    approvals?: { id: string; position: number; name: string; gate: string; projectId: string; projectKey: string; projectName: string; clientName: string }[];
    launches?: { id: string; key: string; name: string; clientName: string; targetLaunchDate: string | null }[];
    response_targets?: (Rows[number] & { responseDueAt: Date | null })[];
    lead_pipeline?: { stages: { id: string; name: string; kind: string; n: number }[]; followUps: Rows };
  } = {};
  for (const w of role.widgets) {
    if (w === "waiting_on_client") {
      widgets.waiting_on_client = await listWhere(s, [eq(ticketStatuses.category, "waiting")]);
    } else if (w === "blocked") {
      const mine = await db
        .select({ id: tickets.id })
        .from(tickets)
        .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
        .where(and(...base(s)));
      const ids = mine.map((m) => m.id);
      let blockedIds: string[] = [];
      if (ids.length) {
        const rows = await db
          .select({ to: ticketLinks.toTicketId })
          .from(ticketLinks)
          .innerJoin(tickets, eq(tickets.id, ticketLinks.fromTicketId))
          .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
          .where(and(eq(ticketLinks.kind, "blocks"), inArray(ticketLinks.toTicketId, ids), isNull(tickets.deletedAt), OPEN));
        blockedIds = [...new Set(rows.map((r): string => r.to))];
      }
      widgets.blocked = blockedIds.length ? await listWhere(s, [inArray(tickets.id, blockedIds)]) : [];
    } else if (w === "approvals") {
      widgets.approvals = await db
        .selectDistinct({
          id: projectPhases.id,
          position: projectPhases.position,
          name: projectPhases.name,
          gate: projectPhases.gateApprover,
          projectId: projects.id,
          projectKey: projects.key,
          projectName: projects.name,
          clientName: clients.name,
        })
        .from(projectPhases)
        .innerJoin(projects, eq(projects.id, projectPhases.projectId))
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .innerJoin(tickets, and(eq(tickets.projectPhaseId, projectPhases.id), eq(tickets.teamRoleId, teamRoleId)))
        .where(and(eq(projectPhases.orgId, orgId), eq(projectPhases.status, "awaiting_approval"), isNull(projects.deletedAt)))
        .orderBy(asc(projects.key));
    } else if (w === "launches") {
      const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      const today = now.toISOString().slice(0, 10);
      widgets.launches = await db
        .selectDistinct({ id: projects.id, key: projects.key, name: projects.name, clientName: clients.name, targetLaunchDate: projects.targetLaunchDate })
        .from(projects)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .innerJoin(tickets, and(eq(tickets.projectId, projects.id), eq(tickets.teamRoleId, teamRoleId), isNull(tickets.deletedAt)))
        .where(
          and(
            eq(projects.orgId, orgId),
            eq(projects.status, "active"),
            isNull(projects.deletedAt),
            gte(projects.targetLaunchDate, today),
            lte(projects.targetLaunchDate, in30),
          ),
        )
        .orderBy(asc(projects.targetLaunchDate));
    } else if (w === "response_targets") {
      const [support] = await db
        .select({ id: ticketTypes.id })
        .from(ticketTypes)
        .where(and(eq(ticketTypes.orgId, orgId), eq(ticketTypes.kind, "support")))
        .limit(1);
      widgets.response_targets = support
        ? await db
            .select({ ...ticketFields, responseDueAt: tickets.responseDueAt, firstResponseAt: tickets.firstResponseAt })
            .from(tickets)
            .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
            .leftJoin(projects, eq(projects.id, tickets.projectId))
            .where(and(...base(s), eq(tickets.ticketTypeId, support.id), isNull(tickets.firstResponseAt)))
            .orderBy(sql`coalesce(${tickets.responseDueAt}, ${tickets.dueAt}) asc nulls last`)
            .limit(8)
        : [];
    } else if (w === "lead_pipeline") {
      // Leads aren't tied to a team role, so this shows all leads (or just yours).
      const stages = await db
        .select()
        .from(leadStages)
        .where(and(eq(leadStages.orgId, orgId), eq(leadStages.isActive, true)))
        .orderBy(asc(leadStages.sortOrder));
      const leadWhere = and(
        eq(tickets.orgId, orgId),
        isNull(tickets.deletedAt),
        sql`${tickets.leadStageId} is not null`,
        onlyMembershipId ? eq(tickets.assigneeMembershipId, onlyMembershipId) : undefined,
      );
      const counts = await db.select({ stageId: tickets.leadStageId, n: count() }).from(tickets).where(leadWhere).groupBy(tickets.leadStageId);
      const followUps = await db
        .select(ticketFields)
        .from(tickets)
        .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
        .innerJoin(leadStages, eq(leadStages.id, tickets.leadStageId))
        .leftJoin(projects, eq(projects.id, tickets.projectId))
        .where(and(leadWhere, eq(leadStages.kind, "open"), lte(tickets.dueAt, new Date(Date.now() + 86_400_000))))
        .orderBy(asc(tickets.dueAt))
        .limit(6);
      widgets.lead_pipeline = {
        stages: stages.map((st) => ({ id: st.id, name: st.name, kind: st.kind, n: counts.find((c) => c.stageId === st.id)?.n ?? 0 })),
        followUps,
      };
    }
  }

  return {
    role: { id: role.id, key: role.key, name: role.name, color: role.color, description: role.description, widgets: role.widgets },
    stats: { open, overdue, dueWeek, unassigned },
    list,
    workload,
    widgets,
  };
}
