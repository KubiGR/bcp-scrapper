import type { MetaResponse } from '@bcp/shared';
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
    now: () => new Date('2026-09-28T12:00:00Z'),
  });
  await syncEvent({ db, source }, 'EVTTEAM0001');
});

describe('GET /api/meta', () => {
  it('answers with faction rows and event counts', async () => {
    const response = await app.request('/api/meta?from=2026-01-01&to=2026-12-31');
    expect(response.status).toBe(200);
    const body = (await response.json()) as MetaResponse;
    expect(body.factions.length).toBeGreaterThan(0);
    expect(body.totals.players).toBeGreaterThan(0);
    expect(body.eventsLoaded).toBe(1);
  });

  it('adds weekly trends, and the reliable win rate of the same length of time before', async () => {
    await syncEvent({ db, source: sampleSource() }, 'EVTBRACKET01'); // 9 May
    // 20 Apr–31 May; the 42 days before (9 Mar–19 Apr) hold EVTTEAM0001 (28 Mar).
    const body = (await (
      await app.request('/api/meta?from=2026-04-20&to=2026-05-31')
    ).json()) as MetaResponse;
    expect(body.eventsLoaded).toBe(1);
    expect(body.weeks).toEqual(['2026-05-04']);
    expect(body.factions.every((f) => f.trend.length === 1)).toBe(true);
    expect(body.factions.some((f) => f.reliableBefore !== null)).toBe(true);
  });

  it('has no team section for singles only', async () => {
    const body = (await (
      await app.request('/api/meta?from=2026-01-01&to=2026-12-31&type=singles')
    ).json()) as MetaResponse;
    expect(body.teams).toBeNull();
    expect(body.teamEventsCounted).toBe(0);
  });

  it('validates its input', async () => {
    expect((await app.request('/api/meta?type=pairs')).status).toBe(400);
    expect((await app.request('/api/meta?from=2026-05-01&to=2026-01-01')).status).toBe(400);
  });
});
