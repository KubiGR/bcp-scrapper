import { describe, expect, it } from 'vitest';
import type { EventAnalysisInput, GameRow } from './inputs';
import { buildRounds, computeBracketRounds } from './rounds';

const g = (
  id: string,
  round: number,
  matchup: string | null,
  a: string,
  b: string | null,
  pa: number,
  pb: number | null,
): GameRow => ({
  id,
  round,
  tableNo: Number(id.slice(-1)),
  teamMatchupId: matchup,
  playerAId: a,
  playerBId: b,
  gamePointsA: pa,
  gamePointsB: pb,
  vpA: null,
  vpB: null,
  firstTurn: null,
  result: b === null ? 'a_win' : pa > (pb ?? 0) ? 'a_win' : pa === pb ? 'draw' : 'b_win',
});

const input: EventAnalysisInput = {
  teams: [
    { id: 'RED', name: 'Red Legion', placing: 1 },
    { id: 'BLUE', name: 'Blue Wardens', placing: 2 },
    { id: 'JADE', name: 'Jade Court', placing: 3 },
  ],
  players: [
    {
      id: 'R1',
      name: 'Rhea Stone',
      faction: 'Adepta Sororitas',
      teamId: 'RED',
      disposition: 'Take and Hold',
      userId: 'US-RHEA',
    },
    { id: 'B1', name: 'Bea Moss', faction: 'Necrons', teamId: 'BLUE', disposition: null },
    { id: 'J1', name: 'Jon Reed', faction: "T'au Empire", teamId: 'JADE', disposition: null },
  ].map((player) => ({ ...player, factionGuessed: false, detachments: [] })),
  matchups: [
    { id: 'M2', round: 1, tableNo: 2, teamAId: 'JADE', teamBId: null, pointsA: 20, pointsB: null },
    { id: 'M1', round: 1, tableNo: 1, teamAId: 'RED', teamBId: 'BLUE', pointsA: 20, pointsB: 0 },
  ],
  games: [g('G2', 1, 'M2', 'J1', null, 20, null), g('G1', 1, 'M1', 'R1', 'B1', 20, 0)],
};

describe('buildRounds', () => {
  it('lists team matchups by table with their games; a bye has no opponent', () => {
    const { rounds, gamesAvailable } = buildRounds(input);
    expect(gamesAvailable).toBe(true);
    expect(rounds).toHaveLength(1);
    const [first, second] = rounds[0]?.matchups ?? [];
    expect(first).toMatchObject({
      id: 'M1',
      teamA: { id: 'RED', name: 'Red Legion' },
      teamB: { id: 'BLUE', name: 'Blue Wardens' },
      outcomeA: 'win',
    });
    expect(first?.games[0]).toMatchObject({
      playerA: { name: 'Rhea Stone', faction: 'Adepta Sororitas', disposition: 'Take and Hold' },
      playerB: { name: 'Bea Moss' },
      vpA: null,
    });
    expect(second).toMatchObject({ id: 'M2', teamB: null, outcomeA: 'bye' });
    expect(second?.games[0]?.playerB).toBeNull();
    expect(rounds[0]?.games).toEqual([]);
  });

  it('keeps games without a stored matchup (singles), and names unknown players', () => {
    const singles = buildRounds({
      ...input,
      matchups: [],
      games: [g('G9', 2, null, 'R1', 'X9', 5, 15)],
    });
    expect(singles.rounds[0]?.games[0]?.playerB).toEqual({
      id: 'X9',
      name: 'Unknown player',
      faction: null,
      factionGuessed: false,
      teamId: null,
      disposition: null,
      detachments: [],
      userId: null,
    });
    // Each player carries their BCP account, for their badges.
    expect(singles.rounds[0]?.games[0]?.playerA.userId).toBe('US-RHEA');
  });

  it('says when BCP served matchups but no games', () => {
    expect(buildRounds({ ...input, games: [] }).gamesAvailable).toBe(false);
  });
});

describe('computeBracketRounds', () => {
  it("flags later rounds with at most half of round 1's teams, never round 1", () => {
    const matchups = [
      { id: 'a', round: 1, tableNo: 1, teamAId: 'A', teamBId: 'B', pointsA: 1, pointsB: 0 },
      { id: 'b', round: 1, tableNo: 2, teamAId: 'C', teamBId: 'D', pointsA: 1, pointsB: 0 },
      { id: 'c', round: 2, tableNo: 1, teamAId: 'A', teamBId: 'C', pointsA: 1, pointsB: 0 },
      { id: 'd', round: 2, tableNo: 2, teamAId: 'B', teamBId: 'D', pointsA: 1, pointsB: 0 },
      { id: 'e', round: 3, tableNo: 1, teamAId: 'A', teamBId: 'B', pointsA: 1, pointsB: 0 },
    ];
    expect([...computeBracketRounds(matchups)]).toEqual([3]);
  });
});
