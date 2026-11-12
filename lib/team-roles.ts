import "server-only";
import { and, asc, count, eq, inArray, isNull, ne, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { memberships, membershipTeamRoles, taskTemplates, teamRoles, ticketStatuses, tickets, users } from "@/db/schema";

export type TeamWidget = "lead_pipeline" | "waiting_on_client" | "blocked" | "approvals" | "launches" | "response_targets";

export const WIDGET_LABELS: Record<TeamWidget, { label: string; hint: string }> = {
  lead_pipeline: { label: "Lead pipeline", hint: "Leads by stage and follow-ups due" },
  waiting_on_client: { label: "Waiting on client", hint: "Work paused until the client responds" },
  blocked: { label: "Blocked work", hint: "Tickets waiting on other unfinished tickets" },
  approvals: { label: "Sign-offs", hint: "Phases waiting for approval" },
  launches: { label: "Upcoming launches", hint: "Projects launching in the next 30 days" },
  response_targets: { label: "Response targets", hint: "Support requests by time left to respond" },
};

/** The five starter roles. Admins can rename, recolor, change widgets, retire or delete them. */
export const STARTER_TEAM_ROLES: { key: string; name: string; description: string; color: string; widgets: TeamWidget[] }[] = [
  { key: "sales", name: "Sales", description: "Leads, proposals and conversions", color: "#c0c0c0", widgets: ["lead_pipeline", "waiting_on_client"] },
  { key: "design", name: "Design", description: "Graphic, brand, UI, logos and mockups", color: "#e5e5e5", widgets: ["waiting_on_client", "approvals"] },
  { key: "development", name: "Development", description: "Websites and apps, builds and launches", color: "#a3a3a3", widgets: ["blocked", "launches"] },
  { key: "support", name: "Support", description: "Maintenance plans and support requests", color: "#d4d4d4", widgets: ["response_targets", "waiting_on_client"] },
  { key: "content", name: "Content", description: "Copywriting, SEO and page content", color: "#8c8c8c", widgets: ["waiting_on_client", "blocked"] },
];

// Starter template task titles -> team role (used once, when adding the starter roles)
const STARTER_TASK_MAP: Record<string, string> = {
  "Review intake questionnaire": "content",
  "Sitemap and page list": "content",
  "Offer website designs to client": "design",
  "Client picks design, colors and fonts": "design",
  "Homepage mockup": "design",
  "Inner page mockups": "design",
  "Set up project, repo and hosting": "development",
  "Build pages": "development",
  "Add content and images": "content",
  "Contact form and integrations": "development",
  "Basic SEO setup": "content",
  "Internal QA": "development",
  "Apply review changes": "development",
  "Domain and DNS": "development",
  "SSL, analytics and backups": "development",
  "Go live": "development",
  "Training session": "support",
  "Handoff documents and access": "support",
};

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

export async function listTeamRoles(orgId: string, activeOnly = true) {
  return db
    .select()
    .from(teamRoles)
    .where(and(eq(teamRoles.orgId, orgId), activeOnly ? eq(teamRoles.isActive, true) : undefined))
    .orderBy(asc(teamRoles.sortOrder), asc(teamRoles.name));
}

/** Adds the starter roles (skipping keys that exist) and tags the starter template tasks. */
export async function addStarterTeamRoles(orgId: string) {
  const existing = await listTeamRoles(orgId, false);
  const toAdd = STARTER_TEAM_ROLES.filter((r) => !existing.some((e) => e.key === r.key));
  const created = toAdd.length
    ? await db
        .insert(teamRoles)
        .values(toAdd.map((r, i) => ({ orgId, ...r, sortOrder: existing.length + i })))
        .returning()
    : [];
  const all = [...existing, ...created];
  const idByKey = new Map(all.map((r) => [r.key, r.id] as const));

  let tagged = 0;
  for (const [title, key] of Object.entries(STARTER_TASK_MAP)) {
    const roleId = idByKey.get(key);
    if (!roleId) continue;
    const rows = await db
      .update(taskTemplates)
      .set({ teamRoleId: roleId })
      .where(and(eq(taskTemplates.orgId, orgId), eq(taskTemplates.title, title), isNull(taskTemplates.teamRoleId)))
      .returning({ id: taskTemplates.id });
    tagged += rows.length;
  }
  return { added: created.length, tagged };
}

/** A member's team roles, with lead flags. */
export async function memberTeamRoles(membershipId: string) {
  return db
    .select({ teamRoleId: membershipTeamRoles.teamRoleId, isLead: membershipTeamRoles.isLead, name: teamRoles.name, color: teamRoles.color, key: teamRoles.key })
    .from(membershipTeamRoles)
    .innerJoin(teamRoles, eq(teamRoles.id, membershipTeamRoles.teamRoleId))
    .where(and(eq(membershipTeamRoles.membershipId, membershipId), eq(teamRoles.isActive, true)))
    .orderBy(asc(teamRoles.sortOrder));
}

/** Team roles this member leads. */
export async function leadRoleIds(membershipId: string) {
  return (await memberTeamRoles(membershipId)).filter((r) => r.isLead).map((r) => r.teamRoleId);
}

/** Active people with a team role (contractors included, clients never). */
export async function teamRoleMembers(orgId: string, teamRoleId: string) {
  const now = new Date();
  const rows = await db
    .select({ membershipId: memberships.id, name: users.name, email: users.email, accessExpiresAt: memberships.accessExpiresAt })
    .from(membershipTeamRoles)
    .innerJoin(memberships, eq(memberships.id, membershipTeamRoles.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(membershipTeamRoles.teamRoleId, teamRoleId),
        eq(memberships.orgId, orgId),
        eq(memberships.status, "active"),
        ne(memberships.role, "client"),
      ),
    );
  return rows.filter((r) => !r.accessExpiresAt || r.accessExpiresAt > now);
}

/**
 * Who should get a new ticket for this team role: the member with the fewest open
 * tickets (spreads work evenly). Null if nobody has the role.
 */
export async function pickAssignee(orgId: string, teamRoleId: string | null, alreadyPlanned?: Map<string, number>) {
  if (!teamRoleId) return null;
  const members = await teamRoleMembers(orgId, teamRoleId);
  if (members.length === 0) return null;
  const ids = members.map((m) => m.membershipId);
  const load = await db
    .select({ id: tickets.assigneeMembershipId, n: count() })
    .from(tickets)
    .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
    .where(and(inArray(tickets.assigneeMembershipId, ids), isNull(tickets.deletedAt), notInArray(ticketStatuses.category, ["done", "cancelled"])))
    .groupBy(tickets.assigneeMembershipId);
  const score = (id: string) => (load.find((l) => l.id === id)?.n ?? 0) + (alreadyPlanned?.get(id) ?? 0);
  const pick = [...ids].sort((a, b) => score(a) - score(b))[0];
  alreadyPlanned?.set(pick, (alreadyPlanned.get(pick) ?? 0) + 1);
  return pick;
}

/** How many people, template tasks and tickets use a team role. */
export async function teamRoleUsage(orgId: string, id: string) {
  const [[people], [tasks], [ticketCount]] = await Promise.all([
    db.select({ n: count() }).from(membershipTeamRoles).where(eq(membershipTeamRoles.teamRoleId, id)),
    db.select({ n: count() }).from(taskTemplates).where(and(eq(taskTemplates.orgId, orgId), eq(taskTemplates.teamRoleId, id))),
    db.select({ n: count() }).from(tickets).where(and(eq(tickets.orgId, orgId), eq(tickets.teamRoleId, id))),
  ]);
  return { people: people.n, tasks: tasks.n, tickets: ticketCount.n };
}

