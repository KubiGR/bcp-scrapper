import type { Outcome, PlayerRef, RoundView } from '@bcp/shared';

/** One of a player's games, from their side: [theirs, the opponent's] for points and VP. */
export interface PlayerGame {
  round: number;
  tableNo: number | null;
  /** Null for a bye. */
  opponent: PlayerRef | null;
  /** Null while the game is still being played. */
  outcome: Outcome | null;
  points: [number | null, number | null];
  vp: [number | null, number | null];
  /** Null when BCP doesn't say who went first. */
  wentFirst: boolean | null;
}

/** A player's games through the event, round by round (team matchups' games included). */
export function playerGames(rounds: RoundView[], playerId: string): PlayerGame[] {
  return rounds.flatMap((round) =>
    [...round.matchups.flatMap((m) => m.games), ...round.games].flatMap((game): PlayerGame[] => {
      const side = game.playerA.id === playerId ? 'a' : game.playerB?.id === playerId ? 'b' : null;
      if (side === null) return [];
      const mine = side === 'a';
      const outcome: Outcome | null =
        game.playerB === null
          ? 'bye'
          : game.result === null
            ? null
            : game.result === 'draw'
              ? 'draw'
              : (game.result === 'a_win') === mine
                ? 'win'
                : 'loss';
      return [
        {
          round: round.round,
          tableNo: game.tableNo,
          opponent: mine ? game.playerB : game.playerA,
          outcome,
          points: mine
            ? [game.gamePointsA, game.gamePointsB]
            : [game.gamePointsB, game.gamePointsA],
          vp: mine ? [game.vpA, game.vpB] : [game.vpB, game.vpA],
          wentFirst: game.firstTurn === null ? null : game.firstTurn === side,
        },
      ];
    }),
  );
}
