// Who belongs to which organization, with what role, plus invites,
// editable role permissions and the counters behind readable keys.
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  jsonb,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  date,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { pk, timestamps, ts } from "./columns";
import { membershipRole, membershipStatus } from "./enums";
import { orgId, organizations } from "./org";
import { users } from "./auth";
import { clients } from "./clients";

export const memberships = pgTable(
  "memberships",
  {
    id: pk(),
    orgId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    status: membershipStatus("status").notNull().default("invited"),
    // Client-role members are scoped to one client.
    clientId: uuid("client_id").references((): AnyPgColumn => clients.id, { onDelete: "cascade" }),
    title: text("title"),
    // Contractors: access ends automatically after this time.
    accessExpiresAt: ts("access_expires_at"),
    invitedByUserId: uuid("invited_by_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    lastActiveAt: ts("last_active_at"),
    ...timestamps(),
  },
  (t) => [
    unique("memberships_org_user_uq").on(t.orgId, t.userId),
    index("memberships_client_idx").on(t.clientId),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: pk(),
    orgId: orgId(),
    email: text("email").notNull(),
    role: membershipRole("role").notNull(),
    clientId: uuid("client_id").references((): AnyPgColumn => clients.id, { onDelete: "cascade" }),
    accessExpiresAt: ts("access_expires_at"),
    tokenHash: text("token_hash").notNull().unique(),
    teamRoles: jsonb("team_roles").$type<{ teamRoleId: string; isLead: boolean }[]>().notNull().default([]),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    invitedByUserId: uuid("invited_by_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("invites_org_email_idx").on(t.orgId, t.email)],
);

// Admin-editable: which actions each role can take, e.g. ("worker", "ticket.reassign", false).
export const rolePermissions = pgTable(
  "role_permissions",
  {
    orgId: orgId(),
    role: membershipRole("role").notNull(),
    permission: varchar("permission", { length: 64 }).notNull(),
    allowed: boolean("allowed").notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.role, t.permission] })],
);

// Sequences behind readable keys, incremented inside a transaction:
//   "ticket"            -> FDT-1042
//   "project:WEB:26"    -> FDP-WEB-2601
//   "cr:<project id>"   -> FDP-WEB-2601-CR2
//   "logo:<client id>"  -> FDL-ACME-01-..
export const orgCounters = pgTable(
  "org_counters",
  {
    orgId: uuid("org_id")
      .notNull()
      .references((): AnyPgColumn => organizations.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 96 }).notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.scope] })],
);

// Response targets count business hours only.
export const businessHours = pgTable("business_hours", {
  id: pk(),
  orgId: orgId(),
  dayOfWeek: smallint("day_of_week").notNull(), // 0 = Sunday
  opensAt: time("opens_at").notNull(),
  closesAt: time("closes_at").notNull(),
});

export const holidays = pgTable(
  "holidays",
  {
    id: pk(),
    orgId: orgId(),
    date: date("date").notNull(),
    name: text("name").notNull(),
  },
  (t) => [unique("holidays_org_date_uq").on(t.orgId, t.date)],
);
