ALTER TABLE "teams" ADD COLUMN "wins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "losses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "draws" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "teams" SET
  "wins" = (SELECT count(*) FROM jsonb_array_elements(COALESCE("raw"->'total_games', '[]'::jsonb)) g WHERE g->>'gameResult' = '2'),
  "losses" = (SELECT count(*) FROM jsonb_array_elements(COALESCE("raw"->'total_games', '[]'::jsonb)) g WHERE g->>'gameResult' = '0'),
  "draws" = (SELECT count(*) FROM jsonb_array_elements(COALESCE("raw"->'total_games', '[]'::jsonb)) g WHERE g->>'gameResult' = '1')
WHERE jsonb_typeof("raw"->'total_games') = 'array';
