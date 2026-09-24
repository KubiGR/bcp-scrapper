import type { MatchupView } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { matchupFor } from './team-matches';

const player = (id: string, name: string) => ({ id, name, faction: null, teamId: null });

const matchup: MatchupView = {
  id: 'M1',
  tableNo: 1,
  teamA: { id: 'RED', name: 'Red Legion' },
  teamB: { id: 'BLUE', name: 'Blue Wardens' },
  pointsA: 30,
  pointsB: 10,
  outcomeA: 'win',
  games: [
    {
      id: 'G1',
      tableNo: 1,
      playerA: player('R1', 'Rhea Stone'),
      playerB: player('B1', 'Bea Moss'),
      gamePointsA: 20,
      gamePointsB: 5,
      vpA: 80,
      vpB: 40,
      firstTurn: 'a',
      result: 'a_win',
    },
  ],
};

const byeMatchup: MatchupView = {
  id: 'M2',
  tableNo: 2,
  teamA: { id: 'JADE', name: 'Jade Court' },
  teamB: null,
  pointsA: 40,
  pointsB: null,
  outcomeA: 'bye',
  games: [],
};

describe('matchupFor', () => {
  it('returns the matchup as-is when the team is side A', () => {
    const view = matchupFor(matchup, 'RED');
    expect(view).toEqual({
      matchupId: 'M1',
      opponent: { id: 'BLUE', name: 'Blue Wardens' },
      points: 30,
      opponentPoints: 10,
      outcome: 'win',
      games: matchup.games,
    });
  });

  it('swaps sides, flips the outcome, and swaps games when the team is side B', () => {
    const view = matchupFor(matchup, 'BLUE');
    expect(view).toEqual({
      matchupId: 'M1',
      opponent: { id: 'RED', name: 'Red Legion' },
      points: 10,
      opponentPoints: 30,
      outcome: 'loss',
      games: [
        {
          id: 'G1',
          tableNo: 1,
          playerA: player('B1', 'Bea Moss'),
          playerB: player('R1', 'Rhea Stone'),
          gamePointsA: 5,
          gamePointsB: 20,
          vpA: 40,
          vpB: 80,
          firstTurn: 'b',
          result: 'a_win',
        },
      ],
    });
  });

  it('reports a bye with no opponent', () => {
    const view = matchupFor(byeMatchup, 'JADE');
    expect(view).toEqual({
      matchupId: 'M2',
      opponent: null,
      points: 40,
      opponentPoints: null,
      outcome: 'bye',
      games: [],
    });
  });

  it('returns null when the team is not in the matchup', () => {
    expect(matchupFor(matchup, 'JADE')).toBeNull();
  });
});
