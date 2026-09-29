import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { players } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { sampleSource } from '../test/helpers';
import { backfillPlayerUserIds } from './player-accounts';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await syncEvent({ db, source: sampleSource() }, 'EVTTEAM0001');
});

describe('backfillPlayerUserIds', () => {
  it('stores each player’s account id from their BCP data, once', async () => {
    await db.update(players).set({ bcpUserId: null });
    expect(await backfillPlayerUserIds(db)).toBe(8);
    const [ada] = await db.select().from(players).where(eq(players.id, 'PL-ADA'));
    expect(ada?.bcpUserId).toBe('US-ADA');
    expect(await backfillPlayerUserIds(db)).toBe(0);
  });

  it('leaves a player without an account id alone', async () => {
    await db
      .update(players)
      .set({ bcpUserId: null, raw: sql`${players.raw} - 'user'` })
      .where(eq(players.id, 'PL-ADA'));
    await backfillPlayerUserIds(db);
    const [ada] = await db.select().from(players).where(eq(players.id, 'PL-ADA'));
    expect(ada?.bcpUserId).toBeNull();
  });
});
