import type { PlayerRanking, RankingsResponse, TopRanks } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
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
    const ada = (await (await app.request('/api/rankings/US-ADA')).json()) as PlayerRanking;
    expect(ada.history).toHaveLength(1);
    expect((await app.request('/api/rankings/US-NOBODY')).status).toBe(404);
  });
});
