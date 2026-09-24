import type { GameView, MatchupView, Outcome, TeamRef } from '@bcp/shared';

/** A matchup from one team's point of view: swapped to the team's side when it's side B. */
export interface TeamMatchup {
  matchupId: string;
  /** Null for a bye. */
  opponent: TeamRef | null;
  points: number | null;
  opponentPoints: number | null;
  outcome: Outcome | null;
  /** The team's own player is `playerA` where possible (swapped when the team is side B). */
  games: GameView[];
}

function flipOutcome(outcome: Outcome | null): Outcome | null {
  switch (outcome) {
    case 'win':
      return 'loss';
    case 'loss':
      return 'win';
    case 'draw':
      return 'draw';
    case 'bye':
      return 'bye';
    case null:
      return null;
  }
}

function swapGame(game: GameView): GameView {
  if (!game.playerB) return game;
  return {
    ...game,
    playerA: game.playerB,
    playerB: game.playerA,
    gamePointsA: game.gamePointsB,
    gamePointsB: game.gamePointsA,
    vpA: game.vpB,
    vpB: game.vpA,
    firstTurn: game.firstTurn === 'a' ? 'b' : game.firstTurn === 'b' ? 'a' : game.firstTurn,
  };
}

/** The matchup from `teamId`'s point of view, or null when the team isn't in it. */
export function matchupFor(matchup: MatchupView, teamId: string): TeamMatchup | null {
  if (matchup.teamA.id === teamId) {
    return {
      matchupId: matchup.id,
      opponent: matchup.teamB,
      points: matchup.pointsA,
      opponentPoints: matchup.pointsB,
      outcome: matchup.outcomeA,
      games: matchup.games,
    };
  }
  if (matchup.teamB?.id === teamId) {
    return {
      matchupId: matchup.id,
      opponent: matchup.teamA,
      points: matchup.pointsB,
      opponentPoints: matchup.pointsA,
      outcome: flipOutcome(matchup.outcomeA),
      games: matchup.games.map(swapGame),
    };
  }
  return null;
}
