CREATE TYPE "public"."list_queue_status" AS ENUM('queued', 'fetching', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "list_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"player_id" text NOT NULL,
	"list_id" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" "list_queue_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"error_code" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "list_queue" ADD CONSTRAINT "list_queue_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_queue" ADD CONSTRAINT "list_queue_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "list_queue_one_open_idx" ON "list_queue" USING btree ("player_id") WHERE "list_queue"."status" in ('queued', 'fetching');--> statement-breakpoint
CREATE INDEX "list_queue_claim_idx" ON "list_queue" USING btree ("status","priority" desc,"queued_at");--> statement-breakpoint
CREATE INDEX "list_queue_event_idx" ON "list_queue" USING btree ("event_id","status");