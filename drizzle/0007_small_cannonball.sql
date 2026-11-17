CREATE TABLE "fuel_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"dinner_meal_id" text,
	"dinner_reason" text,
	"alternative_meal_id" text,
	"alternative_reason" text,
	"lunch_sorted" boolean DEFAULT false NOT NULL,
	"lunch_note" text,
	"mode" text DEFAULT 'rules' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_user_state" (
	"meal_id" text PRIMARY KEY NOT NULL,
	"make_again" boolean,
	"partner_liked" boolean,
	"last_cooked_on" date,
	"times_cooked" integer DEFAULT 0 NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"slots" text[] NOT NULL,
	"active_minutes" integer NOT NULL,
	"total_minutes" integer NOT NULL,
	"attention" text NOT NULL,
	"methods" text[] NOT NULL,
	"core_ingredients" text[] NOT NULL,
	"flex_ingredients" text[] NOT NULL,
	"protein_focus" text NOT NULL,
	"batch_friendly" boolean NOT NULL,
	"freezer_friendly" boolean NOT NULL,
	"steps" text[] NOT NULL,
	"tags" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pantry_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"ingredient" text NOT NULL,
	"note" text,
	"use_by_date" date,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "fuel_days" ADD CONSTRAINT "fuel_days_dinner_meal_id_meals_id_fk" FOREIGN KEY ("dinner_meal_id") REFERENCES "public"."meals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_days" ADD CONSTRAINT "fuel_days_alternative_meal_id_meals_id_fk" FOREIGN KEY ("alternative_meal_id") REFERENCES "public"."meals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_user_state" ADD CONSTRAINT "meal_user_state_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fuel_days_date_unique" ON "fuel_days" USING btree ("date");