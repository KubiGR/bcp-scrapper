ALTER TABLE "army_lists" ADD COLUMN "parsed_army" text;--> statement-breakpoint
ALTER TABLE "army_lists" ADD COLUMN "detachments" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "army_lists" ADD COLUMN "parsed_disposition" text;--> statement-breakpoint
ALTER TABLE "army_lists" ADD COLUMN "parser_version" integer DEFAULT 0 NOT NULL;