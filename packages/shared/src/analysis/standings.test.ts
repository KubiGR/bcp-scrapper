import { describe, expect, it } from 'vitest';
import type { MatchupRow, TeamRow } from './inputs';
import { computeStandings } from './standings';

const teams: TeamRow[] = [
  { id: 'GREY', name: 'Grey Watch', placing: null },
  { id: 'JADE', name: 'Jade Court', placing: null },
  { id: 'BLUE', name: 'Blue Wardens', placing: 2 },
  { id: 'RED', name: 'Red Legion', placing: 1 },
];
const m = (
  id: string,
  round: number,
  a: string,
  b: string | null,
  pa: number | null,
  pb: number | null,
): MatchupRow => ({
  id,
  round,
  tableNo: 1,
  teamAId: a,
  teamBId: b,
  pointsA: pa,
  pointsB: pb,
});
const matchups = [
  m('r1a', 1, 'RED', 'BLUE', 30, 10),
  m('r1b', 1, 'JADE', 'GREY', 20, 20),
  m('r2a', 2, 'RED', 'JADE', 25, 15),
  m('r2b', 2, 'BLUE', null, 40, null), // bye; Grey Watch missing from round 2
  m('r3a', 3, 'RED', 'BLUE', 21, 19), // the final: 2 of round 1's 4 teams → bracket
];

describe('computeStandings', () => {
  const standings = computeStandings({ teams, players: [], matchups, games: [] });

  it('orders by placing, then total points, then name, and flags the bracket round', () => {
    expect(standings.teams.map((row) => row.team.name)).toEqual([
      'Red Legion',
      'Blue Wardens',
      'Jade Court',
      'Grey Watch',
    ]);
    expect(standings.rounds).toEqual([
      { round: 1, bracket: false },
      { round: 2, bracket: false },
      { round: 3, bracket: true },
    ]);
  });

  it("shows each round's points, outcome and opponent; a bye counts as a win", () => {
    const blue = standings.teams.find((row) => row.team.id === 'BLUE');
    expect(blue?.perRound).toEqual([
      { round: 1, points: 10, outcome: 'loss', opponent: { id: 'RED', name: 'Red Legion' } },
      { round: 2, points: 40, outcome: 'bye', opponent: null },
      { round: 3, points: 19, outcome: 'loss', opponent: { id: 'RED', name: 'Red Legion' } },
    ]);
    expect(blue?.totals).toEqual({ wins: 1, losses: 2, draws: 0, points: 69 });
  });

  it('leaves a round empty when the team had no matchup, and counts draws', () => {
    const grey = standings.teams.find((row) => row.team.id === 'GREY');
    expect(grey?.perRound).toEqual([
      { round: 1, points: 20, outcome: 'draw', opponent: { id: 'JADE', name: 'Jade Court' } },
      null,
      null,
    ]);
    expect(grey?.totals).toEqual({ wins: 0, losses: 0, draws: 1, points: 20 });
  });

  it('has no outcome until both scores are in', () => {
    const pending = computeStandings({
      teams,
      players: [],
      matchups: [m('x', 1, 'RED', 'BLUE', null, null)],
      games: [],
    });
    expect(pending.teams[0]?.perRound[0]).toMatchObject({ points: null, outcome: null });
    expect(pending.teams[0]?.totals).toEqual({ wins: 0, losses: 0, draws: 0, points: 0 });
  });
});
