CREATE TYPE "public"."checkin_sleep" AS ENUM('poor', 'normal', 'good');--> statement-breakpoint
CREATE TYPE "public"."checkin_soreness" AS ENUM('none', 'mild', 'heavy');--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "sleep" "checkin_sleep";--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "soreness" "checkin_soreness";