import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { armyLists, players, teams } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { sampleSource } from '../test/helpers';
import { upsertEventDetail, upsertEventSummaries } from './events';
import { findPlayersMissingLists, saveArmyList } from './lists';
import {
  countEventParticipants,
  listEventPlayers,
  replaceEventPlayers,
  replaceEventTeams,
} from './participants';

let db: Db;
let close: () => Promise<void>;
const source = sampleSource();
const EVENT = 'EVTTEAM0001';
const OTHER_EVENT = 'EVTSINGLE01';

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await upsertEventSummaries(
    db,
    (await source.listEvents({ from: '2026-01-01', to: '2026-12-31' }, null)).items,
  );
  await upsertEventDetail(db, await source.getEvent(EVENT));
  await replaceEventTeams(db, EVENT, await source.getTeams(EVENT));
  await replaceEventPlayers(db, EVENT, await source.getPlayers(EVENT));
});

const playerIds = async (eventId: string) =>
  (
    await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.eventId, eventId))
      .orderBy(asc(players.id))
  ).map(({ id }) => id);

const teamIds = async () =>
  (await db.select({ id: teams.id }).from(teams).orderBy(asc(teams.id))).map(({ id }) => id);

describe('replaceEventPlayers', () => {
  it('drops players BCP no longer lists (with their lists) and updates the rest', async () => {
    const all = await source.getPlayers(EVENT);
    const [first] = all;
    if (!first) throw new Error('fixture missing');
    await replaceEventPlayers(db, OTHER_EVENT, [
      { ...first, bcpId: 'PL-OTHER', eventBcpId: OTHER_EVENT },
    ]);
    const list = await source.getList('LS-ADA');
    if (!list) throw new Error('fixture missing');
    await saveArmyList(db, 'PL-ADA', list);

    const kept = all
      .filter((player) => player.bcpId !== 'PL-ADA')
      .map((player) => (player.bcpId === 'PL-BEN' ? { ...player, placing: 1 } : player));
    await replaceEventPlayers(db, EVENT, kept);

    expect(await playerIds(EVENT)).toEqual(kept.map((player) => player.bcpId).sort());
    const [updated] = await db.select().from(players).where(eq(players.id, 'PL-BEN'));
    expect(updated?.placing).toBe(1);
    expect(await db.select().from(armyLists).where(eq(armyLists.playerId, 'PL-ADA'))).toEqual([]);
    expect(await playerIds(OTHER_EVENT)).toEqual(['PL-OTHER']);
  });

  it('keeps the stored players when BCP returns none', async () => {
    await replaceEventPlayers(db, EVENT, []);
    expect(await playerIds(EVENT)).toHaveLength(8);
  });
});

describe('replaceEventTeams', () => {
  it('drops teams BCP no longer lists, but keeps them all when BCP returns none', async () => {
    const all = await source.getTeams(EVENT);
    await replaceEventTeams(db, EVENT, []);
    expect(await teamIds()).toHaveLength(all.length);

    const kept = all.slice(1);
    await replaceEventTeams(db, EVENT, kept);
    expect(await teamIds()).toEqual(kept.map((team) => team.bcpId).sort());
  });
});

describe('listEventPlayers', () => {
  it('lists each player’s team id and placing', async () => {
    const ada = (await listEventPlayers(db, EVENT)).find((p) => p.bcpId === 'PL-ADA');
    expect(ada).toMatchObject({ teamId: 'TM-ALPHA', teamName: 'Alpha Squad', teamPlacing: 2 });
  });
});

describe('countEventParticipants', () => {
  it("counts a stored list as fetched only while it is the player's current list", async () => {
    const list = await source.getList('LS-ADA');
    if (!list) throw new Error('fixture missing');
    await saveArmyList(db, 'PL-ADA', list);
    expect(await countEventParticipants(db, EVENT)).toMatchObject({
      listsAvailable: 7,
      listsFetched: 1,
      listsMissing: 6,
    });

    // PL-ADA submitted a new list on BCP: the stored one is out of date.
    const resynced = (await source.getPlayers(EVENT)).map((player) =>
      player.bcpId === 'PL-ADA' ? { ...player, listBcpId: 'LS-ADA-2' } : player,
    );
    await replaceEventPlayers(db, EVENT, resynced);

    expect(await countEventParticipants(db, EVENT)).toMatchObject({
      listsAvailable: 7,
      listsFetched: 0,
      listsMissing: 7,
    });
    expect(await findPlayersMissingLists(db, EVENT)).toContainEqual({
      playerId: 'PL-ADA',
      listId: 'LS-ADA-2',
    });
  });
});
