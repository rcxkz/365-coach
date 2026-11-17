CREATE TABLE "metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"value" real NOT NULL,
	"unit" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_kind_date_unique" ON "metrics" USING btree ("kind","date");