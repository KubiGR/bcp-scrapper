UPDATE "events" SET "team_count" = ("raw_summary"->>'totalTeamPlayers')::int WHERE "is_team_event" AND "team_count" IS NULL AND ("raw_summary"->>'totalTeamPlayers') ~ '^[0-9]+$' AND ("raw_summary"->>'totalTeamPlayers')::int > 0;--> statement-breakpoint
UPDATE "events" SET "city" = trim("raw_summary"->>'city') WHERE "city" IS NULL AND trim("raw_summary"->>'city') <> '';
