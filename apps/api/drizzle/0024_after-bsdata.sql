DROP TABLE "bsdata_files" CASCADE;--> statement-breakpoint
ALTER TABLE "game_updates" ADD COLUMN "added_name" text;--> statement-breakpoint
ALTER TABLE "game_updates" ADD COLUMN "added_start" text;--> statement-breakpoint
DELETE FROM "app_settings" WHERE "key" IN ('bsdataCheckedAt', 'bsdataReaderVersion', 'bsdataHistoryError');
