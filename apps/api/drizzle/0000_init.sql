CREATE TYPE "public"."game_result" AS ENUM('a_win', 'b_win', 'draw');--> statement-breakpoint
CREATE TYPE "public"."side" AS ENUM('a', 'b');--> statement-breakpoint
CREATE TYPE "public"."sync_kind" AS ENUM('catalog', 'event', 'pairings', 'lists');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "army_lists" (
	"player_id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"text" text,
	"raw" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bcp_session" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"last_refresh_at" timestamp with time zone,
	"seed_token_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bcp_session_singleton" CHECK ("bcp_session"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"country" text,
	"city" text,
	"player_count" integer NOT NULL,
	"team_count" integer,
	"is_team_event" boolean NOT NULL,
	"is_online" boolean NOT NULL,
	"round_count" integer NOT NULL,
	"ended" boolean NOT NULL,
	"hide_lists" boolean NOT NULL,
	"last_synced_at" timestamp with time zone,
	"raw_summary" jsonb,
	"raw_detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"round" integer NOT NULL,
	"table_no" integer,
	"team_matchup_id" text,
	"player_a_id" text NOT NULL,
	"player_b_id" text,
	"vp_a" real,
	"vp_b" real,
	"primary_a" real,
	"primary_b" real,
	"secondary_a" real,
	"secondary_b" real,
	"game_points_a" real,
	"game_points_b" real,
	"first_turn" "side",
	"result" "game_result",
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"team_id" text,
	"name" text NOT NULL,
	"faction" text,
	"parent_faction" text,
	"placing" integer,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"draws" integer NOT NULL,
	"dropped" boolean NOT NULL,
	"list_id" text,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "sync_kind" NOT NULL,
	"event_id" text,
	"params" jsonb NOT NULL,
	"status" "sync_status" NOT NULL,
	"total" integer,
	"done" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_matchups" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"round" integer NOT NULL,
	"table_no" integer,
	"team_a_id" text NOT NULL,
	"team_b_id" text,
	"points_a" real,
	"points_b" real,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"placing" integer,
	"round_points" jsonb NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "army_lists" ADD CONSTRAINT "army_lists_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_matchups" ADD CONSTRAINT "team_matchups_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_start_date_idx" ON "events" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "events_player_count_idx" ON "events" USING btree ("player_count");--> statement-breakpoint
CREATE INDEX "games_event_round_idx" ON "games" USING btree ("event_id","round");--> statement-breakpoint
CREATE INDEX "games_team_matchup_idx" ON "games" USING btree ("team_matchup_id");--> statement-breakpoint
CREATE INDEX "players_event_idx" ON "players" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "players_event_faction_idx" ON "players" USING btree ("event_id","faction");--> statement-breakpoint
CREATE INDEX "players_team_idx" ON "players" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_runs_one_active_idx" ON "sync_runs" USING btree ("kind",coalesce("event_id", '')) WHERE "sync_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "sync_runs_event_idx" ON "sync_runs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "team_matchups_event_round_idx" ON "team_matchups" USING btree ("event_id","round");--> statement-breakpoint
CREATE INDEX "teams_event_idx" ON "teams" USING btree ("event_id");