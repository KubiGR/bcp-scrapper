ALTER TABLE "players" ADD COLUMN "bcp_user_id" text;--> statement-breakpoint
CREATE INDEX "players_user_idx" ON "players" USING btree ("bcp_user_id");