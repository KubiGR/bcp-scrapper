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
