CREATE TYPE "public"."pairing_chip" AS ENUM('BOUYA', 'GG', 'G', 'Y', 'R', 'RR', 'F');--> statement-breakpoint
CREATE TABLE "pairing_ratings" (
	"event_id" text NOT NULL,
	"team_id" text NOT NULL,
	"opponent_team_id" text NOT NULL,
	"player_id" text NOT NULL,
	"opponent_player_id" text NOT NULL,
	"chip" "pairing_chip" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pairing_ratings_pk" PRIMARY KEY("event_id","team_id","opponent_team_id","player_id","opponent_player_id")
);
--> statement-breakpoint
ALTER TABLE "pairing_ratings" ADD CONSTRAINT "pairing_ratings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;