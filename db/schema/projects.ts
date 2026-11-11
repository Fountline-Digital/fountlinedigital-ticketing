// Projects, their phases, gate approvals, closeout and intake answers.
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps, ts } from "./columns";
import { approvalDecision, approverKind, gateApprover, phaseStatus, projectStatus } from "./enums";
import { orgId } from "./org";
import { users } from "./auth";
import { memberships } from "./access";
import { clients } from "./clients";
import { serviceLines } from "./config";
import { packageVersions, phaseTemplates, questionnaires } from "./packages";

export const projects = pgTable(
  "projects",
  {
    id: pk(),
    orgId: orgId(),
    key: varchar("key", { length: 24 }).notNull(), // FDP-WEB-2601
    year: smallint("year").notNull(), // 26
    sequence: integer("sequence").notNull(), // 1 -> "01", 100 -> "100"
    clientId: uuid("client_id")
      .notNull()
      .references((): AnyPgColumn => clients.id, { onDelete: "restrict" }),
    packageVersionId: uuid("package_version_id")
      .notNull()
      .references((): AnyPgColumn => packageVersions.id, { onDelete: "restrict" }),
    serviceLineId: uuid("service_line_id")
      .notNull()
      .references((): AnyPgColumn => serviceLines.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    status: projectStatus("status").notNull().default("active"),
    startDate: date("start_date"),
    targetLaunchDate: date("target_launch_date"),
    completedAt: ts("completed_at"),
    archivedAt: ts("archived_at"),
    closeoutSignedOffAt: ts("closeout_signed_off_at"),
    closeoutSignedOffByUserId: uuid("closeout_signed_off_by_user_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    unique("projects_org_key_uq").on(t.orgId, t.key),
    index("projects_client_idx").on(t.clientId),
  ],
);

// Workers and contractors only see projects they're members of.
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references((): AnyPgColumn => projects.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references((): AnyPgColumn => memberships.id, { onDelete: "cascade" }),
    addedAt: ts("added_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.membershipId] })],
);

export const projectPhases = pgTable(
  "project_phases",
  {
    id: pk(),
    orgId: orgId(),
    projectId: uuid("project_id")
      .notNull()
      .references((): AnyPgColumn => projects.id, { onDelete: "cascade" }),
    phaseTemplateId: uuid("phase_template_id").references((): AnyPgColumn => phaseTemplates.id, {
      onDelete: "set null",
    }),
    position: integer("position").notNull(),
    name: text("name").notNull(), // shown as P2-Design
    status: phaseStatus("status").notNull().default("locked"),
    gateApprover: gateApprover("gate_approver").notNull().default("none"),
    revisionRoundsAllowed: integer("revision_rounds_allowed").notNull().default(0),
    revisionRoundsUsed: integer("revision_rounds_used").notNull().default(0),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    ...timestamps(),
  },
  (t) => [unique("project_phases_project_position_uq").on(t.projectId, t.position)],
);

export const phaseApprovals = pgTable(
  "phase_approvals",
  {
    id: pk(),
    orgId: orgId(),
    projectPhaseId: uuid("project_phase_id")
      .notNull()
      .references((): AnyPgColumn => projectPhases.id, { onDelete: "cascade" }),
    approverKind: approverKind("approver_kind").notNull(),
    roundNumber: integer("round_number").notNull().default(1),
    decision: approvalDecision("decision").notNull().default("pending"),
    decidedByUserId: uuid("decided_by_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    comment: text("comment"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("phase_approvals_phase_idx").on(t.projectPhaseId)],
);

export const closeoutItems = pgTable("closeout_items", {
  id: pk(),
  orgId: orgId(),
  projectId: uuid("project_id")
    .notNull()
    .references((): AnyPgColumn => projects.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  label: text("label").notNull(),
  doneAt: ts("done_at"),
  doneByUserId: uuid("done_by_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
});

export const questionnaireResponses = pgTable(
  "questionnaire_responses",
  {
    id: pk(),
    orgId: orgId(),
    projectId: uuid("project_id")
      .notNull()
      .references((): AnyPgColumn => projects.id, { onDelete: "cascade" }),
    questionnaireId: uuid("questionnaire_id")
      .notNull()
      .references((): AnyPgColumn => questionnaires.id, { onDelete: "restrict" }),
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default({}),
    submittedAt: ts("submitted_at"),
    submittedByUserId: uuid("submitted_by_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [unique("questionnaire_responses_project_uq").on(t.projectId, t.questionnaireId)],
);
