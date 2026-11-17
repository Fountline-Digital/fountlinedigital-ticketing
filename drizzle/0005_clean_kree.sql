CREATE TABLE "job_marks" (
	"org_id" uuid NOT NULL,
	"job" varchar(48) NOT NULL,
	"entity_id" uuid NOT NULL,
	"mark" varchar(64) DEFAULT '' NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_marks_job_entity_id_pk" PRIMARY KEY("job","entity_id")
);
--> statement-breakpoint
ALTER TABLE "job_marks" ADD CONSTRAINT "job_marks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;