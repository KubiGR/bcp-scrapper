import type { PlayerRanking, RankingsResponse, TopRanks } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { wh40kElo } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const source = sampleSource();
  app = createApp({
    db,
    runner: new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS }),
    fetchQueue: testFetchQueue(db, source),
    bcpStatus: () =>
      Promise.resolve({
        source: 'fixtures',
        state: 'fixtures',
        accessTokenExpiresAt: null,
        lastRefreshAt: null,
      }),
    logger: silentLogger,
    eventRule: ALL_EVENTS,
    now: () => new Date('2026-09-29T12:00:00Z'),
  });
  await syncEvent({ db, source }, 'EVTTEAM0001');
});

describe('GET /api/rankings', () => {
  it('answers with ranked players, filters and paging', async () => {
    const body = (await (await app.request('/api/rankings?limit=3')).json()) as RankingsResponse;
    expect(body.players.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(body).toMatchObject({ total: 8, ranked: 8 });
    const ada = (await (await app.request('/api/rankings?search=ada')).json()) as RankingsResponse;
    expect(ada.players.map((p) => p.userId)).toEqual(['US-ADA']);
  });

  it('validates its input', async () => {
    expect((await app.request('/api/rankings?limit=0')).status).toBe(400);
  });

  it('gives the top ranks, and one player', async () => {
    const top = (await (await app.request('/api/rankings/top')).json()) as TopRanks;
    expect(Object.keys(top.ranks)).toHaveLength(8);
    expect(top.elo).toEqual({});
    const ada = (await (await app.request('/api/rankings/US-ADA')).json()) as PlayerRanking;
    expect(ada.history).toHaveLength(1);
    expect((await app.request('/api/rankings/US-NOBODY')).status).toBe(404);
  });

  it('gives the wh40k-elo rating of every stored player who has one, for their badges', async () => {
    const rated = (userId: string, elo: number) => ({
      userId,
      name: userId,
      elo,
      games: 10,
      wins: 5,
      losses: 5,
      draws: 0,
      importedAt: new Date(),
    });
    // US-NOT-HERE never played an event we store: left out.
    await db.insert(wh40kElo).values([rated('US-ADA', 1712.6), rated('US-NOT-HERE', 2000)]);
    const top = (await (await app.request('/api/rankings/top')).json()) as TopRanks;
    expect(top.elo).toEqual({ 'US-ADA': 1713 });
  });
});
