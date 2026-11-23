CREATE TABLE "app_lock" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"passcode_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
