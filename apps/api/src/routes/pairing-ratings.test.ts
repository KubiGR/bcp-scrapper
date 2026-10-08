import type { PairingResponse, PairingTeamsResponse } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { events, players, teams } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';

const EVENT = 'EVT-PAIR';
let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof createApp>;

async function seed(ourCount = 5, extra: Partial<typeof players.$inferInsert>[] = []) {
  await db.insert(events).values({
    id: EVENT,
    name: 'Balkan Team Championship',
    startDate: new Date('2026-10-10'),
    playerCount: 10,
    isTeamEvent: true,
    isOnline: false,
    roundCount: 5,
    ended: false,
    hideLists: false,
  });
  await db.insert(teams).values([
    { id: 'T-US', eventId: EVENT, name: 'Dice Bunker', roundPoints: [], raw: {} },
    { id: 'T-THEM', eventId: EVENT, name: 'Mighty Ducks', roundPoints: [], raw: {} },
  ]);
  const player = (id: string, teamId: string, faction: string) => ({
    id,
    eventId: EVENT,
    teamId,
    name: id,
    faction,
    wins: 0,
    losses: 0,
    draws: 0,
    dropped: false,
    raw: {},
  });
  await db
    .insert(players)
    .values([
      ...Array.from({ length: ourCount }, (_, i) => player(`US${i}`, 'T-US', 'Space Marines')),
      ...Array.from({ length: 5 }, (_, i) => player(`TH${i}`, 'T-THEM', 'Orks')),
      ...extra.map((x, i) => ({ ...player(`X${i}`, 'T-US', 'Necrons'), ...x })),
    ]);
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers pin T to type the JSON body.
const get = async <T>(path: string) => {
  const r = await app.request(path);
  return { status: r.status, body: (await r.json()) as T };
};
const put = (path: string, body: unknown) =>
  app.request(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const BASE = `/api/events/${EVENT}/teams/T-US/pairings`;

beforeAll(async () => ({ db, close } = await createTestDb()));
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
});

describe('pairing routes', () => {
  it('lists the teams to prepare against', async () => {
    await seed();
    const { body } = await get<PairingTeamsResponse>(BASE);
    expect(body).toEqual({
      team: { id: 'T-US', name: 'Dice Bunker' },
      opponents: [{ id: 'T-THEM', name: 'Mighty Ducks' }],
    });
  });

  it('serves both rosters, saves, reads and clears a rating', async () => {
    await seed();
    expect((await put(`${BASE}/T-THEM/US0/TH3`, { chip: 'RR' })).status).toBe(200);
    let { body } = await get<PairingResponse>(`${BASE}/T-THEM`);
    expect(body.ours).toHaveLength(5);
    expect(body.theirs[0]).toMatchObject({
      name: 'TH0',
      faction: 'Orks',
      detachments: [],
      list: null,
    });
    expect(body.ratings).toEqual([{ playerId: 'US0', opponentPlayerId: 'TH3', chip: 'RR' }]);
    expect(body.problem).toBeNull();
    await put(`${BASE}/T-THEM/US0/TH3`, { chip: 'G' });
    ({ body } = await get<PairingResponse>(`${BASE}/T-THEM`));
    expect(body.ratings[0]?.chip).toBe('G');
    await put(`${BASE}/T-THEM/US0/TH3`, { chip: null });
    ({ body } = await get<PairingResponse>(`${BASE}/T-THEM`));
    expect(body.ratings).toEqual([]);
  });

  it('says why when a team does not have 5 players', async () => {
    await seed(4);
    const { body } = await get<PairingResponse>(`${BASE}/T-THEM`);
    expect(body.problem).toBe('Dice Bunker has 4 players; pairings need 5 on each team.');
  });

  it('leaves out dropped players', async () => {
    await seed(5, [{ dropped: true }]);
    const { body } = await get<PairingResponse>(`${BASE}/T-THEM`);
    expect(body.ours.map((p) => p.id)).not.toContain('X0');
    expect(body.problem).toBeNull();
  });

  it('refuses a team against itself, a player from the wrong team, an unknown team and a bad chip', async () => {
    await seed();
    expect((await get(`${BASE}/T-US`)).status).toBe(400);
    expect((await put(`${BASE}/T-THEM/TH0/US0`, { chip: 'G' })).status).toBe(400);
    expect((await get(`${BASE}/T-NOPE`)).status).toBe(404);
    expect((await put(`${BASE}/T-THEM/US0/TH0`, { chip: 'XX' })).status).toBe(400);
  });

  it('saves many ratings at once (a pasted sheet), clearing the empty ones', async () => {
    await seed();
    await put(`${BASE}/T-THEM/US1/TH1`, { chip: 'RR' });
    const response = await put(`${BASE}/T-THEM`, {
      ratings: [
        { playerId: 'US0', opponentPlayerId: 'TH0', chip: 'GG' },
        { playerId: 'US1', opponentPlayerId: 'TH1', chip: null },
      ],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: 2 });
    const { body } = await get<PairingResponse>(`${BASE}/T-THEM`);
    expect(body.ratings).toEqual([{ playerId: 'US0', opponentPlayerId: 'TH0', chip: 'GG' }]);
  });

  it('saves nothing when one rating names a player from the wrong team', async () => {
    await seed();
    const response = await put(`${BASE}/T-THEM`, {
      ratings: [
        { playerId: 'US0', opponentPlayerId: 'TH0', chip: 'GG' },
        { playerId: 'TH0', opponentPlayerId: 'US0', chip: 'G' },
      ],
    });
    expect(response.status).toBe(400);
    const { body } = await get<PairingResponse>(`${BASE}/T-THEM`);
    expect(body.ratings).toEqual([]);
  });
});
