import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { leadStages, lostReasons, membershipTeamRoles, teamRoles } from "@/db/schema";
import { can, type Role } from "@/lib/permissions";

/** Admins/managers, plus anyone on the Sales team. */
export async function canSeeLeads(ctx: { orgId: string; role: Role; membership: { id: string } }) {
  if (ctx.role === "client") return false;
  if (await can(ctx.orgId, ctx.role, "tickets.view_all")) return true;
  const [row] = await db
    .select({ id: teamRoles.id })
    .from(membershipTeamRoles)
    .innerJoin(teamRoles, eq(teamRoles.id, membershipTeamRoles.teamRoleId))
    .where(and(eq(membershipTeamRoles.membershipId, ctx.membership.id), eq(teamRoles.key, "sales"), eq(teamRoles.isActive, true)));
  return Boolean(row);
}

export async function stagesAndReasons(orgId: string) {
  const [stages, reasons] = await Promise.all([
    db.select().from(leadStages).where(and(eq(leadStages.orgId, orgId), eq(leadStages.isActive, true))).orderBy(asc(leadStages.sortOrder)),
    db.select().from(lostReasons).where(and(eq(lostReasons.orgId, orgId), eq(lostReasons.isActive, true))).orderBy(asc(lostReasons.sortOrder)),
  ]);
  return { stages, reasons };
}

/** A short client code suggestion from a company name: "Bob's Bakery" -> "BOBS". */
export function suggestCode(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const code = words.length > 1 && words[0].length < 3 ? words.map((w) => w[0]).join("") : words[0] ?? "";
  return code.slice(0, 6) || "CLIENT";
}
