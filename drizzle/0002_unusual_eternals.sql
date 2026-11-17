CREATE TYPE "public"."body_region" AS ENUM('upper', 'lower', 'full', 'core');--> statement-breakpoint
CREATE TYPE "public"."exercise_category" AS ENUM('strength', 'calisthenics', 'athleticism', 'conditioning', 'mobility', 'restoration', 'prehab');--> statement-breakpoint
CREATE TYPE "public"."movement_pattern" AS ENUM('vertical_pull', 'vertical_push', 'horizontal_pull', 'horizontal_push', 'squat', 'hinge', 'lunge', 'carry', 'rotation', 'anti_rotation', 'jump', 'sprint', 'isometric', 'locomotion', 'mobility');--> statement-breakpoint
CREATE TABLE "exercise_user_state" (
	"exercise_id" text PRIMARY KEY NOT NULL,
	"preference" integer DEFAULT 0 NOT NULL,
	"last_performed_at" timestamp with time zone,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] NOT NULL,
	"category" "exercise_category" NOT NULL,
	"movement_pattern" "movement_pattern" NOT NULL,
	"body_region" "body_region" NOT NULL,
	"equipment" text[] NOT NULL,
	"attributes" text[] NOT NULL,
	"goals" text[] NOT NULL,
	"difficulty" integer NOT NULL,
	"risk_level" integer NOT NULL,
	"avoid_areas" text[] NOT NULL,
	"caution_areas" text[] NOT NULL,
	"recovery_cost" integer NOT NULL,
	"sets_min" integer NOT NULL,
	"sets_max" integer NOT NULL,
	"reps_target" text NOT NULL,
	"rest_seconds" integer NOT NULL,
	"placements" text[] NOT NULL,
	"progressions" text[] NOT NULL,
	"regressions" text[] NOT NULL,
	"substitutions" text[] NOT NULL,
	"cues" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD COLUMN "library_exercise_id" text;--> statement-breakpoint
ALTER TABLE "exercise_user_state" ADD CONSTRAINT "exercise_user_state_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_library_exercise_id_exercises_id_fk" FOREIGN KEY ("library_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;