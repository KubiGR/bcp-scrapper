import type { BcpStatus, EventDetail, EventPlayersResponse } from '@bcp/shared';
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
const EVENT = 'EVTTEAM0001';

let db: Db;
let close: () => Promise<void>;
let runner: SyncRunner;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
  app = createApp({ db, runner, bcpStatus: () => Promise.resolve(status), logger: silentLogger });
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
const getJson = async <T>(path: string) => (await (await app.request(path)).json()) as T;

describe('event routes', () => {
  it('returns detail with counts, freshness and the latest run per kind', async () => {
    await sync({ kind: 'event', eventId: EVENT });
    await sync({ kind: 'lists', eventId: EVENT });
    expect(await getJson<EventDetail>(`/api/events/${EVENT}`)).toMatchObject({
      bcpId: EVENT,
      stale: false,
      counts: { players: 8, teams: 4, listsAvailable: 7, listsFetched: 7 },
      syncs: {
        event: { status: 'succeeded' },
        lists: { status: 'succeeded', done: 7 },
        pairings: null,
      },
    });
  });

  it('marks a catalogue-only event as stale with nothing loaded yet', async () => {
    await sync({ kind: 'catalog', from: '2026-01-01', to: '2026-12-31' });
    expect(await getJson<EventDetail>('/api/events/EVTSMALL001')).toMatchObject({
      lastSyncedAt: null,
      stale: true,
      counts: { players: 0, teams: 0, listsAvailable: 0, listsFetched: 0 },
      syncs: { event: null, pairings: null, lists: null },
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

    await sync({ kind: 'lists', eventId: EVENT });
    ({ items } = await getJson<EventPlayersResponse>(`/api/events/${EVENT}/players`));
    expect(items.find((p) => p.bcpId === 'PL-ADA')).toMatchObject({ listStatus: 'fetched' });
    expect((await app.request('/api/events/NOPE/players')).status).toBe(404);
  });

  it('serves one stored list, and 404 when none is stored', async () => {
    await sync({ kind: 'lists', eventId: EVENT });
    expect(await getJson(`/api/players/PL-ADA/list`)).toMatchObject({
      playerName: 'Ada Archer',
      teamName: 'Alpha Squad',
      listId: 'LS-ADA',
      text: expect.stringContaining('Gladius'),
    });
    expect((await app.request('/api/players/PL-HAL/list')).status).toBe(404);
  });

  it('exports all fetched lists as text and JSON downloads', async () => {
    await sync({ kind: 'lists', eventId: EVENT });

    const txt = await app.request(`/api/events/${EVENT}/lists/export`);
    expect(txt.headers.get('content-type')).toContain('text/plain');
    expect(txt.headers.get('content-disposition')).toBe(
      'attachment; filename="sample-team-open-lists.txt"',
    );
    const text = await txt.text();
    expect(text).toContain('#1 · Finn Ford · Charlie Wing · Orks');
    expect(text).toContain('Gladius Task Force');

    const json = await app.request(`/api/events/${EVENT}/lists/export?format=json`);
    expect(json.headers.get('content-disposition')).toContain('sample-team-open-lists.json');
    expect(((await json.json()) as { lists: unknown[] }).lists).toHaveLength(7);

    expect((await app.request(`/api/events/${EVENT}/lists/export?format=pdf`)).status).toBe(400);
    expect((await app.request('/api/events/NOPE/lists/export')).status).toBe(404);
  });
});
