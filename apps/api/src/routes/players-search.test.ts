import type { PlayerSearchResponse } from '@bcp/shared';
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
    now: () => new Date('2026-09-27T12:00:00Z'),
  });
  await syncEvent({ db, source }, 'EVTBRACKET01');
});

describe('GET /api/players/search', () => {
  it('answers with qualifying players and event counts', async () => {
    const response = await app.request(
      '/api/players/search?from=2026-01-01&to=2026-12-31&maxLosses=5',
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as PlayerSearchResponse;
    expect(body.players.length).toBeGreaterThan(0);
    expect(body.players[0]).toMatchObject({
      eventId: 'EVTBRACKET01',
      eventName: expect.any(String) as unknown,
    });
    expect(body.eventsLoaded).toBe(1);
  });

  it('takes detachments separated by |, since names can contain commas', async () => {
    const response = await app.request(
      `/api/players/search?from=2026-01-01&to=2026-12-31&maxLosses=5&detachments=${encodeURIComponent('Flyboyz, Kult of Speed and Wreckas|War Horde')}`,
    );
    expect(response.status).toBe(200);
    const { PlayerSearchQuerySchema } = await import('@bcp/shared');
    expect(
      PlayerSearchQuerySchema.parse({ detachments: 'Flyboyz, Kult of Speed and Wreckas|War Horde' })
        .detachments,
    ).toEqual(['Flyboyz, Kult of Speed and Wreckas', 'War Horde']);
  });

  it('validates its input', async () => {
    expect((await app.request('/api/players/search?maxLosses=6')).status).toBe(400);
    expect((await app.request('/api/players/search?from=2026-05-01&to=2026-01-01')).status).toBe(
      400,
    );
  });
});
