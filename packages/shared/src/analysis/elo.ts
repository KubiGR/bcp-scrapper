/** Where every player's Elo starts. */
export const ELO_START = 1500;
/** How far one game moves a rating. */
export const ELO_K = 32;

/** One played game between two accounts, oldest first. */
export interface EloGame {
  a: string;
  b: string;
  result: 'a_win' | 'b_win' | 'draw';
}

export interface EloRating {
  elo: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

/**
 * Classic Elo over the games in the order given: each game moves both players by K times the
 * difference between the result (1, ½ or 0) and what their ratings expected.
 */
export function computeElo(games: Iterable<EloGame>): Map<string, EloRating> {
  const ratings = new Map<string, EloRating>();
  const of = (id: string) => {
    let rating = ratings.get(id);
    if (rating === undefined) {
      rating = { elo: ELO_START, games: 0, wins: 0, losses: 0, draws: 0 };
      ratings.set(id, rating);
    }
    return rating;
  };
  for (const game of games) {
    if (game.a === game.b) continue;
    const a = of(game.a);
    const b = of(game.b);
    const expectedA = 1 / (1 + 10 ** ((b.elo - a.elo) / 400));
    const scoreA = game.result === 'a_win' ? 1 : game.result === 'draw' ? 0.5 : 0;
    const change = ELO_K * (scoreA - expectedA);
    a.elo += change;
    b.elo -= change;
    a.games += 1;
    b.games += 1;
    if (game.result === 'draw') {
      a.draws += 1;
      b.draws += 1;
    } else {
      const [winner, loser] = game.result === 'a_win' ? [a, b] : [b, a];
      winner.wins += 1;
      loser.losses += 1;
    }
  }
  return ratings;
}
