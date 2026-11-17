CREATE TABLE "project_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"estimated_minutes" integer,
	"status" text DEFAULT 'suggested' NOT NULL,
	"outcome" text,
	"suggested_on" date NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_ideas" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text,
	"raw_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mission" text,
	"definition_of_success" text,
	"status" text DEFAULT 'active' NOT NULL,
	"current_milestone" text,
	"blocker" text,
	"shared_with" text,
	"last_progress_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "today_actions" ADD COLUMN "project_action_id" integer;--> statement-breakpoint
ALTER TABLE "project_actions" ADD CONSTRAINT "project_actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_ideas" ADD CONSTRAINT "project_ideas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "today_actions" ADD CONSTRAINT "today_actions_project_action_id_project_actions_id_fk" FOREIGN KEY ("project_action_id") REFERENCES "public"."project_actions"("id") ON DELETE set null ON UPDATE no action;