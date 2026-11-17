CREATE TYPE "public"."digestion_state" AS ENUM('good', 'sluggish', 'bloated', 'unsettled');--> statement-breakpoint
CREATE TYPE "public"."stress_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"mood" integer,
	"stress" "stress_level",
	"energy" "checkin_energy",
	"soreness" "checkin_soreness",
	"digestion" "digestion_state",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
