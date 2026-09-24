CREATE TYPE "public"."fetch_job_kind" AS ENUM('list', 'event', 'pairings-round');--> statement-breakpoint
DROP INDEX "fetch_queue_one_open_idx";--> statement-breakpoint
ALTER TABLE "fetch_queue" ALTER COLUMN "player_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fetch_queue" ALTER COLUMN "list_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "pairings_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fetch_queue" ADD COLUMN "kind" "fetch_job_kind" DEFAULT 'list' NOT NULL;--> statement-breakpoint
ALTER TABLE "fetch_queue" ADD COLUMN "round" integer;--> statement-breakpoint
ALTER TABLE "fetch_queue" ADD COLUMN "follow_up" text;--> statement-breakpoint
CREATE UNIQUE INDEX "fetch_queue_one_open_event_idx" ON "fetch_queue" USING btree ("event_id") WHERE "fetch_queue"."kind" = 'event' and "fetch_queue"."status" in ('queued', 'fetching');--> statement-breakpoint
CREATE UNIQUE INDEX "fetch_queue_one_open_round_idx" ON "fetch_queue" USING btree ("event_id","round") WHERE "fetch_queue"."kind" = 'pairings-round' and "fetch_queue"."status" in ('queued', 'fetching');--> statement-breakpoint
CREATE UNIQUE INDEX "fetch_queue_one_open_idx" ON "fetch_queue" USING btree ("player_id") WHERE "fetch_queue"."kind" = 'list' and "fetch_queue"."status" in ('queued', 'fetching');--> statement-breakpoint
ALTER TABLE "fetch_queue" ADD CONSTRAINT "fetch_queue_list_target" CHECK ("fetch_queue"."kind" <> 'list' or ("fetch_queue"."player_id" is not null and "fetch_queue"."list_id" is not null));--> statement-breakpoint
ALTER TABLE "fetch_queue" ADD CONSTRAINT "fetch_queue_round_target" CHECK ("fetch_queue"."kind" <> 'pairings-round' or "fetch_queue"."round" is not null);