import type { BcpStatus, EventDetail, EventPlayersResponse } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import type { ListQueueWorker } from '../list-queue/worker';
import { SyncRunner } from '../sync/runner';
import { drainQueue, sampleSource, silentLogger, testListQueue } from '../test/helpers';

const status: BcpStatus = {
  source: 'fixtures',
  state: 'fixtures',
  accessTokenExpiresAt: null,
  lastRefreshAt: null,
};
const EVENT = 'EVTTEAM0001';

let db: Db;
let close: () => Promise<void>;
let runner: SyncRunner;
let listQueue: ListQueueWorker;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
  listQueue = testListQueue(db);
  app = createApp({
    db,
    runner,
    listQueue,
    bcpStatus: () => Promise.resolve(status),
    logger: silentLogger,
  });
});
afterAll(() => close());
beforeEach(() => resetDb(db));

async function sync(body: object) {
  await app.request('/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  await runner.idle();
}
async function fetchAllLists() {
  await app.request(`/api/events/${EVENT}/lists/queue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  await drainQueue(listQueue);
}
const getJson = async <T>(path: string) => (await (await app.request(path)).json()) as T;

describe('event routes', () => {
  it('returns detail with counts, freshness and the latest run per kind', async () => {
    await sync({ kind: 'event', eventId: EVENT });
    await fetchAllLists();
    expect(await getJson<EventDetail>(`/api/events/${EVENT}`)).toMatchObject({
      bcpId: EVENT,
      stale: false,
      counts: {
        players: 8,
        teams: 4,
        listsAvailable: 7,
        listsFetched: 7,
        listsMissing: 0,
        listsQueued: 0,
        listsFailed: 0,
      },
      syncs: {
        event: { status: 'succeeded' },
        pairings: null,
      },
    });
  });

  it('marks a catalogue-only event as stale with nothing loaded yet', async () => {
    await sync({ kind: 'catalog', from: '2026-01-01', to: '2026-12-31' });
    expect(await getJson<EventDetail>('/api/events/EVTSMALL001')).toMatchObject({
      lastSyncedAt: null,
      stale: true,
      counts: {
        players: 0,
        teams: 0,
        listsAvailable: 0,
        listsFetched: 0,
        listsMissing: 0,
        listsQueued: 0,
        listsFailed: 0,
      },
      syncs: { event: null, pairings: null },
    });
    expect((await app.request('/api/events/NOPE')).status).toBe(404);
  });

  it('lists players by placing with team names and list status', async () => {
    await sync({ kind: 'event', eventId: EVENT });
    let { items } = await getJson<EventPlayersResponse>(`/api/events/${EVENT}/players`);
    expect(items).toHaveLength(8);
    expect(items[0]).toMatchObject({
      bcpId: 'PL-FINN',
      placing: 1,
      teamName: 'Charlie Wing',
      faction: 'Orks',
      wins: 2,
      listStatus: 'available',
    });
    expect(items.find((p) => p.bcpId === 'PL-HAL')).toMatchObject({ listStatus: 'none' });

    await fetchAllLists();
    ({ items } = await getJson<EventPlayersResponse>(`/api/events/${EVENT}/players`));
    expect(items.find((p) => p.bcpId === 'PL-ADA')).toMatchObject({ listStatus: 'fetched' });
    expect((await app.request('/api/events/NOPE/players')).status).toBe(404);
  });

  it('serves one stored list, and 404 when none is stored', async () => {
    await fetchAllLists();
    expect(await getJson(`/api/players/PL-ADA/list`)).toMatchObject({
      playerName: 'Ada Archer',
      teamName: 'Alpha Squad',
      listId: 'LS-ADA',
      text: expect.stringContaining('Gladius'),
    });
    expect((await app.request('/api/players/PL-HAL/list')).status).toBe(404);
  });

  it('exports all fetched lists as text and JSON downloads', async () => {
    await sync({ kind: 'event', eventId: EVENT });
    const before = (await (
      await app.request(`/api/events/${EVENT}/lists/export?format=json`)
    ).json()) as { missing: { player: string; reason: string }[] };
    expect(before.missing).toHaveLength(8);
    expect(before.missing.filter((entry) => entry.reason === 'not fetched')).toHaveLength(7);

    await fetchAllLists();

    const txt = await app.request(`/api/events/${EVENT}/lists/export`);
    expect(txt.headers.get('content-type')).toContain('text/plain');
    expect(txt.headers.get('content-disposition')).toBe(
      'attachment; filename="sample-team-open-lists.txt"',
    );
    const text = await txt.text();
    expect(text).toContain('#1 · Finn Ford · Charlie Wing · Orks');
    expect(text).toContain('Gladius Task Force');
    expect(
      text.startsWith("Sample Team Open\n7 of 8 players' army lists\nMissing: Hal Hayes\n"),
    ).toBe(true);

    const json = await app.request(`/api/events/${EVENT}/lists/export?format=json`);
    expect(json.headers.get('content-disposition')).toContain('sample-team-open-lists.json');
    const body = (await json.json()) as { lists: unknown[]; missing: unknown[] };
    expect(body.lists).toHaveLength(7);
    expect(body.missing).toEqual([
      { player: 'Hal Hayes', team: expect.any(String), reason: 'no list on BCP' },
    ]);

    expect((await app.request(`/api/events/${EVENT}/lists/export?format=pdf`)).status).toBe(400);
    expect((await app.request('/api/events/NOPE/lists/export')).status).toBe(404);
  });
});
