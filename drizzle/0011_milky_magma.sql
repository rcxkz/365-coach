CREATE TYPE "public"."shopping_item_source" AS ENUM('derived', 'manual');--> statement-breakpoint
CREATE TYPE "public"."shopping_item_status" AS ENUM('needed', 'bought', 'have');--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"ingredient" text NOT NULL,
	"status" "shopping_item_status" DEFAULT 'needed' NOT NULL,
	"source" "shopping_item_source" DEFAULT 'derived' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week_plan_meals" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"meal_id" text NOT NULL,
	"reason" text,
	"cooked_on" date,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "week_plan_meals" ADD CONSTRAINT "week_plan_meals_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_items_week_ingredient_unique" ON "shopping_items" USING btree ("week_start","ingredient");