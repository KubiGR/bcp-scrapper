import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { players } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { ALL_EVENTS, sampleSource } from '../test/helpers';
import { gwList, storeList } from '../test/lists';
import { loadMetaRows } from './meta';

let db: Db;
let close: () => Promise<void>;
const TODAY = new Date('2026-09-28T12:00:00Z');
const RANGE = { from: '2026-01-01', to: '2026-12-31' };

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

const record = (id: string, wins: number, losses: number) =>
  db.update(players).set({ wins, losses, draws: 0 }).where(eq(players.id, id));

describe('loadMetaRows', () => {
  it('loads counted players with resolved factions and their current list’s detachments', async () => {
    await record('PL-ADA', 3, 1);
    await db.update(players).set({ faction: 'Chaos' }).where(eq(players.id, 'PL-BEN'));
    await record('PL-BEN', 2, 2);
    await storeList(db, 'PL-ADA', gwList('Space Marines', 'Gladius Task Force'));
    await storeList(db, 'PL-BEN', gwList('World Eaters', 'Berzerker Warband'));
    const { rows, eventsInRange, eventsLoaded } = await loadMetaRows(
      db,
      { ...RANGE, type: 'all' },
      ALL_EVENTS,
      TODAY,
    );
    expect(eventsInRange).toBe(2);
    expect(eventsLoaded).toBe(2);
    expect(rows.find((r) => r.detachments.includes('Gladius Task Force'))).toMatchObject({
      eventId: 'EVTTEAM0001',
      isTeamEvent: true,
      wins: 3,
      losses: 1,
    });
    expect(rows.find((r) => r.detachments.includes('Berzerker Warband'))?.faction).toBe(
      'World Eaters',
    );
    expect(rows.every((r) => r.wins + r.losses + r.draws > 0)).toBe(true);
  });

  it('counts a player whose list names a detachment that isn’t English as detachment unknown', async () => {
    await record('PL-ADA', 3, 1);
    await db.update(players).set({ faction: 'Orks' }).where(eq(players.id, 'PL-ADA'));
    await storeList(db, 'PL-ADA', gwList('Orks', 'Horda de Guerra'));
    const { rows } = await loadMetaRows(db, { ...RANGE, type: 'all' }, ALL_EVENTS, TODAY);
    const ada = rows.find((r) => r.wins === 3 && r.losses === 1);
    expect(ada).toMatchObject({ faction: 'Orks', detachments: [] });
  });

  it('gives each player’s disposition: BCP’s, else the one read from their list', async () => {
    await record('PL-ADA', 3, 1);
    await record('PL-BEN', 2, 2);
    await db.update(players).set({ disposition: 'Purge the Foe' }).where(eq(players.id, 'PL-ADA'));
    await db.update(players).set({ disposition: null }).where(eq(players.id, 'PL-BEN'));
    await storeList(db, 'PL-BEN', gwList('Orks', 'War Horde', 'Take and Hold'));
    const { rows } = await loadMetaRows(db, { ...RANGE, type: 'all' }, ALL_EVENTS, TODAY);
    expect(rows.find((r) => r.wins === 3 && r.losses === 1)?.disposition).toBe('Purge the Foe');
    expect(rows.find((r) => r.wins === 2 && r.losses === 2)?.disposition).toBe('Take and Hold');
  });

  it('ignores a list the player has since replaced, and counts an allegiance without a list as unknown', async () => {
    await record('PL-ADA', 3, 1);
    await storeList(db, 'PL-ADA', gwList('Orks', 'War Horde'));
    await db
      .update(players)
      .set({ listId: 'LS-NEWER', faction: 'Xenos' })
      .where(eq(players.id, 'PL-ADA'));
    const { rows } = await loadMetaRows(db, { ...RANGE, type: 'all' }, ALL_EVENTS, TODAY);
    const ada = rows.find(
      (r) => r.teamId !== null && r.wins === 3 && r.losses === 1 && r.faction === null,
    );
    expect(ada).toMatchObject({ detachments: [] });
  });

  it('filters singles or teams, and counts events not loaded yet', async () => {
    const teams = await loadMetaRows(db, { ...RANGE, type: 'teams' }, ALL_EVENTS, TODAY);
    expect(teams.rows.every((r) => r.isTeamEvent)).toBe(true);
    const singles = await loadMetaRows(db, { ...RANGE, type: 'singles' }, ALL_EVENTS, TODAY);
    expect(singles.rows).toEqual([]);
    await db.delete(players).where(eq(players.eventId, 'EVTBRACKET01'));
    const partial = await loadMetaRows(db, { ...RANGE, type: 'all' }, ALL_EVENTS, TODAY);
    expect([partial.eventsInRange, partial.eventsLoaded]).toEqual([2, 1]);
  });
});
