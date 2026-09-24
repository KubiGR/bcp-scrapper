ALTER TABLE "list_queue" RENAME TO "fetch_queue";--> statement-breakpoint
ALTER TYPE "public"."list_queue_status" RENAME TO "fetch_queue_status";--> statement-breakpoint
ALTER SEQUENCE "list_queue_id_seq" RENAME TO "fetch_queue_id_seq";--> statement-breakpoint
ALTER TABLE "fetch_queue" RENAME CONSTRAINT "list_queue_pkey" TO "fetch_queue_pkey";--> statement-breakpoint
ALTER TABLE "fetch_queue" RENAME CONSTRAINT "list_queue_event_id_events_id_fk" TO "fetch_queue_event_id_events_id_fk";--> statement-breakpoint
ALTER TABLE "fetch_queue" RENAME CONSTRAINT "list_queue_player_id_players_id_fk" TO "fetch_queue_player_id_players_id_fk";--> statement-breakpoint
ALTER INDEX "list_queue_one_open_idx" RENAME TO "fetch_queue_one_open_idx";--> statement-breakpoint
ALTER INDEX "list_queue_claim_idx" RENAME TO "fetch_queue_claim_idx";--> statement-breakpoint
ALTER INDEX "list_queue_event_idx" RENAME TO "fetch_queue_event_idx";
