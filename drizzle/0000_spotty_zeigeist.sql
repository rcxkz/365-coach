CREATE TYPE "public"."action_kind" AS ENUM('workout', 'food', 'project', 'reminder', 'checkin');--> statement-breakpoint
CREATE TYPE "public"."action_status" AS ENUM('pending', 'done', 'skipped', 'moved');--> statement-breakpoint
CREATE TYPE "public"."checkin_energy" AS ENUM('low', 'normal', 'high');--> statement-breakpoint
CREATE TYPE "public"."life_domain" AS ENUM('fitness', 'fuel', 'money', 'mission', 'general');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."memory_tier" AS ENUM('long_term', 'active', 'temporary');--> statement-breakpoint
CREATE TYPE "public"."workout_status" AS ENUM('planned', 'completed', 'skipped');--> statement-breakpoint
CREATE TABLE "daily_checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"energy" "checkin_energy" NOT NULL,
	"time_available_minutes" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"tier" "memory_tier" NOT NULL,
	"domain" "life_domain" DEFAULT 'general' NOT NULL,
	"content" text NOT NULL,
	"status" "memory_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pain_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"location" text NOT NULL,
	"severity" integer NOT NULL,
	"aggravating_movement" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"exercise_id" integer NOT NULL,
	"set_number" integer NOT NULL,
	"reps" integer NOT NULL,
	"weight_kg" real,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "today_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"position" integer NOT NULL,
	"domain" "life_domain" NOT NULL,
	"kind" "action_kind" NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"rationale" text,
	"status" "action_status" DEFAULT 'pending' NOT NULL,
	"workout_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"workout_id" integer NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"target_sets" integer NOT NULL,
	"target_reps" text NOT NULL,
	"target_weight_kg" real,
	"in_short_version" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"status" "workout_status" DEFAULT 'planned' NOT NULL,
	"title" text NOT NULL,
	"focus" text,
	"rationale" text,
	"duration_minutes" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_exercise_id_workout_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."workout_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "today_actions" ADD CONSTRAINT "today_actions_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_checkins_date_unique" ON "daily_checkins" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "set_logs_exercise_set_unique" ON "set_logs" USING btree ("exercise_id","set_number");--> statement-breakpoint
CREATE UNIQUE INDEX "workouts_date_unique" ON "workouts" USING btree ("date");