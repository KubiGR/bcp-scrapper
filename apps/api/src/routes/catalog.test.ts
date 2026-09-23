import {
  addDays,
  latestWindow,
  toIsoDate,
  type BcpStatus,
  type CatalogCoverage,
  type LatestRefresh,
} from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { SyncRunner } from '../sync/runner';
import { sampleSource, silentLogger } from '../test/helpers';

const status: BcpStatus = {
  source: 'fixtures',
  state: 'fixtures',
  accessTokenExpiresAt: null,
  lastRefreshAt: null,
};

let db: Db;
let close: () => Promise<void>;
let runner: SyncRunner;
let app: ReturnType<typeof createApp>;
// Real time: finishedAt timestamps are written with the real clock.
let now = new Date();

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
  app = createApp({
    db,
    runner,
    bcpStatus: () => Promise.resolve(status),
    logger: silentLogger,
    now: () => now,
  });
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  now = new Date();
});

const postLatest = async () =>
  (await (
    await app.request('/api/catalog/latest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
  ).json()) as LatestRefresh;

const coverage = async () =>
  (await (await app.request('/api/catalog/coverage')).json()) as CatalogCoverage;

describe('catalogue routes', () => {
  it('reports an empty catalogue', async () => {
    expect(await coverage()).toEqual({ ranges: [], lastSyncedAt: null, activeRun: null });
  });

  it('refreshes the latest window once, then skips it while fresh', async () => {
    const window = latestWindow(now);
    const first = await postLatest();
    expect(first.window).toEqual(window);
    expect(first.run).toMatchObject({ kind: 'catalog', range: window });
    await runner.idle();

    // The days after the run finished (the rest of the window) don't count as covered.
    expect(await coverage()).toMatchObject({
      ranges: [{ from: window.from, to: toIsoDate(new Date()) }],
      lastSyncedAt: expect.any(String),
      activeRun: null,
    });
    expect((await postLatest()).run).toBeNull();

    now = new Date(now.getTime() + 7 * 3_600_000);
    expect((await postLatest()).run).not.toBeNull();
    await runner.idle();
  });

  it('merges catalogue runs into coverage ranges', async () => {
    for (const range of [
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2026-02-01', to: '2026-02-10' },
    ]) {
      await app.request('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'catalog', ...range }),
      });
      await runner.idle();
    }
    expect((await coverage()).ranges).toMatchObject([{ from: '2026-01-01', to: '2026-02-10' }]);
  });

  it('only counts the days up to when a run finished as covered', async () => {
    const today = toIsoDate(new Date());
    for (const range of [
      { from: addDays(today, -10), to: addDays(today, 30) },
      { from: addDays(today, 40), to: addDays(today, 50) },
    ]) {
      await app.request('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'catalog', ...range }),
      });
      await runner.idle();
    }
    expect((await coverage()).ranges).toMatchObject([{ from: addDays(today, -10), to: today }]);
  });

  it('requires a JSON content type (any casing) for the refresh', async () => {
    expect((await app.request('/api/catalog/latest', { method: 'POST' })).status).toBe(400);
    const upper = await app.request('/api/catalog/latest', {
      method: 'POST',
      headers: { 'content-type': 'Application/JSON' },
      body: '{}',
    });
    expect(upper.status).toBe(200);
    await runner.idle();
  });
});
