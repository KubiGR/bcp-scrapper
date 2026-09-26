import type {
  BulkPairingsResult,
  CellGamesResponse,
  CrossEventMatchupsResponse,
  MatchupsResponse,
} from '@bcp/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { events, players } from '../db/schema';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { enqueueEventPairings } from '../repo/fetch-queue';
import { syncEvent } from '../sync/jobs';
import { syncRoundPairings } from '../sync/round-pairings';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';
import { gwList, storeList } from '../test/lists';

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
  });

  // Both fixture events in the catalogue with lastSyncedAt.
  const bracket = await syncEvent({ db, source }, 'EVTBRACKET01');
  await syncEvent({ db, source }, 'EVTTEAM0001');
  for (let round = 1; round <= bracket.roundCount; round += 1) {
    await syncRoundPairings({ db, source, logger: silentLogger }, bracket, round);
  }
});

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers pin T explicitly (e.g. get<MatchupsResponse>) to type the JSON body.
const get = async <T>(path: string): Promise<{ status: number; body: T }> => {
  const response = await app.request(path);
  return { status: response.status, body: (await response.json()) as T };
};

function post(path: string, body: unknown, raw: true): Promise<Response>;
function post<T>(path: string, body: unknown, raw?: false): Promise<T>;
async function post<T>(path: string, body: unknown, raw?: boolean): Promise<T | Response> {
  const response = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (raw) return response;
  return (await response.json()) as T;
}

