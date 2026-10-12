import type { GameView, PlayerRef, RoundView } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { playerGames } from './player-games';

const ref = (id: string, faction: string): PlayerRef => ({
  id,
  name: id.toUpperCase(),
  faction,
  factionGuessed: false,
  teamId: null,
  disposition: null,
  detachments: [],
});
const game = (a: PlayerRef, b: PlayerRef | null, more: Partial<GameView> = {}): GameView => ({
  id: `${a.id}-${b?.id ?? 'bye'}`,
  tableNo: 3,
  playerA: a,
  playerB: b,
  gamePointsA: 63,
  gamePointsB: 97,
  vpA: null,
  vpB: null,
  firstTurn: 'a',
  result: 'b_win',
  ...more,
});
const me = ref('me', 'Orks');
const them = ref('them', 'Necrons');
const other = ref('other', 'Tau');

describe('playerGames', () => {
  it('lists the player’s games by round, from their side, matchup games included', () => {
    const rounds: RoundView[] = [
      { round: 1, bracket: false, matchups: [], games: [game(me, them)] },
      {
        round: 2,
        bracket: false,
        matchups: [
          {
            id: 'm',
            tableNo: 1,
            teamA: { id: 't1', name: 'T1' },
            teamB: { id: 't2', name: 'T2' },
            pointsA: null,
            pointsB: null,
            outcomeA: null,
            // Here the player is side B, and won going second.
            games: [game(other, me, { gamePointsA: 40, gamePointsB: 100, result: 'b_win' })],
          },
        ],
        games: [],
      },
      { round: 3, bracket: false, matchups: [], games: [game(me, null, { result: 'a_win' })] },
      { round: 4, bracket: false, matchups: [], games: [game(other, them)] },
    ];
    expect(playerGames(rounds, 'me')).toEqual([
      {
        round: 1,
        tableNo: 3,
        opponent: them,
        outcome: 'loss',
        points: [63, 97],
        vp: [null, null],
        wentFirst: true,
      },
      {
        round: 2,
        tableNo: 3,
        opponent: other,
        outcome: 'win',
        points: [100, 40],
        vp: [null, null],
        wentFirst: false,
      },
      {
        round: 3,
        tableNo: 3,
        opponent: null,
        outcome: 'bye',
        points: [63, 97],
        vp: [null, null],
        wentFirst: true,
      },
    ]);
  });

  it('has no outcome yet for a game still being played', () => {
    const rounds: RoundView[] = [
      {
        round: 1,
        bracket: false,
        matchups: [],
        games: [game(me, them, { result: null, firstTurn: null })],
      },
    ];
    expect(playerGames(rounds, 'me')[0]).toMatchObject({ outcome: null, wentFirst: null });
  });
});
