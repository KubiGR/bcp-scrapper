import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import type { Wh40kEloClient, Wh40kEloPlayer } from '../wh40k-elo/client';
import { importWh40kElo, wh40kEloDue, wh40kEloLoader } from './wh40k-elo';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
});

const NOW = new Date('2026-10-20T06:00:00Z');
const player = (userId: string, elo: number): Wh40kEloPlayer => ({
  userId,
  name: userId,
  elo,
  peak: elo,
  games: 10,
  wins: 6,
  losses: 4,
  draws: 0,
  lastActive: null,
});

/** A fake site with the given pages; records which pages were asked for. */
function fakeSite(pages: Wh40kEloPlayer[][], failOn?: number) {
  const asked: number[] = [];
  const client: Wh40kEloClient = {
    leaderboard: (page) => {
      asked.push(page);
      if (page === failOn) return Promise.reject(new Error('down'));
      return Promise.resolve({ players: pages[page - 1] ?? [], totalPages: pages.length });
    },
  };
  return { client, asked };
}
const noPause = () => Promise.resolve();

describe('importWh40kElo', () => {
  it('reads every page, pausing between them, and stores the players', async () => {
    const pauses: number[] = [];
    const site = fakeSite([[player('A', 1800)], [player('B', 1600), player('A', 1700)]]);
    const count = await importWh40kElo(db, site.client, NOW, () => {
      pauses.push(1);
      return Promise.resolve();
    });
    expect(count).toBe(2);
    expect(site.asked).toEqual([1, 2]);
    expect(pauses).toHaveLength(1);
    const ratings = await wh40kEloLoader(db)();
    // A player listed twice (the board shifted between pages) keeps the first.
    expect(ratings.get('A')).toEqual({ elo: 1800, games: 10 });
    expect(ratings.get('B')?.elo).toBe(1600);
  });

  it('keeps the last import when a page fails', async () => {
    await importWh40kElo(db, fakeSite([[player('A', 1800)]]).client, NOW, noPause);
    await expect(
      importWh40kElo(db, fakeSite([[player('B', 1)], []], 2).client, NOW, noPause),
    ).rejects.toThrow('down');
    expect([...(await wh40kEloLoader(db)()).keys()]).toEqual(['A']);
  });
});

describe('wh40kEloDue', () => {
  it('is due daily after a success, and an hour after a failed try', async () => {
    expect(await wh40kEloDue(db, NOW)).toBe(true);
    await importWh40kElo(db, fakeSite([[player('A', 1800)]]).client, NOW, noPause);
    expect(await wh40kEloDue(db, new Date('2026-10-21T05:59:00Z'))).toBe(false);
    expect(await wh40kEloDue(db, new Date('2026-10-21T06:00:00Z'))).toBe(true);
    const later = new Date('2026-10-21T07:00:00Z');
    await importWh40kElo(db, fakeSite([[]], 1).client, later, noPause).catch(() => undefined);
    expect(await wh40kEloDue(db, new Date('2026-10-21T07:30:00Z'))).toBe(false);
    expect(await wh40kEloDue(db, new Date('2026-10-21T08:00:00Z'))).toBe(true);
  });
});
