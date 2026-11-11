// Admin-editable lookups and settings tables. Nothing here is hard-coded in the app.
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { pk, timestamps, ts } from "./columns";
import {
  assignmentStrategy,
  automationKind,
  leadStageKind,
  legalDocKind,
  statusCategory,
  ticketKind,
} from "./enums";
import { orgId } from "./org";
import { users } from "./auth";
import { memberships } from "./access";
import { packages } from "./packages";

const lookup = () => ({
  id: pk(),
  orgId: orgId(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

// WEB, MOB, BRD, MNT
export const serviceLines = pgTable(
  "service_lines",
  { ...lookup(), code: varchar("code", { length: 8 }).notNull() },
  (t) => [unique("service_lines_org_code_uq").on(t.orgId, t.code)],
);

// ESS, BUS, ENT, CUS
export const tiers = pgTable(
  "tiers",
  { ...lookup(), code: varchar("code", { length: 8 }).notNull() },
  (t) => [unique("tiers_org_code_uq").on(t.orgId, t.code)],
);

export const ticketStatuses = pgTable("ticket_statuses", {
  ...lookup(),
  category: statusCategory("category").notNull(),
  color: varchar("color", { length: 7 }).notNull().default("#6B7280"),
  pausesResponseClock: boolean("pauses_response_clock").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
});

export const ticketTypes = pgTable("ticket_types", {
  ...lookup(),
  kind: ticketKind("kind").notNull(),
});

export const priorities = pgTable("priorities", {
  ...lookup(),
  color: varchar("color", { length: 7 }).notNull().default("#6B7280"),
  isDefault: boolean("is_default").notNull().default(false),
});

export const leadStages = pgTable("lead_stages", {
  ...lookup(),
  kind: leadStageKind("kind").notNull().default("open"),
});

export const lostReasons = pgTable("lost_reasons", lookup());

// Library of phase names to pick from when building templates.
export const phaseNames = pgTable("phase_names", lookup());

// Default assignee per service line and/or ticket type, or round-robin across a pool.
export const assignmentRules = pgTable("assignment_rules", {
  ...lookup(),
  serviceLineId: uuid("service_line_id").references(() => serviceLines.id, { onDelete: "cascade" }),
  ticketTypeId: uuid("ticket_type_id").references(() => ticketTypes.id, { onDelete: "cascade" }),
  strategy: assignmentStrategy("strategy").notNull().default("fixed"),
  assigneeMembershipId: uuid("assignee_membership_id").references(() => memberships.id, {
    onDelete: "set null",
  }),
  poolMembershipIds: uuid("pool_membership_ids").array().notNull().default([]),
  lastAssignedIndex: integer("last_assigned_index").notNull().default(0),
});

// Website contact form -> lead ticket. Conditions match checked form options.
export const contactFormRules = pgTable("contact_form_rules", {
  ...lookup(),
  conditions: jsonb("conditions").$type<Record<string, string | string[]>>().notNull().default({}),
  packageId: uuid("package_id").references(() => packages.id, { onDelete: "set null" }),
  ticketTypeId: uuid("ticket_type_id").references(() => ticketTypes.id, { onDelete: "set null" }),
  priorityId: uuid("priority_id").references(() => priorities.id, { onDelete: "set null" }),
  assigneeMembershipId: uuid("assignee_membership_id").references(() => memberships.id, {
    onDelete: "set null",
  }),
  titleTemplate: text("title_template").notNull().default("New inquiry: {name}"),
  checklist: jsonb("checklist").$type<string[]>().notNull().default([]),
});

export type FormField = {
  key: string;
  label: string;
  kind: "short_text" | "long_text" | "select" | "multi_select" | "file" | "url" | "date";
  options?: string[];
  required?: boolean;
};

// Portal request forms per ticket type (support, change request, ...).
export const requestForms = pgTable("request_forms", {
  ...lookup(),
  ticketTypeId: uuid("ticket_type_id")
    .notNull()
    .references(() => ticketTypes.id, { onDelete: "cascade" }),
  fields: jsonb("fields").$type<FormField[]>().notNull().default([]),
});

// Editable email wording per event, with placeholders like {client_name}, {ticket_key}, {link}.
export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: pk(),
    orgId: orgId(),
    eventKey: varchar("event_key", { length: 64 }).notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    ...timestamps(),
  },
  (t) => [unique("notification_templates_org_event_uq").on(t.orgId, t.eventKey)],
);

export const discordWebhooks = pgTable("discord_webhooks", {
  ...lookup(),
  urlEncrypted: text("url_encrypted").notNull(),
  events: text("events").array().notNull().default([]),
});

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    eventKey: varchar("event_key", { length: 64 }).notNull(),
    inApp: boolean("in_app").notNull().default(true),
    email: boolean("email").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.membershipId, t.eventKey] })],
);

export const automationRules = pgTable(
  "automation_rules",
  {
    id: pk(),
    orgId: orgId(),
    kind: automationKind("kind").notNull(),
    afterDays: integer("after_days").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [unique("automation_rules_org_kind_uq").on(t.orgId, t.kind)],
);

export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: pk(),
    orgId: orgId(),
    kind: legalDocKind("kind").notNull(),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    publishedAt: ts("published_at"),
    ...timestamps(),
  },
  (t) => [unique("legal_documents_org_kind_version_uq").on(t.orgId, t.kind, t.version)],
);

export const termsAcceptances = pgTable("terms_acceptances", {
  id: pk(),
  orgId: orgId(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => legalDocuments.id, { onDelete: "restrict" }),
  acceptedAt: ts("accepted_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
});
