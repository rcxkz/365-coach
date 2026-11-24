CREATE TABLE "week_plans" (
	"week_start" date PRIMARY KEY NOT NULL,
	"prep_on" date,
	"breakfasts" integer DEFAULT 0 NOT NULL,
	"lunches" integer DEFAULT 1 NOT NULL,
	"dinners" integer DEFAULT 5 NOT NULL,
	"list_built_at" timestamp with time zone,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "week_plan_meals" ADD COLUMN "make_on" date;--> statement-breakpoint
ALTER TABLE "week_plan_meals" ADD COLUMN "eat_days" text[];--> statement-breakpoint
-- Weeks planned before the list was built on request already have a
-- list: keep it, marked as built, so nothing disappears mid-week.
INSERT INTO "week_plans" ("week_start", "lunches", "dinners", "list_built_at", "changed_at")
SELECT "week_start",
       count(*) FILTER (WHERE "slot" = 'lunch'),
       count(*) FILTER (WHERE "slot" = 'dinner'),
       now(), now()
FROM "week_plan_meals"
GROUP BY "week_start"
ON CONFLICT DO NOTHING;
