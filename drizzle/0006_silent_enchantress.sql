CREATE TABLE "weekly_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"narrative" text NOT NULL,
	"summary" text NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_reviews_week_unique" ON "weekly_reviews" USING btree ("week_start");