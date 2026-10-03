CREATE TABLE "bsdata_commits" (
	"sha" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"start_override" text,
	"merged" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
