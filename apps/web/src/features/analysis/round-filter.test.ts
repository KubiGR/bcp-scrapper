import type { GameView, MatchupView, PlayerRef, RoundView } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { filterRound } from './round-filter';

const ref = (id: string, faction: string, detachments: string[] = []): PlayerRef => ({
  id,
  name: id,
  faction,
  factionGuessed: false,
  teamId: null,
  disposition: 'Take and Hold',
  detachments,
});
const game = (a: PlayerRef, b: PlayerRef): GameView => ({
  id: `${a.id}-${b.id}`,
  tableNo: 1,
  playerA: a,
  playerB: b,
  gamePointsA: null,
  gamePointsB: null,
  vpA: null,
  vpB: null,
  firstTurn: null,
  result: null,
});
const matchup = (id: string, teamA: string, teamB: string, games: GameView[]): MatchupView => ({
  id,
  tableNo: 1,
  teamA: { id: teamA, name: teamA },
  teamB: { id: teamB, name: teamB },
  pointsA: null,
  pointsB: null,
  outcomeA: null,
  games,
});
const round: RoundView = {
  round: 1,
  bracket: false,
  matchups: [
    matchup('m1', 'Golden Axe', 'Angry Kittens', [
      game(ref('Jakub Klinsky', 'Orks'), ref('Tadeas', 'Necrons', ['Awakened Dynasty'])),
      game(ref('Vrinki', 'Death Guard'), ref('Maxine', "T'au Empire")),
    ]),
    matchup('m2', 'Moravian Eagles', 'Grail Knights', [
      game(ref('Pavel', 'Blood Angels'), ref('Ondra', 'Orks')),
    ]),
  ],
  games: [game(ref('Solo', 'Aeldari'), ref('Duo', 'Drukhari'))],
};
const ids = (r: RoundView) => ({
  matchups: r.matchups.map((m) => [m.id, m.games.map((g) => g.id)]),
  games: r.games.map((g) => g.id),
});

describe('filterRound', () => {
  it('keeps everything for an empty filter', () => {
    expect(filterRound(round, '  ')).toBe(round);
  });

  it('keeps the games whose players, armies or detachments match, in every word', () => {
    expect(ids(filterRound(round, 'orks'))).toEqual({
      matchups: [
        ['m1', ['Jakub Klinsky-Tadeas']],
        ['m2', ['Pavel-Ondra']],
      ],
      games: [],
    });
    expect(ids(filterRound(round, 'awakened orks'))).toEqual({
      matchups: [['m1', ['Jakub Klinsky-Tadeas']]],
      games: [],
    });
    expect(ids(filterRound(round, 'drukhari'))).toEqual({ matchups: [], games: ['Solo-Duo'] });
  });

  it('keeps a whole matchup when a team name matches', () => {
    expect(ids(filterRound(round, 'golden'))).toEqual({
      matchups: [['m1', ['Jakub Klinsky-Tadeas', 'Vrinki-Maxine']]],
      games: [],
    });
  });
});
