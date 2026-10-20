import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { events, games, players } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { sampleSource } from '../test/helpers';
import { eloLoader, loadElo } from './elo';

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

const game = (
  id: string,
  round: number,
  a: string,
  b: string | null,
  result: 'a_win' | 'b_win' | 'draw' | null,
) => ({ id, eventId: 'EVTTEAM0001', round, playerAId: a, playerBId: b, result, raw: {} });

describe('loadElo', () => {
  it('rates accounts from their games in round order, skipping byes and unplayed games', async () => {
    await db
      .insert(games)
      .values([
        game('G2', 2, 'PL-ADA', 'PL-CARA', 'a_win'),
        game('G1', 1, 'PL-ADA', 'PL-BEN', 'a_win'),
        game('G3', 2, 'PL-BEN', null, 'a_win'),
        game('G4', 3, 'PL-DAN', 'PL-EVE', null),
      ]);
    const ratings = await loadElo(db);
    expect(ratings.get('US-ADA')).toMatchObject({ games: 2, wins: 2 });
    // Round 1 first: Ada beat Ben at 1500 each (+16), then Cara (1500) for a bit less.
    expect(ratings.get('US-ADA')?.elo).toBeCloseTo(1516 + 32 * (1 - 1 / (1 + 10 ** (-16 / 400))));
    expect(ratings.get('US-BEN')).toMatchObject({ games: 1, losses: 1 });
    expect(ratings.has('US-DAN')).toBe(false);
  });

  it('leaves out players without an account', async () => {
    await db.update(players).set({ bcpUserId: null }).where(eq(players.id, 'PL-BEN'));
    await db.insert(games).values([game('G1', 1, 'PL-ADA', 'PL-BEN', 'a_win')]);
    expect((await loadElo(db)).size).toBe(0);
  });

  it('plays older events first', async () => {
    await syncEvent({ db, source: sampleSource() }, 'EVTBRACKET01');
    await db.update(players).set({ bcpUserId: 'US-ADA' }).where(eq(players.id, 'PB-R1'));
    await db.update(players).set({ bcpUserId: 'US-BEN' }).where(eq(players.id, 'PB-R2'));
    await db
      .update(events)
      .set({ startDate: new Date('2026-01-01') })
      .where(eq(events.id, 'EVTBRACKET01'));
    await db
      .insert(games)
      .values([
        game('G1', 1, 'PL-ADA', 'PL-BEN', 'b_win'),
        { ...game('G0', 5, 'PB-R1', 'PB-R2', 'a_win'), eventId: 'EVTBRACKET01' },
      ]);
    // Ada won first (older event) and lost after: a loss as the favourite costs more than 16.
    expect((await loadElo(db)).get('US-ADA')?.elo).toBeLessThan(1500);
  });
});

describe('eloLoader', () => {
  it('reuses the ratings until the games change', async () => {
    const load = eloLoader(db);
    await db.insert(games).values([game('G1', 1, 'PL-ADA', 'PL-BEN', 'a_win')]);
    const first = await load();
    expect(await load()).toBe(first);
    await db.insert(games).values([game('G2', 2, 'PL-ADA', 'PL-CARA', 'a_win')]);
    expect((await load()).get('US-ADA')?.games).toBe(2);
  });
});
