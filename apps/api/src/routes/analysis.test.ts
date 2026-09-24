import type { RoundsResponse, StandingsResponse, TeamDetailResponse } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { syncRoundPairings } from '../sync/round-pairings';
import { SyncRunner } from '../sync/runner';
import { sampleSource, silentLogger, testFetchQueue } from '../test/helpers';

const EVENT = 'EVTBRACKET01';
let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof createApp>;

async function loadBracketEvent(source: TournamentSource = sampleSource()) {
  const event = await syncEvent({ db, source }, EVENT);
  for (let round = 1; round <= event.roundCount; round += 1) {
    await syncRoundPairings({ db, source, logger: silentLogger }, event, round);
  }
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const source = sampleSource();
  app = createApp({
    db,
    runner: new SyncRunner({ db, source, logger: silentLogger }),
    fetchQueue: testFetchQueue(db, source),
    bcpStatus: () =>
      Promise.resolve({
        source: 'fixtures',
        state: 'fixtures',
        accessTokenExpiresAt: null,
        lastRefreshAt: null,
      }),
    logger: silentLogger,
  });
});

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers pin T explicitly (e.g. get<RoundsResponse>) to type the JSON body.
const get = async <T>(path: string): Promise<{ status: number; body: T }> => {
  const response = await app.request(path);
  return { status: response.status, body: (await response.json()) as T };
};

describe('analysis routes', () => {
  it('standings: placing order, a bye as a win, a missing round empty, the final flagged as bracket', async () => {
    await loadBracketEvent();
    const { body } = await get<StandingsResponse>(`/api/events/${EVENT}/standings`);
    expect(body.rounds).toEqual([
      { round: 1, bracket: false },
      { round: 2, bracket: false },
      { round: 3, bracket: true },
    ]);
    expect(body.teams.map((row) => row.team.name)).toEqual([
      'Red Legion',
      'Blue Wardens',
      'Grey Watch',
      'Jade Court',
      'Gold Hosts',
    ]);
    const jade = body.teams.find((row) => row.team.id === 'TB-JADE');
    expect(jade?.perRound).toEqual([
      { round: 1, points: 40, outcome: 'bye', opponent: null },
      { round: 2, points: 15, outcome: 'loss', opponent: { id: 'TB-RED', name: 'Red Legion' } },
      null,
    ]);
    expect(jade?.totals).toEqual({ wins: 1, losses: 1, draws: 0, points: 55 });
  });

  it('rounds: matchups with their games; byes have no opponent and no VP', async () => {
    await loadBracketEvent();
    const { body } = await get<RoundsResponse>(`/api/events/${EVENT}/rounds`);
    expect(body.gamesAvailable).toBe(true);
    const bye = body.rounds[0]?.matchups.find((matchup) => matchup.id === 'TPB-R1-3');
    expect(bye).toMatchObject({ teamB: null, outcomeA: 'bye', pointsA: 40 });
    expect(bye?.games.map((game) => [game.playerA.name, game.playerB, game.vpA])).toEqual([
      ['Jon Reed', null, null],
      ['Juno Frey', null, null],
    ]);
  });

  it('team detail: players by game points with a line per round', async () => {
    await loadBracketEvent();
    const { body } = await get<TeamDetailResponse>(`/api/events/${EVENT}/teams/TB-RED`);
    expect(body.players.map((row) => [row.player.name, row.totals.points])).toEqual([
      ['Rhea Stone', 46],
      ['Rolf Hart', 30],
    ]);
    expect(body.totals).toEqual({ wins: 3, losses: 0, draws: 3, points: 76 });
    expect(body.players[0]?.perRound[0]).toMatchObject({
      opponent: { name: 'Bea Moss', faction: 'Necrons' },
      outcome: 'win',
      gamePoints: 20,
      vp: null,
    });
  });

  it('still shows rounds and standings when BCP served no individual games', async () => {
    const source = sampleSource();
    const noGames: TournamentSource = {
      listEvents: (range, cursor) => source.listEvents(range, cursor),
      getEvent: (id) => source.getEvent(id),
      getPlayers: (id) => source.getPlayers(id),
      getTeams: (id) => source.getTeams(id),
      getTeamMatchups: (id, round) => source.getTeamMatchups(id, round),
      getGames: () => Promise.resolve([]),
      getEventGames: () => Promise.resolve([]),
      getList: (listId) => source.getList(listId),
    };
    await loadBracketEvent(noGames);
    const rounds = await get<RoundsResponse>(`/api/events/${EVENT}/rounds`);
    expect(rounds.body.gamesAvailable).toBe(false);
    expect(rounds.body.rounds[0]?.matchups).toHaveLength(3);
    const standings = await get<StandingsResponse>(`/api/events/${EVENT}/standings`);
    expect(standings.body.teams).toHaveLength(5);
  });

  it('404s an unknown event and a team of another event', async () => {
    await loadBracketEvent();
    expect((await get(`/api/events/NOPE/rounds`)).status).toBe(404);
    expect((await get(`/api/events/${EVENT}/teams/TM-ALPHA`)).status).toBe(404);
  });

  it('gives empty rounds and standings before pairings are fetched', async () => {
    await syncEvent({ db, source: sampleSource() }, EVENT);
    expect((await get<RoundsResponse>(`/api/events/${EVENT}/rounds`)).body).toEqual({
      gamesAvailable: true,
      rounds: [],
    });
    expect((await get<StandingsResponse>(`/api/events/${EVENT}/standings`)).body.rounds).toEqual(
      [],
    );
  });
});
