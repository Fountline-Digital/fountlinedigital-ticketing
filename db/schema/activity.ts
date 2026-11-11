// In-app notifications and the append-only audit log.
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { index, inet, jsonb, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { pk, ts } from "./columns";
import { actorKind, membershipRole } from "./enums";
import { orgId } from "./org";
import { users } from "./auth";
import { tickets } from "./tickets";

export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    orgId: orgId(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
    eventKey: varchar("event_key", { length: 64 }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    url: text("url"),
    ticketId: uuid("ticket_id").references((): AnyPgColumn => tickets.id, { onDelete: "cascade" }),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_recipient_idx").on(t.recipientUserId, t.readAt)],
);

// Every action by every user and by the system. Append-only: the migration in
// drizzle/custom/audit_log_append_only.sql blocks UPDATE and DELETE.
// Never store passwords, tokens or file contents here.
// Entries older than the org's auditHotDays (default 90) are archived to R2.
export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    // Plain IDs, no foreign keys: the log must outlive the rows it describes, and
    // a cascading delete/update would be blocked by the append-only trigger.
    // Nullable: some events (e.g. a failed sign-in) happen before an org is known.
    orgId: uuid("org_id"),
    actorKind: actorKind("actor_kind").notNull().default("user"),
    actorUserId: uuid("actor_user_id"),
    actorRole: membershipRole("actor_role"),
    action: varchar("action", { length: 64 }).notNull(), // "ticket.update", "auth.sign_in_failed"
    entityType: varchar("entity_type", { length: 48 }),
    entityId: uuid("entity_id"),
    entityKey: varchar("entity_key", { length: 48 }), // FDT-1042
    changes: jsonb("changes").$type<{ before?: Record<string, unknown>; after?: Record<string, unknown> }>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_org_created_idx").on(t.orgId, t.createdAt),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_actor_idx").on(t.actorUserId, t.createdAt),
  ],
);
