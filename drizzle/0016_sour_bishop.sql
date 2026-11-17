CREATE TYPE "public"."aisle" AS ENUM('cupboard', 'protein', 'produce', 'other');--> statement-breakpoint
CREATE TABLE "custom_ingredients" (
	"key" text PRIMARY KEY NOT NULL,
	"aisle" "aisle" DEFAULT 'other' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pantry_items" ADD COLUMN "running_low" boolean DEFAULT false NOT NULL;