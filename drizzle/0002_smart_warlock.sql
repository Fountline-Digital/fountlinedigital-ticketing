CREATE TABLE "membership_team_roles" (
	"membership_id" uuid NOT NULL,
	"team_role_id" uuid NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	CONSTRAINT "membership_team_roles_membership_id_team_role_id_pk" PRIMARY KEY("membership_id","team_role_id")
);
--> statement-breakpoint
CREATE TABLE "team_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" varchar(7) DEFAULT '#c0c0c0' NOT NULL,
	"widgets" text[] DEFAULT '{}' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_roles_org_key_uq" UNIQUE("org_id","key")
);
--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "team_roles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN "team_role_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "team_role_id" uuid;--> statement-breakpoint
ALTER TABLE "membership_team_roles" ADD CONSTRAINT "membership_team_roles_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_team_roles" ADD CONSTRAINT "membership_team_roles_team_role_id_team_roles_id_fk" FOREIGN KEY ("team_role_id") REFERENCES "public"."team_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_roles" ADD CONSTRAINT "team_roles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_team_roles_role_idx" ON "membership_team_roles" USING btree ("team_role_id");--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_team_role_id_team_roles_id_fk" FOREIGN KEY ("team_role_id") REFERENCES "public"."team_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_team_role_id_team_roles_id_fk" FOREIGN KEY ("team_role_id") REFERENCES "public"."team_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_team_role_idx" ON "tickets" USING btree ("org_id","team_role_id");