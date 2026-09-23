import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BcpStatus } from '@bcp/shared';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { SyncRunner } from '../sync/runner';
import { sampleSource, silentLogger } from '../test/helpers';

let db: Db;
let close: () => Promise<void>;
let runner: SyncRunner;
let app: ReturnType<typeof createApp>;

const status: BcpStatus = {
  source: 'fixtures',
  state: 'fixtures',
  accessTokenExpiresAt: null,
  lastRefreshAt: null,
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
  app = createApp({ db, runner, bcpStatus: () => Promise.resolve(status), logger: silentLogger });
});
afterAll(() => close());
beforeEach(() => resetDb(db));

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('API routes', () => {
  it('syncs the catalogue and then searches it', async () => {
    const started = await post('/api/sync', {
      kind: 'catalog',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(started.status).toBe(202);
    const run = (await started.json()) as { id: number };
    await runner.idle();

    const progress = await app.request(`/api/sync-runs/${run.id}`);
    expect(await progress.json()).toMatchObject({ status: 'succeeded', done: 3 });

    const search = await app.request('/api/events?minPlayers=40');
    expect(await search.json()).toMatchObject({ total: 1, items: [{ bcpId: 'EVTSINGLE01' }] });
  });

  it('returns a synced event, and 404 for an unknown one', async () => {
    await post('/api/sync', { kind: 'event', eventId: 'EVTTEAM0001' });
    await runner.idle();

    const found = await app.request('/api/events/EVTTEAM0001');
    expect(await found.json()).toMatchObject({
      city: 'Springfield',
      lastSyncedAt: expect.any(String),
    });

    const missing = await app.request('/api/events/NOPE');
    expect(missing.status).toBe(404);
  });

  it('validates sync requests and query strings', async () => {
    const badSync = await post('/api/sync', {
      kind: 'catalog',
      from: '2026-12-31',
      to: '2026-01-01',
    });
    expect(badSync.status).toBe(400);
    expect(await badSync.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const notJson = await app.request('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ kind: 'event', eventId: 'EVTTEAM0001' }),
    });
    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Content-Type must be application/json' },
    });

    expect((await app.request('/api/events?pageSize=1000')).status).toBe(400);
    expect((await app.request('/api/sync-runs/abc')).status).toBe(400);
    expect((await app.request('/api/sync-runs/999')).status).toBe(404);
  });

  it('reports the BCP connection status', async () => {
    expect(await (await app.request('/api/bcp/status')).json()).toEqual(status);
  });
});
