import type { GameView, PlayerRef, RoundView } from '@bcp/shared';

const text = (p: PlayerRef | null) =>
  p ? [p.name, p.faction ?? '', p.disposition ?? '', ...p.detachments].join(' ') : '';

/**
 * A round narrowed to the games that match every word of `query` (players, armies, detachments,
 * dispositions, team names); a matchup stays while any of its games does. An empty query keeps
 * the round as it is.
 */
export function filterRound(round: RoundView, query: string): RoundView {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return round;
  const matches = (game: GameView, teams = '') => {
    const haystack = `${text(game.playerA)} ${text(game.playerB)} ${teams}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  };
  return {
    ...round,
    matchups: round.matchups.flatMap((matchup) => {
      const teams = `${matchup.teamA.name} ${matchup.teamB?.name ?? ''}`;
      const games = matchup.games.filter((game) => matches(game, teams));
      return games.length > 0 ? [{ ...matchup, games }] : [];
    }),
    games: round.games.filter((game) => matches(game)),
  };
}
