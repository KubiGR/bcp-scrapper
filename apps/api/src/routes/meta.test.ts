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
