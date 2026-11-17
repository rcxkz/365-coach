CREATE TYPE "public"."pause_reason" AS ENUM('unwell', 'break');--> statement-breakpoint
CREATE TABLE "training_pauses" (
	"id" serial PRIMARY KEY NOT NULL,
	"reason" "pause_reason" NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "return_session" integer;