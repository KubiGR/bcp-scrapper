import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../drizzle/0003_fetch-queue.sql', import.meta.url), 'utf8');

describe('0003_fetch-queue migration', () => {
  it('renames the list queue in place, so queued lists survive', () => {
    expect(sql).toContain('ALTER TABLE "list_queue" RENAME TO "fetch_queue"');
    expect(sql).toContain('ALTER TYPE "public"."list_queue_status" RENAME TO "fetch_queue_status"');
    expect(sql).not.toMatch(/DROP TABLE|CREATE TABLE/i);
  });
});

const dispositionSql = readFileSync(
  new URL('../../drizzle/0005_player-disposition.sql', import.meta.url),
  'utf8',
);

describe('0005_player-disposition migration', () => {
  it('adds the column and backfills it from the stored raw JSON', () => {
    expect(dispositionSql).toContain('ADD COLUMN "disposition" text');
    expect(dispositionSql).toContain(
      `UPDATE "players" SET "disposition" = NULLIF(trim("raw"->'subFaction'->>'name'), '') WHERE "disposition" IS NULL;`,
    );
  });
});

const eventBackfillSql = readFileSync(
  new URL('../../drizzle/0006_backfill-event-team-count-city.sql', import.meta.url),
  'utf8',
);

describe('0006_backfill-event-team-count-city migration', () => {
  it('backfills team count and city from the stored search-result JSON, without touching existing values', () => {
    expect(eventBackfillSql).toContain(
      `UPDATE "events" SET "team_count" = ("raw_summary"->>'totalTeamPlayers')::int WHERE "is_team_event" AND "team_count" IS NULL AND ("raw_summary"->>'totalTeamPlayers') ~ '^[0-9]+$' AND ("raw_summary"->>'totalTeamPlayers')::int > 0;`,
    );
    expect(eventBackfillSql).toContain(
      `UPDATE "events" SET "city" = trim("raw_summary"->>'city') WHERE "city" IS NULL AND trim("raw_summary"->>'city') <> '';`,
    );
    expect(eventBackfillSql).not.toMatch(/DROP TABLE|CREATE TABLE|ADD COLUMN/i);
  });
});
