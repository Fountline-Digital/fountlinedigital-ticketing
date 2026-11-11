// Fixed, system-level value sets. Anything admins can rename or add to
// (statuses, types, priorities, lead stages, service lines, tiers) is a
// lookup table in config.ts instead; those carry a `kind`/`category` from
// here so app logic keeps working after a rename.
import { pgEnum } from "drizzle-orm/pg-core";

export const membershipRole = pgEnum("membership_role", [
  "admin",
  "manager",
  "worker",
  "contractor",
  "client",
]);

export const membershipStatus = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
  "revoked",
]);

export const statusCategory = pgEnum("status_category", [
  "new",
  "todo",
  "in_progress",
  "waiting",
  "review",
  "blocked",
  "done",
  "cancelled",
]);

export const ticketKind = pgEnum("ticket_kind", [
  "lead",
  "project_task",
  "support",
  "change_request",
  "internal",
]);

export const ticketSource = pgEnum("ticket_source", [
  "manual",
  "contact_form",
  "portal",
  "template",
  "automation",
]);

export const visibility = pgEnum("visibility", ["internal", "client"]);

export const ticketLinkKind = pgEnum("ticket_link_kind", [
  "related",
  "duplicate_of",
  "blocks",
]);

export const gateApprover = pgEnum("gate_approver", [
  "none",
  "manager",
  "client",
  "both",
]);

export const approverKind = pgEnum("approver_kind", ["manager", "client"]);

export const phaseStatus = pgEnum("phase_status", [
  "locked",
  "active",
  "awaiting_approval",
  "complete",
]);

export const approvalDecision = pgEnum("approval_decision", [
  "pending",
  "approved",
  "rejected",
]);

export const projectStatus = pgEnum("project_status", [
  "active",
  "on_hold",
  "completed",
  "archived",
  "cancelled",
]);

export const clientStatus = pgEnum("client_status", ["active", "archived"]);

export const packageStatus = pgEnum("package_status", [
  "draft",
  "active",
  "retired",
]);

export const pickerAccess = pgEnum("picker_access", ["none", "starter", "full"]);

export const changeRequestStatus = pgEnum("change_request_status", [
  "draft",
  "pending_client",
  "approved",
  "declined",
  "cancelled",
]);

export const designStatus = pgEnum("design_status", [
  "draft",
  "active",
  "hidden",
  "retired",
]);

export const logoBatchStatus = pgEnum("logo_batch_status", [
  "draft",
  "published",
  "chosen",
  "revision_requested",
]);

export const leadStageKind = pgEnum("lead_stage_kind", ["open", "won", "lost"]);

export const questionKind = pgEnum("question_kind", [
  "short_text",
  "long_text",
  "single_select",
  "multi_select",
  "file",
  "url",
  "date",
]);

export const assignmentStrategy = pgEnum("assignment_strategy", [
  "fixed",
  "round_robin",
]);

export const automationKind = pgEnum("automation_kind", [
  "approval_reminder",
  "auto_close_waiting",
  "escalate_overdue",
]);

export const legalDocKind = pgEnum("legal_doc_kind", ["terms", "privacy"]);

export const actorKind = pgEnum("actor_kind", ["user", "system"]);
