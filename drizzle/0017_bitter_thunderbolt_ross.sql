ALTER TABLE "meals" ADD COLUMN "source" text DEFAULT 'library' NOT NULL;--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "archived_at" timestamp with time zone;