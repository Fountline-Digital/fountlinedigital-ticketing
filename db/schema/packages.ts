// Admin-editable packages and their versioned templates.
// A project always points at the package_version it started with, so editing a
// package (which creates a new version) never changes projects in progress.
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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { pk, timestamps, ts } from "./columns";
import { gateApprover, membershipRole, packageStatus, pickerAccess, questionKind } from "./enums";
import { orgId } from "./org";
import { users } from "./auth";
import { serviceLines, tiers, ticketTypes } from "./config";
import { teamRoles } from "./teams";

export const packages = pgTable(
  "packages",
  {
    id: pk(),
    orgId: orgId(),
    key: varchar("key", { length: 32 }).notNull(), // FD-WEB-BUS
    serviceLineId: uuid("service_line_id")
      .notNull()
      .references((): AnyPgColumn => serviceLines.id, { onDelete: "restrict" }),
    tierId: uuid("tier_id")
      .notNull()
      .references((): AnyPgColumn => tiers.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents"),
    status: packageStatus("status").notNull().default("draft"),
    currentVersionId: uuid("current_version_id").references((): AnyPgColumn => packageVersions.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [unique("packages_org_key_uq").on(t.orgId, t.key)],
);

export const packageVersions = pgTable(
  "package_versions",
  {
    id: pk(),
    orgId: orgId(),
    packageId: uuid("package_id")
      .notNull()
      .references((): AnyPgColumn => packages.id, { onDelete: "cascade" }),
    version: integer("version").notNull(), // FD-WEB-BUS-v3
    revisionRounds: integer("revision_rounds").notNull().default(2),
    responseTargetMinutes: integer("response_target_minutes"), // business minutes
    pickerAccess: pickerAccess("picker_access").notNull().default("none"),
    websiteDesignsOffered: integer("website_designs_offered"), // 3-5
    logoConceptsPerBatch: integer("logo_concepts_per_batch"),
    closeoutChecklist: jsonb("closeout_checklist").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    publishedAt: ts("published_at"),
    createdByUserId: uuid("created_by_user_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [unique("package_versions_package_version_uq").on(t.packageId, t.version)],
);

export const phaseTemplates = pgTable(
  "phase_templates",
  {
    id: pk(),
    orgId: orgId(),
    packageVersionId: uuid("package_version_id")
      .notNull()
      .references((): AnyPgColumn => packageVersions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(), // P1, P2, ...
    name: text("name").notNull(),
    description: text("description"),
    gateApprover: gateApprover("gate_approver").notNull().default("none"),
    revisionRounds: integer("revision_rounds"), // overrides the package default
  },
  (t) => [unique("phase_templates_version_position_uq").on(t.packageVersionId, t.position)],
);

export const taskTemplates = pgTable(
  "task_templates",
  {
    id: pk(),
    orgId: orgId(),
    phaseTemplateId: uuid("phase_template_id")
      .notNull()
      .references((): AnyPgColumn => phaseTemplates.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    code: varchar("code", { length: 16 }).notNull(), // "2.03" -> FD-WEB-BUS-2.03
    title: text("title").notNull(),
    description: text("description"),
    ticketTypeId: uuid("ticket_type_id").references((): AnyPgColumn => ticketTypes.id, { onDelete: "set null" }),
    defaultRole: membershipRole("default_role"), // legacy; team_role_id is used now
    teamRoleId: uuid("team_role_id").references((): AnyPgColumn => teamRoles.id, { onDelete: "set null" }),
    estimateMinutes: integer("estimate_minutes"),
    checklist: jsonb("checklist").$type<string[]>().notNull().default([]),
    isClientVisible: boolean("is_client_visible").notNull().default(false),
  },
  (t) => [unique("task_templates_phase_position_uq").on(t.phaseTemplateId, t.position)],
);

export const taskTemplateDependencies = pgTable(
  "task_template_dependencies",
  {
    taskTemplateId: uuid("task_template_id")
      .notNull()
      .references((): AnyPgColumn => taskTemplates.id, { onDelete: "cascade" }),
    dependsOnTaskTemplateId: uuid("depends_on_task_template_id")
      .notNull()
      .references((): AnyPgColumn => taskTemplates.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskTemplateId, t.dependsOnTaskTemplateId] })],
);

// Client intake questionnaire, editable per package.
export const questionnaires = pgTable("questionnaires", {
  id: pk(),
  orgId: orgId(),
  packageId: uuid("package_id").references((): AnyPgColumn => packages.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const questionnaireQuestions = pgTable(
  "questionnaire_questions",
  {
    id: pk(),
    orgId: orgId(),
    questionnaireId: uuid("questionnaire_id")
      .notNull()
      .references((): AnyPgColumn => questionnaires.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    helpText: text("help_text"),
    kind: questionKind("kind").notNull(),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    isRequired: boolean("is_required").notNull().default(false),
  },
  (t) => [unique("questionnaire_questions_position_uq").on(t.questionnaireId, t.position)],
);
