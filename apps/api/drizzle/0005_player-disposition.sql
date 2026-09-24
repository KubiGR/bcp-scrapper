ALTER TABLE "players" ADD COLUMN "disposition" text;--> statement-breakpoint
UPDATE "players" SET "disposition" = NULLIF(trim("raw"->'subFaction'->>'name'), '') WHERE "disposition" IS NULL;