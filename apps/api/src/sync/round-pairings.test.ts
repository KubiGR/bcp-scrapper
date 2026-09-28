import { eq } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { games, teamMatchups } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { upsertEventDetail } from '../repo/events';
import { sampleSource, silentLogger, sourceWith } from '../test/helpers';
import { syncRoundPairings } from './round-pairings';

let db: Db;
let close: () => Promise<void>;
const source = sampleSource();
const deps = () => ({ db, source, logger: silentLogger });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

describe('syncRoundPairings', () => {
  it('stores individual games from /v1/pairings when BCP has them', async () => {
    await upsertEventDetail(db, await source.getEvent('EVTTEAM0001'));
    const outcome = await syncRoundPairings(deps(), { id: 'EVTTEAM0001', isTeamEvent: true }, 1);
    expect(outcome).toEqual({ matchups: 2, games: 4, gamesFrom: 'pairings' });
  });

  it('links each stored game to its team matchup', async () => {
    await upsertEventDetail(db, await source.getEvent('EVTTEAM0001'));
    await syncRoundPairings(deps(), { id: 'EVTTEAM0001', isTeamEvent: true }, 1);
    const matchups = await db
      .select({ id: teamMatchups.id })
      .from(teamMatchups)
      .where(eq(teamMatchups.eventId, 'EVTTEAM0001'));
    const stored = await db
      .select({ id: games.id, matchup: games.teamMatchupId })
      .from(games)
      .where(eq(games.eventId, 'EVTTEAM0001'));
    const ids = new Set(matchups.map((m) => m.id));
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every((game) => game.matchup !== null && ids.has(game.matchup))).toBe(true);
    // Two games per matchup in the sample (2v2 teams).
    for (const id of ids) expect(stored.filter((game) => game.matchup === id)).toHaveLength(2);
  });

  it('falls back to the event-level endpoint for bracket events, with no VP', async () => {
    await upsertEventDetail(db, await source.getEvent('EVTBRACKET01'));
    const outcome = await syncRoundPairings(deps(), { id: 'EVTBRACKET01', isTeamEvent: true }, 1);
    expect(outcome).toEqual({ matchups: 3, games: 6, gamesFrom: 'event' });

    const stored = await db.select().from(games).where(eq(games.eventId, 'EVTBRACKET01'));
    expect(stored).toHaveLength(6);
    expect(stored.every((g) => g.vpA === null && g.vpB === null)).toBe(true);
    expect(stored.find((g) => g.id === 'GB-R1-5')).toMatchObject({
      playerBId: null,
      result: 'a_win',
      gamePointsA: 20,
    });
    const matchups = await db
      .select()
      .from(teamMatchups)
      .where(eq(teamMatchups.eventId, 'EVTBRACKET01'));
    expect(matchups.find((m) => m.id === 'TPB-R1-3')).toMatchObject({ teamBId: null, pointsA: 40 });
  });

  it('warns when a team round has matchups but neither endpoint has games', async () => {
    await upsertEventDetail(db, await source.getEvent('EVTTEAM0001'));
    const messages: string[] = [];
    const logger = pino(
      { level: 'warn' },
      { write: (line: string) => messages.push((JSON.parse(line) as { msg: string }).msg) },
    );
    const noGames = sourceWith(source, {
      getGames: () => Promise.resolve([]),
      getEventGames: () => Promise.resolve([]),
    });
    const outcome = await syncRoundPairings(
      { db, source: noGames, logger },
      { id: 'EVTTEAM0001', isTeamEvent: true },
      2,
    );
    expect(outcome).toEqual({ matchups: 2, games: 0, gamesFrom: 'none' });
    expect(messages).toEqual([
      'BCP returned no individual games for round 2; team matchups stored only',
    ]);
  });
});
