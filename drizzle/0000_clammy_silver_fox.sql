CREATE TYPE "public"."actor_kind" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."approver_kind" AS ENUM('manager', 'client');--> statement-breakpoint
CREATE TYPE "public"."assignment_strategy" AS ENUM('fixed', 'round_robin');--> statement-breakpoint
CREATE TYPE "public"."automation_kind" AS ENUM('approval_reminder', 'auto_close_waiting', 'escalate_overdue');--> statement-breakpoint
CREATE TYPE "public"."change_request_status" AS ENUM('draft', 'pending_client', 'approved', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."design_status" AS ENUM('draft', 'active', 'hidden', 'retired');--> statement-breakpoint
CREATE TYPE "public"."gate_approver" AS ENUM('none', 'manager', 'client', 'both');--> statement-breakpoint
CREATE TYPE "public"."lead_stage_kind" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."legal_doc_kind" AS ENUM('terms', 'privacy');--> statement-breakpoint
CREATE TYPE "public"."logo_batch_status" AS ENUM('draft', 'published', 'chosen', 'revision_requested');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('admin', 'manager', 'worker', 'contractor', 'client');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."package_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."phase_status" AS ENUM('locked', 'active', 'awaiting_approval', 'complete');--> statement-breakpoint
CREATE TYPE "public"."picker_access" AS ENUM('none', 'starter', 'full');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'on_hold', 'completed', 'archived', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."question_kind" AS ENUM('short_text', 'long_text', 'single_select', 'multi_select', 'file', 'url', 'date');--> statement-breakpoint
CREATE TYPE "public"."status_category" AS ENUM('new', 'todo', 'in_progress', 'waiting', 'review', 'blocked', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ticket_kind" AS ENUM('lead', 'project_task', 'support', 'change_request', 'internal');--> statement-breakpoint
CREATE TYPE "public"."ticket_link_kind" AS ENUM('related', 'duplicate_of', 'blocks');--> statement-breakpoint
CREATE TYPE "public"."ticket_source" AS ENUM('manual', 'contact_form', 'portal', 'template', 'automation');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(64) NOT NULL,
	"key_prefix" varchar(6) NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/New_York' NOT NULL,
	"logo_file_id" uuid,
	"brand_colors" jsonb,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_mfa" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"totp_secret_encrypted" text NOT NULL,
	"recovery_codes_hashed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "holidays_org_date_uq" UNIQUE("org_id","date")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"client_id" uuid,
	"access_expires_at" timestamp with time zone,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"invited_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"status" "membership_status" DEFAULT 'invited' NOT NULL,
	"client_id" uuid,
	"title" text,
	"access_expires_at" timestamp with time zone,
	"invited_by_user_id" uuid,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_user_uq" UNIQUE("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "org_counters" (
	"org_id" uuid NOT NULL,
	"scope" varchar(96) NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "org_counters_org_id_scope_pk" PRIMARY KEY("org_id","scope")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"org_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"permission" varchar(64) NOT NULL,
	"allowed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_org_id_role_permission_pk" PRIMARY KEY("org_id","role","permission")
);
--> statement-breakpoint
CREATE TABLE "assignment_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"service_line_id" uuid,
	"ticket_type_id" uuid,
	"strategy" "assignment_strategy" DEFAULT 'fixed' NOT NULL,
	"assignee_membership_id" uuid,
	"pool_membership_ids" uuid[] DEFAULT '{}' NOT NULL,
	"last_assigned_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "automation_kind" NOT NULL,
	"after_days" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_rules_org_kind_uq" UNIQUE("org_id","kind")
);
--> statement-breakpoint
CREATE TABLE "contact_form_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"package_id" uuid,
	"ticket_type_id" uuid,
	"priority_id" uuid,
	"assignee_membership_id" uuid,
	"title_template" text DEFAULT 'New inquiry: {name}' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"url_encrypted" text NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "lead_stage_kind" DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "legal_doc_kind" NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_documents_org_kind_version_uq" UNIQUE("org_id","kind","version")
);
--> statement-breakpoint
CREATE TABLE "lost_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"membership_id" uuid NOT NULL,
	"event_key" varchar(64) NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_preferences_membership_id_event_key_pk" PRIMARY KEY("membership_id","event_key")
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_key" varchar(64) NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_org_event_uq" UNIQUE("org_id","event_key")
);
--> statement-breakpoint
CREATE TABLE "phase_names" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "priorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"color" varchar(7) DEFAULT '#6B7280' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" varchar(8) NOT NULL,
	CONSTRAINT "service_lines_org_code_uq" UNIQUE("org_id","code")
);
--> statement-breakpoint
CREATE TABLE "terms_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "ticket_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" "status_category" NOT NULL,
	"color" varchar(7) DEFAULT '#6B7280' NOT NULL,
	"pauses_response_clock" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "ticket_kind" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" varchar(8) NOT NULL,
	CONSTRAINT "tiers_org_code_uq" UNIQUE("org_id","code")
);
--> statement-breakpoint
CREATE TABLE "package_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"revision_rounds" integer DEFAULT 2 NOT NULL,
	"response_target_minutes" integer,
	"picker_access" "picker_access" DEFAULT 'none' NOT NULL,
	"website_designs_offered" integer,
	"logo_concepts_per_batch" integer,
	"closeout_checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"published_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "package_versions_package_version_uq" UNIQUE("package_id","version")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" varchar(32) NOT NULL,
	"service_line_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer,
	"status" "package_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_org_key_uq" UNIQUE("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "phase_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"package_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"gate_approver" "gate_approver" DEFAULT 'none' NOT NULL,
	"revision_rounds" integer,
	CONSTRAINT "phase_templates_version_position_uq" UNIQUE("package_version_id","position")
);
--> statement-breakpoint
CREATE TABLE "questionnaire_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"questionnaire_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"kind" "question_kind" NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	CONSTRAINT "questionnaire_questions_position_uq" UNIQUE("questionnaire_id","position")
);
--> statement-breakpoint
CREATE TABLE "questionnaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"package_id" uuid,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_template_dependencies" (
	"task_template_id" uuid NOT NULL,
	"depends_on_task_template_id" uuid NOT NULL,
	CONSTRAINT "task_template_dependencies_task_template_id_depends_on_task_template_id_pk" PRIMARY KEY("task_template_id","depends_on_task_template_id")
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"phase_template_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"code" varchar(16) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"ticket_type_id" uuid,
	"default_role" "membership_role",
	"estimate_minutes" integer,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_client_visible" boolean DEFAULT false NOT NULL,
	CONSTRAINT "task_templates_phase_position_uq" UNIQUE("phase_template_id","position")
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_approver" boolean DEFAULT false NOT NULL,
	"is_billing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" varchar(6) NOT NULL,
	"key" varchar(16) NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"phone" text,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"converted_from_ticket_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "clients_org_code_uq" UNIQUE("org_id","code"),
	CONSTRAINT "clients_org_key_uq" UNIQUE("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "closeout_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"done_at" timestamp with time zone,
	"done_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "phase_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_phase_id" uuid NOT NULL,
	"approver_kind" "approver_kind" NOT NULL,
	"round_number" integer DEFAULT 1 NOT NULL,
	"decision" "approval_decision" DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_membership_id_pk" PRIMARY KEY("project_id","membership_id")
);
--> statement-breakpoint
CREATE TABLE "project_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_template_id" uuid,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"status" "phase_status" DEFAULT 'locked' NOT NULL,
	"gate_approver" "gate_approver" DEFAULT 'none' NOT NULL,
	"revision_rounds_allowed" integer DEFAULT 0 NOT NULL,
	"revision_rounds_used" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_phases_project_position_uq" UNIQUE("project_id","position")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" varchar(24) NOT NULL,
	"year" smallint NOT NULL,
	"sequence" integer NOT NULL,
	"client_id" uuid NOT NULL,
	"package_version_id" uuid NOT NULL,
	"service_line_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"start_date" date,
	"target_launch_date" date,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"closeout_signed_off_at" timestamp with time zone,
	"closeout_signed_off_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "projects_org_key_uq" UNIQUE("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "questionnaire_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"questionnaire_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_responses_project_uq" UNIQUE("project_id","questionnaire_id")
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" varchar(32) NOT NULL,
	"project_id" uuid NOT NULL,
	"ticket_id" uuid,
	"project_phase_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"price_cents" integer,
	"estimate_minutes" integer,
	"status" "change_request_status" DEFAULT 'draft' NOT NULL,
	"requested_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_requests_org_key_uq" UNIQUE("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "comment_mentions" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "comment_mentions_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"visibility" "visibility" DEFAULT 'internal' NOT NULL,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_membership_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"view" varchar(16) DEFAULT 'list' NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"done_at" timestamp with time zone,
	"done_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "ticket_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"from_ticket_id" uuid NOT NULL,
	"to_ticket_id" uuid NOT NULL,
	"kind" "ticket_link_kind" NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_links_uq" UNIQUE("from_ticket_id","to_ticket_id","kind")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"key" varchar(24) NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"status_id" uuid NOT NULL,
	"priority_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source" "ticket_source" DEFAULT 'manual' NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"project_phase_id" uuid,
	"task_template_id" uuid,
	"assignee_membership_id" uuid,
	"reporter_user_id" uuid,
	"due_at" timestamp with time zone,
	"estimate_minutes" integer,
	"is_client_visible" boolean DEFAULT false NOT NULL,
	"lead_stage_id" uuid,
	"lost_reason_id" uuid,
	"lead_contact" jsonb,
	"form_data" jsonb,
	"response_due_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "tickets_org_number_uq" UNIQUE("org_id","number"),
	CONSTRAINT "tickets_org_key_uq" UNIQUE("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "logo_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"number" integer NOT NULL,
	"status" "logo_batch_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"client_comment" text,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logo_batches_client_number_uq" UNIQUE("client_id","number")
);
--> statement-breakpoint
CREATE TABLE "logo_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"key" varchar(32) NOT NULL,
	"name" text,
	"file_id" uuid NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"is_chosen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logo_concepts_org_key_uq" UNIQUE("org_id","key"),
	CONSTRAINT "logo_concepts_batch_number_uq" UNIQUE("batch_id","number")
);
--> statement-breakpoint
CREATE TABLE "project_design_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"design_id" uuid NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"offered_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_design_offers_uq" UNIQUE("project_id","design_id")
);
--> statement-breakpoint
CREATE TABLE "website_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_collections_org_number_uq" UNIQUE("org_id","number")
);
--> statement-breakpoint
CREATE TABLE "website_design_images" (
	"design_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "website_design_images_design_id_file_id_pk" PRIMARY KEY("design_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "website_designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"key" varchar(48) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"preview_url" text,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"style_options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"in_starter_set" boolean DEFAULT false NOT NULL,
	"in_business" boolean DEFAULT true NOT NULL,
	"status" "design_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_designs_org_key_uq" UNIQUE("org_id","key"),
	CONSTRAINT "website_designs_collection_number_uq" UNIQUE("collection_id","number")
);
--> statement-breakpoint
CREATE TABLE "website_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"design_id" uuid NOT NULL,
	"colors" jsonb,
	"fonts" jsonb,
	"submitted_at" timestamp with time zone,
	"submitted_by_user_id" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_selections_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded_by_user_id" uuid,
	"client_id" uuid,
	"project_id" uuid,
	"ticket_id" uuid,
	"comment_id" uuid,
	"visibility" "visibility" DEFAULT 'internal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"actor_kind" "actor_kind" DEFAULT 'user' NOT NULL,
	"actor_user_id" uuid,
	"actor_role" "membership_role",
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(48),
	"entity_id" uuid,
	"entity_key" varchar(48),
	"changes" jsonb,
	"metadata" jsonb,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"event_key" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text,
	"ticket_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mfa" ADD CONSTRAINT "user_mfa_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_counters" ADD CONSTRAINT "org_counters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_service_line_id_service_lines_id_fk" FOREIGN KEY ("service_line_id") REFERENCES "public"."service_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_assignee_membership_id_memberships_id_fk" FOREIGN KEY ("assignee_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_form_rules" ADD CONSTRAINT "contact_form_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_form_rules" ADD CONSTRAINT "contact_form_rules_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_form_rules" ADD CONSTRAINT "contact_form_rules_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_form_rules" ADD CONSTRAINT "contact_form_rules_priority_id_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_form_rules" ADD CONSTRAINT "contact_form_rules_assignee_membership_id_memberships_id_fk" FOREIGN KEY ("assignee_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_webhooks" ADD CONSTRAINT "discord_webhooks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_stages" ADD CONSTRAINT "lead_stages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lost_reasons" ADD CONSTRAINT "lost_reasons_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_names" ADD CONSTRAINT "phase_names_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_forms" ADD CONSTRAINT "request_forms_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_forms" ADD CONSTRAINT "request_forms_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_lines" ADD CONSTRAINT "service_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_statuses" ADD CONSTRAINT "ticket_statuses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiers" ADD CONSTRAINT "tiers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_versions" ADD CONSTRAINT "package_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_versions" ADD CONSTRAINT "package_versions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_versions" ADD CONSTRAINT "package_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_service_line_id_service_lines_id_fk" FOREIGN KEY ("service_line_id") REFERENCES "public"."service_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_tier_id_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_current_version_id_package_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."package_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_templates" ADD CONSTRAINT "phase_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_templates" ADD CONSTRAINT "phase_templates_package_version_id_package_versions_id_fk" FOREIGN KEY ("package_version_id") REFERENCES "public"."package_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_questionnaire_id_questionnaires_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_template_dependencies" ADD CONSTRAINT "task_template_dependencies_task_template_id_task_templates_id_fk" FOREIGN KEY ("task_template_id") REFERENCES "public"."task_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_template_dependencies" ADD CONSTRAINT "task_template_dependencies_depends_on_task_template_id_task_templates_id_fk" FOREIGN KEY ("depends_on_task_template_id") REFERENCES "public"."task_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_phase_template_id_phase_templates_id_fk" FOREIGN KEY ("phase_template_id") REFERENCES "public"."phase_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_converted_from_ticket_id_tickets_id_fk" FOREIGN KEY ("converted_from_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closeout_items" ADD CONSTRAINT "closeout_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closeout_items" ADD CONSTRAINT "closeout_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closeout_items" ADD CONSTRAINT "closeout_items_done_by_user_id_users_id_fk" FOREIGN KEY ("done_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_approvals" ADD CONSTRAINT "phase_approvals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_approvals" ADD CONSTRAINT "phase_approvals_project_phase_id_project_phases_id_fk" FOREIGN KEY ("project_phase_id") REFERENCES "public"."project_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_approvals" ADD CONSTRAINT "phase_approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_phase_template_id_phase_templates_id_fk" FOREIGN KEY ("phase_template_id") REFERENCES "public"."phase_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_package_version_id_package_versions_id_fk" FOREIGN KEY ("package_version_id") REFERENCES "public"."package_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_service_line_id_service_lines_id_fk" FOREIGN KEY ("service_line_id") REFERENCES "public"."service_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_closeout_signed_off_by_user_id_users_id_fk" FOREIGN KEY ("closeout_signed_off_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_questionnaire_id_questionnaires_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_phase_id_project_phases_id_fk" FOREIGN KEY ("project_phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_owner_membership_id_memberships_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_checklist_items" ADD CONSTRAINT "ticket_checklist_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_checklist_items" ADD CONSTRAINT "ticket_checklist_items_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_checklist_items" ADD CONSTRAINT "ticket_checklist_items_done_by_user_id_users_id_fk" FOREIGN KEY ("done_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_from_ticket_id_tickets_id_fk" FOREIGN KEY ("from_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_to_ticket_id_tickets_id_fk" FOREIGN KEY ("to_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_links" ADD CONSTRAINT "ticket_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_id_ticket_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."ticket_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_priority_id_priorities_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priorities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_phase_id_project_phases_id_fk" FOREIGN KEY ("project_phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_task_template_id_task_templates_id_fk" FOREIGN KEY ("task_template_id") REFERENCES "public"."task_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_membership_id_memberships_id_fk" FOREIGN KEY ("assignee_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_lead_stage_id_lead_stages_id_fk" FOREIGN KEY ("lead_stage_id") REFERENCES "public"."lead_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_lost_reason_id_lost_reasons_id_fk" FOREIGN KEY ("lost_reason_id") REFERENCES "public"."lost_reasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_batches" ADD CONSTRAINT "logo_batches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_batches" ADD CONSTRAINT "logo_batches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_batches" ADD CONSTRAINT "logo_batches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_batches" ADD CONSTRAINT "logo_batches_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_concepts" ADD CONSTRAINT "logo_concepts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_concepts" ADD CONSTRAINT "logo_concepts_batch_id_logo_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."logo_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logo_concepts" ADD CONSTRAINT "logo_concepts_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_design_offers" ADD CONSTRAINT "project_design_offers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_design_offers" ADD CONSTRAINT "project_design_offers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_design_offers" ADD CONSTRAINT "project_design_offers_design_id_website_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."website_designs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_design_offers" ADD CONSTRAINT "project_design_offers_offered_by_user_id_users_id_fk" FOREIGN KEY ("offered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_collections" ADD CONSTRAINT "website_collections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_design_images" ADD CONSTRAINT "website_design_images_design_id_website_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."website_designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_design_images" ADD CONSTRAINT "website_design_images_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_designs" ADD CONSTRAINT "website_designs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_designs" ADD CONSTRAINT "website_designs_collection_id_website_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."website_collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_selections" ADD CONSTRAINT "website_selections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_selections" ADD CONSTRAINT "website_selections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_selections" ADD CONSTRAINT "website_selections_design_id_website_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."website_designs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_selections" ADD CONSTRAINT "website_selections_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_org_email_idx" ON "invites" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "memberships_client_idx" ON "memberships" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "phase_approvals_phase_idx" ON "phase_approvals" USING btree ("project_phase_id");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "change_requests_project_idx" ON "change_requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "comments_ticket_idx" ON "comments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_checklist_items_ticket_idx" ON "ticket_checklist_items" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_links_to_idx" ON "ticket_links" USING btree ("to_ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_org_status_idx" ON "tickets" USING btree ("org_id","status_id");--> statement-breakpoint
CREATE INDEX "tickets_assignee_idx" ON "tickets" USING btree ("assignee_membership_id");--> statement-breakpoint
CREATE INDEX "tickets_project_idx" ON "tickets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tickets_client_idx" ON "tickets" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "tickets_due_idx" ON "tickets" USING btree ("org_id","due_at");--> statement-breakpoint
CREATE INDEX "files_project_idx" ON "files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "files_ticket_idx" ON "files" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "audit_log_org_created_idx" ON "audit_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_user_id","read_at");