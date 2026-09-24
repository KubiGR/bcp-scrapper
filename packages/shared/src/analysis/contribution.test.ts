import { describe, expect, it } from 'vitest';
import { computeTeamContribution } from './contribution';
import type { EventAnalysisInput, GameRow } from './inputs';

const game = (
  id: string,
  round: number,
  a: string,
  b: string | null,
  pa: number,
  pb: number | null,
  result: GameRow['result'],
): GameRow => ({
  id,
  round,
  tableNo: 1,
  teamMatchupId: null,
  playerAId: a,
  playerBId: b,
  gamePointsA: pa,
  gamePointsB: pb,
  vpA: null,
  vpB: null,
  firstTurn: null,
  result,
});

const input: EventAnalysisInput = {
  teams: [{ id: 'RED', name: 'Red Legion', placing: 1 }],
  players: [
    { id: 'R1', name: 'Rhea Stone', faction: 'Adepta Sororitas', teamId: 'RED' },
    { id: 'R2', name: 'Rolf Hart', faction: 'Space Marines', teamId: 'RED' },
    { id: 'B1', name: 'Bea Moss', faction: 'Necrons', teamId: 'BLUE' },
    { id: 'B2', name: 'Bram Holt', faction: 'Aeldari', teamId: 'BLUE' },
    { id: 'J1', name: 'Jon Reed', faction: "T'au Empire", teamId: 'JADE' },
    { id: 'J2', name: 'Juno Frey', faction: 'Adepta Sororitas', teamId: 'JADE' },
  ],
  matchups: [],
  games: [
    game('g1', 1, 'R1', 'B1', 20, 0, 'a_win'),
    game('g2', 1, 'R2', 'B2', 10, 10, 'draw'),
    game('g3', 2, 'R1', 'J1', 15, 5, 'a_win'),
    game('g4', 2, 'J2', 'R2', 10, 10, 'draw'), // Rolf is side B
    game('g5', 3, 'R2', null, 20, null, 'a_win'), // a bye
  ],
};

describe('computeTeamContribution', () => {
  const detail = computeTeamContribution(input, 'RED');

  it("lists the team's players by game points, with a line per round", () => {
    expect(detail?.team).toEqual({ id: 'RED', name: 'Red Legion', placing: 1 });
    expect(detail?.players.map((row) => row.player.name)).toEqual(['Rolf Hart', 'Rhea Stone']);
    const rolf = detail?.players[0];
    expect(rolf?.perRound).toEqual([
      {
        round: 1,
        opponent: { id: 'B2', name: 'Bram Holt', faction: 'Aeldari', teamId: 'BLUE' },
        outcome: 'draw',
        gamePoints: 10,
        opponentGamePoints: 10,
        vp: null,
        opponentVp: null,
      },
      {
        round: 2,
        opponent: { id: 'J2', name: 'Juno Frey', faction: 'Adepta Sororitas', teamId: 'JADE' },
        outcome: 'draw',
        gamePoints: 10,
        opponentGamePoints: 10,
        vp: null,
        opponentVp: null,
      },
      {
        round: 3,
        opponent: null,
        outcome: 'bye',
        gamePoints: 20,
        opponentGamePoints: null,
        vp: null,
        opponentVp: null,
      },
    ]);
    expect(rolf?.totals).toEqual({ wins: 1, losses: 0, draws: 2, points: 40 });
    expect(detail?.players[1]?.perRound[2]).toBeNull(); // Rhea had no round-3 game
  });

  it("sums the team's totals", () => {
    expect(detail?.totals).toEqual({ wins: 3, losses: 0, draws: 2, points: 75 });
  });

  it("returns null for a team that isn't in the event", () => {
    expect(computeTeamContribution(input, 'NOPE')).toBeNull();
  });
});
