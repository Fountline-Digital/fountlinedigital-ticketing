// Team roles: what people DO (Sales, Design, Development...). Separate from access
// level (memberships.role), which controls what they're ALLOWED to do.
// Fully admin-managed: create, rename, recolor, choose dashboard widgets, retire, delete.
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, index, integer, pgTable, primaryKey, text, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./columns";
import { orgId } from "./org";
import { memberships } from "./access";

// Widgets a team role's dashboard tab can show. New widgets are added in code;
// which ones each role shows is a setting.
export const TEAM_WIDGETS = [
  "lead_pipeline",
  "waiting_on_client",
  "blocked",
  "approvals",
  "launches",
  "response_targets",
] as const;
export type TeamWidget = (typeof TEAM_WIDGETS)[number];

export const teamRoles = pgTable(
  "team_roles",
  {
    id: pk(),
    orgId: orgId(),
    key: varchar("key", { length: 32 }).notNull(), // "design"
    name: text("name").notNull(), // "Design"
    description: text("description"),
    color: varchar("color", { length: 7 }).notNull().default("#c0c0c0"),
    widgets: text("widgets").array().$type<TeamWidget[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [unique("team_roles_org_key_uq").on(t.orgId, t.key)],
);

// A person can have several team roles, and lead any of them.
export const membershipTeamRoles = pgTable(
  "membership_team_roles",
  {
    membershipId: uuid("membership_id")
      .notNull()
      .references((): AnyPgColumn => memberships.id, { onDelete: "cascade" }),
    teamRoleId: uuid("team_role_id")
      .notNull()
      .references((): AnyPgColumn => teamRoles.id, { onDelete: "cascade" }),
    isLead: boolean("is_lead").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.membershipId, t.teamRoleId] }), index("membership_team_roles_role_idx").on(t.teamRoleId)],
);
