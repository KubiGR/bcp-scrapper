import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { events, players } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { ALL_EVENTS, sampleSource } from '../test/helpers';
import { gwList, storeList } from '../test/lists';
import { searchTopLists } from './top-lists';

let db: Db;
let close: () => Promise<void>;
const TODAY = new Date('2026-09-27T12:00:00Z');
const RANGE = { from: '2026-01-01', to: '2026-12-31' };
const query = (overrides: object = {}) => ({
  factions: [],
  dispositions: [],
  detachments: [],
  maxLosses: 1,
  ...RANGE,
  ...overrides,
});

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const source = sampleSource();
  await syncEvent({ db, source }, 'EVTTEAM0001');
  await syncEvent({ db, source }, 'EVTBRACKET01');
});

const record = (id: string, wins: number, losses: number, draws: number) =>
  db.update(players).set({ wins, losses, draws }).where(eq(players.id, id));

describe('searchTopLists', () => {
  it('finds players with at most N losses who played, best first per event', async () => {
    const result = await searchTopLists(db, query({ maxLosses: 0 }), ALL_EVENTS, TODAY);
    expect(result.players.length).toBeGreaterThan(0);
    for (const player of result.players) {
      expect(player.losses).toBe(0);
      expect(player.wins + player.losses + player.draws).toBeGreaterThan(0);
    }
    expect(result.eventsInRange).toBe(result.eventsLoaded);
  });

  it('counts draws as not losses, and never includes a player with no games', async () => {
    await record('PL-ADA', 3, 1, 1);
    await record('PL-BEN', 0, 0, 0);
    const ids = (await searchTopLists(db, query(), ALL_EVENTS, TODAY)).players.map((p) => p.bcpId);
    expect(ids).toContain('PL-ADA');
    expect(ids).not.toContain('PL-BEN');
  });

  it('sorts by win/loss ratio (draws count half), then most wins, then newest event', async () => {
    await record('PL-ADA', 3, 1, 0); // 0.75
    await record('PL-BEN', 4, 1, 0); // 0.8
    await record('PL-CARA', 2, 0, 0); // 1.0
    await record('PL-DAN', 5, 0, 0); // 1.0, more wins than Cara
    await record('PL-EVE', 2, 1, 1); // 0.625
    const ids = (await searchTopLists(db, query({ maxLosses: 5 }), ALL_EVENTS, TODAY)).players
      .map((p) => p.bcpId)
      .filter((id) => ['PL-ADA', 'PL-BEN', 'PL-CARA', 'PL-DAN', 'PL-EVE'].includes(id));
    expect(ids).toEqual(['PL-DAN', 'PL-CARA', 'PL-BEN', 'PL-ADA', 'PL-EVE']);

    const ratios = (
      await searchTopLists(db, query({ maxLosses: 5 }), ALL_EVENTS, TODAY)
    ).players.map((p) => (p.wins + p.draws / 2) / (p.wins + p.losses + p.draws));
    expect(ratios).toEqual([...ratios].sort((x, y) => y - x));
  });

  it('filters by faction, including an army guessed from the list', async () => {
    await db.update(players).set({ faction: 'Chaos' }).where(eq(players.id, 'PL-ADA'));
    await record('PL-ADA', 3, 0, 0);
    await storeList(db, 'PL-ADA', gwList('World Eaters', 'Berzerker Warband'));
    const result = await searchTopLists(
      db,
      query({ factions: ['World Eaters'] }),
      ALL_EVENTS,
      TODAY,
    );
    expect(result.players.map((p) => p.bcpId)).toEqual(['PL-ADA']);
    expect(result.players[0]).toMatchObject({
      factionGuessed: true,
      detachments: ['Berzerker Warband'],
    });
  });

  it('offers faction and detachment choices from every qualifying player, not just the filtered ones', async () => {
    await record('PL-ADA', 3, 0, 0);
    await storeList(db, 'PL-ADA', gwList('Orks', 'War Horde'));
    const result = await searchTopLists(
      db,
      query({ factions: ['Necrons'], detachments: ['Hypercrypt Legion'] }),
      ALL_EVENTS,
      TODAY,
    );
    expect(result.players).toEqual([]);
    expect(result.factionOptions).toContain('Orks');
    expect(result.factionOptions.length).toBeGreaterThan(1);
    expect(result.detachmentOptions).toEqual(['War Horde']);
  });

  it('filters by detachment, matching only players whose list was read', async () => {
    await record('PL-ADA', 3, 0, 0);
    await record('PL-BEN', 3, 0, 0);
    await storeList(db, 'PL-ADA', gwList('Orks', 'War Horde'));
    const result = await searchTopLists(
      db,
      query({ detachments: ['War Horde'] }),
      ALL_EVENTS,
      TODAY,
    );
    expect(result.players.map((p) => p.bcpId)).toEqual(['PL-ADA']);
  });

  it('counts big events in range that aren’t loaded yet', async () => {
    await db.delete(players).where(eq(players.eventId, 'EVTBRACKET01'));
    const result = await searchTopLists(db, query(), ALL_EVENTS, TODAY);
    expect(result.eventsInRange).toBe(2);
    expect(result.eventsLoaded).toBe(1);
  });

  it('only searches big events starting in the range', async () => {
    const result = await searchTopLists(
      db,
      query({ from: '2020-01-01', to: '2020-12-31' }),
      ALL_EVENTS,
      TODAY,
    );
    expect(result).toEqual({
      players: [],
      truncated: false,
      factionOptions: [],
      detachmentOptions: [],
      eventsInRange: 0,
      eventsLoaded: 0,
    });
    const big = await searchTopLists(db, query(), { minRounds: 99, minPlayers: 0 }, TODAY);
    expect(big.eventsInRange).toBe(0);
  });

  it('defaults to the last 90 days', async () => {
    await db
      .update(events)
      .set({ startDate: new Date('2026-08-01T09:00:00Z') })
      .where(inArray(events.id, ['EVTTEAM0001']));
    const result = await searchTopLists(
      db,
      { ...query(), from: undefined, to: undefined },
      ALL_EVENTS,
      TODAY,
    );
    expect(result.eventsInRange).toBe(1);
  });

  it('returns at most 500 players and says there were more', async () => {
    const base = (await db.select().from(players).where(eq(players.id, 'PL-ADA')))[0];
    if (base === undefined) throw new Error('fixture');
    await db.insert(players).values(
      Array.from({ length: 501 }, (_, i) => ({
        ...base,
        id: `PL-MANY-${i}`,
        listId: null,
        wins: 3,
        losses: 0,
        draws: 0,
      })),
    );
    const result = await searchTopLists(db, query({ maxLosses: 0 }), ALL_EVENTS, TODAY);
    expect(result.players).toHaveLength(500);
    expect(result.truncated).toBe(true);
  });
});
