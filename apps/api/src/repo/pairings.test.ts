import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { games, teamMatchups } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { sampleSource } from '../test/helpers';
import { upsertEventDetail } from './events';
import { replaceRoundPairings, storedPairingsSummary } from './pairings';

let db: Db;
let close: () => Promise<void>;
const source = sampleSource();
const EVENT = 'EVTTEAM0001';

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await upsertEventDetail(db, await source.getEvent(EVENT));
  for (const round of [1, 2]) {
    await replaceRoundPairings(db, EVENT, round, {
      teamMatchups: await source.getTeamMatchups(EVENT, round),
      games: await source.getGames(EVENT, round),
    });
  }
});

const gameIds = async (round: number) =>
  (
    await db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.round, round))
      .orderBy(asc(games.id))
  ).map(({ id }) => id);

const matchupIds = async (round: number) =>
  (
    await db
      .select({ id: teamMatchups.id })
      .from(teamMatchups)
      .where(eq(teamMatchups.round, round))
      .orderBy(asc(teamMatchups.id))
  ).map(({ id }) => id);

describe('replaceRoundPairings', () => {
  it('drops the rows BCP no longer lists for that round and updates the rest', async () => {
    const round1Games = await source.getGames(EVENT, 1);
    expect(round1Games.map((game) => game.bcpId)).toEqual([
      'GM-R1-1',
      'GM-R1-2',
      'GM-R1-3',
      'GM-R1-4',
    ]);
    const keptGames = round1Games
      .filter((game) => game.bcpId !== 'GM-R1-4')
      .map((game) => (game.bcpId === 'GM-R1-1' ? { ...game, vpA: 99 } : game));
    const [keptMatchup] = await source.getTeamMatchups(EVENT, 1);
    if (!keptMatchup) throw new Error('fixture missing');

    await replaceRoundPairings(db, EVENT, 1, { teamMatchups: [keptMatchup], games: keptGames });

    expect(await gameIds(1)).toEqual(['GM-R1-1', 'GM-R1-2', 'GM-R1-3']);
    const [updated] = await db.select().from(games).where(eq(games.id, 'GM-R1-1'));
    expect(updated?.vpA).toBe(99);
    expect(await matchupIds(1)).toEqual([keptMatchup.bcpId]);
    // Other rounds are untouched.
    expect(await gameIds(2)).toHaveLength(4);
    expect(await matchupIds(2)).toHaveLength(2);
  });

  it('keeps a round as stored when BCP returns nothing for it', async () => {
    await replaceRoundPairings(db, EVENT, 1, { teamMatchups: [], games: [] });

    expect(await gameIds(1)).toHaveLength(4);
    expect(await matchupIds(1)).toHaveLength(2);
  });
});

describe('storedPairingsSummary', () => {
  it('counts distinct rounds, team matchups and games of one event', async () => {
    const matchups =
      (await source.getTeamMatchups(EVENT, 1)).length +
      (await source.getTeamMatchups(EVENT, 2)).length;
    const stored =
      (await source.getGames(EVENT, 1)).length + (await source.getGames(EVENT, 2)).length;
    expect(await storedPairingsSummary(db, EVENT)).toEqual({ rounds: 2, matchups, games: stored });
    expect(await storedPairingsSummary(db, 'EVTSINGLE01')).toEqual({
      rounds: 0,
      matchups: 0,
      games: 0,
    });
  });
});
