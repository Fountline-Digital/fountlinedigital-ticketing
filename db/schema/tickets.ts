// Tickets and everything attached to them.
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps, ts } from "./columns";
import { changeRequestStatus, ticketLinkKind, ticketSource, visibility } from "./enums";
import { orgId } from "./org";
import { users } from "./auth";
import { memberships } from "./access";
import { clients } from "./clients";
import { leadStages, lostReasons, priorities, ticketStatuses, ticketTypes } from "./config";
import { taskTemplates } from "./packages";
import { projectPhases, projects } from "./projects";

export const tickets = pgTable(
  "tickets",
  {
    id: pk(),
    orgId: orgId(),
    number: integer("number").notNull(), // 1042
    key: varchar("key", { length: 24 }).notNull(), // FDT-1042, never changes
    ticketTypeId: uuid("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "restrict" }),
    statusId: uuid("status_id")
      .notNull()
      .references(() => ticketStatuses.id, { onDelete: "restrict" }),
    priorityId: uuid("priority_id")
      .notNull()
      .references(() => priorities.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    source: ticketSource("source").notNull().default("manual"),

    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    projectPhaseId: uuid("project_phase_id").references(() => projectPhases.id, { onDelete: "set null" }),
    taskTemplateId: uuid("task_template_id").references(() => taskTemplates.id, { onDelete: "set null" }),

    assigneeMembershipId: uuid("assignee_membership_id").references(() => memberships.id, {
      onDelete: "set null",
    }),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: ts("due_at"),
    estimateMinutes: integer("estimate_minutes"),
    isClientVisible: boolean("is_client_visible").notNull().default(false),

    // Leads
    leadStageId: uuid("lead_stage_id").references(() => leadStages.id, { onDelete: "set null" }),
    lostReasonId: uuid("lost_reason_id").references(() => lostReasons.id, { onDelete: "set null" }),
    leadContact: jsonb("lead_contact").$type<{
      name?: string;
      email?: string;
      phone?: string;
      company?: string;
    }>(),
    formData: jsonb("form_data").$type<Record<string, unknown>>(),

    // Response targets (business hours)
    responseDueAt: ts("response_due_at"),
    firstResponseAt: ts("first_response_at"),
    resolvedAt: ts("resolved_at"),
    closedAt: ts("closed_at"),

    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    unique("tickets_org_number_uq").on(t.orgId, t.number),
    unique("tickets_org_key_uq").on(t.orgId, t.key),
    index("tickets_org_status_idx").on(t.orgId, t.statusId),
    index("tickets_assignee_idx").on(t.assigneeMembershipId),
    index("tickets_project_idx").on(t.projectId),
    index("tickets_client_idx").on(t.clientId),
    index("tickets_due_idx").on(t.orgId, t.dueAt),
  ],
);

export const ticketChecklistItems = pgTable(
  "ticket_checklist_items",
  {
    id: pk(),
    orgId: orgId(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    doneAt: ts("done_at"),
    doneByUserId: uuid("done_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("ticket_checklist_items_ticket_idx").on(t.ticketId)],
);

// Related / duplicate_of / blocks (dependencies: from blocks to).
export const ticketLinks = pgTable(
  "ticket_links",
  {
    id: pk(),
    orgId: orgId(),
    fromTicketId: uuid("from_ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    toTicketId: uuid("to_ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    kind: ticketLinkKind("kind").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("ticket_links_uq").on(t.fromTicketId, t.toTicketId, t.kind),
    index("ticket_links_to_idx").on(t.toTicketId),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: pk(),
    orgId: orgId(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    visibility: visibility("visibility").notNull().default("internal"),
    editedAt: ts("edited_at"),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index("comments_ticket_idx").on(t.ticketId)],
);

export const commentMentions = pgTable(
  "comment_mentions",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);

export const changeRequests = pgTable(
  "change_requests",
  {
    id: pk(),
    orgId: orgId(),
    key: varchar("key", { length: 32 }).notNull(), // FDP-WEB-2601-CR2
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    projectPhaseId: uuid("project_phase_id").references(() => projectPhases.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    priceCents: integer("price_cents"),
    estimateMinutes: integer("estimate_minutes"),
    status: changeRequestStatus("status").notNull().default("draft"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    decisionComment: text("decision_comment"),
    ...timestamps(),
  },
  (t) => [
    unique("change_requests_org_key_uq").on(t.orgId, t.key),
    index("change_requests_project_idx").on(t.projectId),
  ],
);

export const savedFilters = pgTable("saved_filters", {
  id: pk(),
  orgId: orgId(),
  ownerMembershipId: uuid("owner_membership_id")
    .notNull()
    .references(() => memberships.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  view: varchar("view", { length: 16 }).notNull().default("list"), // list | board
  isShared: boolean("is_shared").notNull().default(false),
  ...timestamps(),
});
