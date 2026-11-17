import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { assignmentRules, memberships } from "@/db/schema";

/**
 * Default assignee from Settings > Intake & assignment: the most specific active rule
 * (service line + ticket type, then type only, then line only). "Fixed" always picks one
 * person; "round robin" takes turns through a pool, skipping anyone who's inactive.
 */
export async function assignByRule(orgId: string, match: { serviceLineId?: string | null; ticketTypeId?: string | null }) {
  const rules = await db
    .select()
    .from(assignmentRules)
    .where(and(eq(assignmentRules.orgId, orgId), eq(assignmentRules.isActive, true)))
    .orderBy(asc(assignmentRules.sortOrder));
  const line = match.serviceLineId ?? null;
  const type = match.ticketTypeId ?? null;
  const rule =
    rules.find((r) => line && type && r.serviceLineId === line && r.ticketTypeId === type) ??
    rules.find((r) => type && r.ticketTypeId === type && !r.serviceLineId) ??
    rules.find((r) => line && r.serviceLineId === line && !r.ticketTypeId);
  if (!rule) return null;

  const activeIds = async (ids: string[]) =>
    ids.length
      ? (await db.select({ id: memberships.id }).from(memberships).where(and(inArray(memberships.id, ids), eq(memberships.status, "active")))).map((m) => m.id)
      : [];

  if (rule.strategy === "fixed") {
    const [ok] = rule.assigneeMembershipId ? await activeIds([rule.assigneeMembershipId]) : [];
    return ok ?? null;
  }
  const pool = rule.poolMembershipIds;
  const active = new Set(await activeIds(pool));
  for (let step = 1; step <= pool.length; step++) {
    const i = (rule.lastAssignedIndex + step) % pool.length;
    if (active.has(pool[i])) {
      await db.update(assignmentRules).set({ lastAssignedIndex: i }).where(eq(assignmentRules.id, rule.id));
      return pool[i];
    }
  }
  return null;
}