describe('matchups routes', () => {
  it('returns an event’s matrix and one cell’s games', async () => {
    const { body } = await get<MatchupsResponse>('/api/events/EVTBRACKET01/matchups');
    expect(body.scoring).toEqual({ consistent: true, scale: 20 });
    expect(body.matrix.games).toBe(10); // 14 games minus 4 byes
    expect(body.matrix.factions).toContain('Adepta Sororitas');
    const games = await get<CellGamesResponse>(
      '/api/events/EVTBRACKET01/matchups/games?row=Adepta%20Sororitas&col=Necrons',
    );
    expect(games.body.games[0]).toMatchObject({
      row: { faction: 'Adepta Sororitas' },
      col: { faction: 'Necrons' },
    });
  });

  it('filters by several dispositions, and still accepts the old single `disposition`', async () => {
    const all = await get<MatchupsResponse>('/api/events/EVTBRACKET01/matchups');
    const one = await get<MatchupsResponse>(
      '/api/events/EVTBRACKET01/matchups?dispositions=Take%20and%20Hold&side=row',
    );
    const old = await get<MatchupsResponse>(
      '/api/events/EVTBRACKET01/matchups?disposition=Take%20and%20Hold&side=row',
    );
    const every = await get<MatchupsResponse>(
      `/api/events/EVTBRACKET01/matchups?dispositions=${encodeURIComponent(
        'Take and Hold,Priority Assets,Purge the Foe,Reconnaissance,Disruption',
      )}&side=row`,
    );
    expect(one.body.matrix.games).toBeGreaterThan(0);
    expect(one.body.matrix.games).toBeLessThan(all.body.matrix.games);
    expect(old.body).toEqual(one.body);
    // All five: every counted game has a side with a disposition, so nothing is lost.
    expect(every.body.matrix.games).toBe(all.body.matrix.games);
  });

  it('filters by detachment, lists the event’s detachments, and shows guessed armies', async () => {
    await db.update(players).set({ faction: null }).where(eq(players.id, 'PB-B1'));
    await storeList(db, 'PB-B1', gwList('Necrons', 'Hypercrypt Legion'));
    await storeList(db, 'PB-R1', gwList('Adepta Sororitas', 'Hallowed Martyrs'));
    const all = await get<MatchupsResponse>('/api/events/EVTBRACKET01/matchups');
    expect(all.body.detachments).toEqual(['Hallowed Martyrs', 'Hypercrypt Legion']);

    const row = await get<MatchupsResponse>(
      '/api/events/EVTBRACKET01/matchups?detachments=Hallowed%20Martyrs&side=row',
    );
    expect(row.body.matrix.factions).toEqual(['Adepta Sororitas']); // rows: only the filtered side
    expect(row.body.matrix.games).toBeGreaterThan(0);
    expect(row.body.matrix.games).toBeLessThan(all.body.matrix.games);

    const both = await get<MatchupsResponse>(
      `/api/events/EVTBRACKET01/matchups?detachments=${encodeURIComponent('Hallowed Martyrs,Hypercrypt Legion')}&side=both`,
    );
    expect(both.body.matrix.games).toBe(1);

    const games = await get<CellGamesResponse>(
      '/api/events/EVTBRACKET01/matchups/games?row=Adepta%20Sororitas&col=Necrons&detachments=Hallowed%20Martyrs',
    );
    expect(games.body.games[0]?.col).toMatchObject({
      faction: 'Necrons',
      factionGuessed: true,
      detachments: ['Hypercrypt Legion'],
    });
  });

  it('filters by disposition', async () => {
    const { body } = await get<MatchupsResponse>(
      '/api/events/EVTBRACKET01/matchups?disposition=Take%20and%20Hold&side=row',
    );
    // every counted row side played Take and Hold: Rolf Hart (Space Marines) and Yara Pike (Death Guard).
    expect(body.matrix.games).toBeGreaterThan(0);
  });

  it('combines events in a range: synced included, partial excluded unless included', async () => {
    // EVTBRACKET01 is partial (no pairings_synced_at) -> excluded by default, included via ?include=
    const range = 'from=2026-01-01&to=2026-12-31';
    const byDefault = await get<CrossEventMatchupsResponse>(`/api/matchups?${range}`);
    expect(byDefault.body.events.find((e) => e.id === 'EVTBRACKET01')).toMatchObject({
      pairings: 'partial',
      included: false,
    });
    expect(byDefault.body.matrix.games).toBe(0);
    const included = await get<CrossEventMatchupsResponse>(
      `/api/matchups?${range}&include=EVTBRACKET01`,
    );
    expect(included.body.matrix.games).toBe(10);
  });

  it('keeps a synced event included while its refresh is fetching', async () => {
    // EVTBRACKET01 marked synced, then a refresh queues a round job -> displayed state flips to
    // 'fetching' but it must stay included (not require ?include= again).
    await db
      .update(events)
      .set({ pairingsSyncedAt: new Date() })
      .where(eq(events.id, 'EVTBRACKET01'));
    await enqueueEventPairings(db, 'EVTBRACKET01', { rounds: [1], priority: 0 });

    const range = 'from=2026-01-01&to=2026-12-31';
    const { body } = await get<CrossEventMatchupsResponse>(`/api/matchups?${range}`);
    expect(body.events.find((e) => e.id === 'EVTBRACKET01')).toMatchObject({
      pairings: 'fetching',
      included: true,
    });
  });

  it('queues missing pairings for many events once, never re-queueing synced ones', async () => {
    // EVTBRACKET01 marked synced -> skipped; EVTTEAM0001 synced (event row) but no pairings -> queues its 2 rounds.
    await db
      .update(events)
      .set({ pairingsSyncedAt: new Date() })
      .where(eq(events.id, 'EVTBRACKET01'));
    const first = await post<BulkPairingsResult>('/api/pairings-queue', {
      eventIds: ['EVTTEAM0001', 'EVTBRACKET01'],
    });
    expect(first).toMatchObject({ events: 1, queuedRounds: 2 });
    const again = await post<BulkPairingsResult>('/api/pairings-queue', {
      eventIds: ['EVTTEAM0001', 'EVTBRACKET01'],
    });
    expect(again).toMatchObject({ events: 0, queuedRounds: 0 });
  });

  it('validates input', async () => {
    expect((await get('/api/events/NOPE/matchups')).status).toBe(404);
    expect((await get('/api/matchups?from=2026-12-31&to=2026-01-01')).status).toBe(400);
    expect((await post('/api/pairings-queue', { eventIds: [] }, true)).status).toBe(400);
  });
});
