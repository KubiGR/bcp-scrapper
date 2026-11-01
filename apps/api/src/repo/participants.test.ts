import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { armyLists, games, players, teams, wh40kElo } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { sampleSource } from '../test/helpers';
import { gwList, storeList } from '../test/lists';
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
  it('rates each player’s opponents at this event: their records here and their wh40k-elo', async () => {
    await db.update(players).set({ wins: 2, losses: 0, draws: 0 }).where(eq(players.id, 'PL-BEN'));
    await db.update(players).set({ wins: 0, losses: 2, draws: 0 }).where(eq(players.id, 'PL-CARA'));
    await db.insert(games).values([
      { id: 'G1', eventId: EVENT, round: 1, playerAId: 'PL-ADA', playerBId: 'PL-BEN', raw: {} },
      { id: 'G2', eventId: EVENT, round: 2, playerAId: 'PL-CARA', playerBId: 'PL-ADA', raw: {} },
    ]);
    await db.insert(wh40kElo).values({
      userId: 'US-BEN',
      name: 'Ben',
      elo: 1801.4,
      games: 40,
      wins: 30,
      losses: 10,
      draws: 0,
      importedAt: new Date(),
    });
    const all = await listEventPlayers(db, EVENT);
    const ada = all.find((p) => p.bcpId === 'PL-ADA');
    expect(ada?.opponents).toEqual({ winRate: 0.5, elo: 1801, rated: 1, games: 2 });
    // Without games at this event, nothing to tell.
    expect(all.find((p) => p.bcpId === 'PL-HAL')?.opponents).toBeUndefined();
  });

  it('lists each player’s team id, placing and record', async () => {
    const all = await listEventPlayers(db, EVENT);
    const ada = all.find((p) => p.bcpId === 'PL-ADA');
    expect(ada).toMatchObject({
      teamId: 'TM-ALPHA',
      teamName: 'Alpha Squad',
      teamPlacing: 2,
      teamRecord: { wins: 1, losses: 1, draws: 0 },
    });
  });

  it('gives each player’s BCP account id', async () => {
    const ada = (await listEventPlayers(db, EVENT)).find((p) => p.bcpId === 'PL-ADA');
    expect(ada?.bcpUserId).toBe('US-ADA');
  });
});

describe('listEventPlayers with parsed lists', () => {
  const find = async (id: string) =>
    (await listEventPlayers(db, EVENT)).find((p) => p.bcpId === id);

  it('guesses the army from the list when BCP has no faction, or only an allegiance', async () => {
    await db.update(players).set({ faction: null }).where(eq(players.id, 'PL-ADA'));
    await db.update(players).set({ faction: 'Chaos' }).where(eq(players.id, 'PL-BEN'));
    await storeList(db, 'PL-ADA', gwList('Necrons', 'Awakened Dynasty', 'Disruption'));
    await storeList(db, 'PL-BEN', gwList('Chaos Space Marines', 'Renegade Raiders'));
    expect(await find('PL-ADA')).toMatchObject({
      faction: 'Necrons',
      factionGuessed: true,
      detachments: ['Awakened Dynasty'],
    });
    expect(await find('PL-BEN')).toMatchObject({
      faction: 'Chaos Space Marines',
      factionGuessed: true,
    });
  });

  it('shows no army for an allegiance like "Forces of the Hive Mind" without a list to read', async () => {
    await db
      .update(players)
      .set({ faction: 'Forces of the Hive Mind' })
      .where(eq(players.id, 'PL-ADA'));
    expect(await find('PL-ADA')).toMatchObject({ faction: null, factionGuessed: false });
  });

  it('takes the list’s army over a different one on BCP, and fills a missing disposition only with a known one', async () => {
    await db.update(players).set({ disposition: null }).where(eq(players.id, 'PL-ADA'));
    await storeList(db, 'PL-ADA', gwList('Necrons', 'Awakened Dynasty', 'Purge the Foe'));
    expect(await find('PL-ADA')).toMatchObject({
      faction: 'Necrons',
      factionGuessed: true,
      disposition: 'Purge the Foe',
    });
  });

  it('ignores a stored list the player has since replaced on BCP', async () => {
    await db.update(players).set({ faction: null }).where(eq(players.id, 'PL-ADA'));
    await storeList(db, 'PL-ADA', gwList('Necrons', 'Awakened Dynasty'));
    await db.update(players).set({ listId: 'LS-NEWER' }).where(eq(players.id, 'PL-ADA'));
    expect(await find('PL-ADA')).toMatchObject({
      faction: null,
      factionGuessed: false,
      detachments: [],
    });
  });

  it('has no detachments and no guess without a list', async () => {
    expect(await find('PL-ADA')).toMatchObject({ factionGuessed: false, detachments: [] });
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
