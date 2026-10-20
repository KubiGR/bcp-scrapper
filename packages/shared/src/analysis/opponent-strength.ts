/** A game at one event between two players (by their entry in it); b is null for a bye. */
export interface PairedGame {
  a: string;
  b: string | null;
}

export interface EventRecord {
  wins: number;
  losses: number;
  draws: number;
}

export interface OpponentStrength {
  /** The opponents' average win rate at this event (a draw is half a win); null without any. */
  winRate: number | null;
  /** The rated opponents' average wh40k-elo; null when none is rated. */
  elo: number | null;
  /** Opponents met with a wh40k-elo rating. */
  rated: number;
  /** Opponents met (byes don't count; one met twice counts twice). */
  games: number;
}

const winRateOf = (record: EventRecord | undefined): number | null => {
  if (record === undefined) return null;
  const played = record.wins + record.losses + record.draws;
  return played === 0 ? null : (record.wins + record.draws / 2) / played;
};

const average = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * How strong each player's opponents were, from this event alone: their records here, and their
 * wh40k-elo ratings (`elo`, by player entry).
 */
export function opponentStrengths(
  games: PairedGame[],
  records: Map<string, EventRecord>,
  elo: Map<string, number>,
): Map<string, OpponentStrength> {
  const opponents = new Map<string, string[]>();
  const meet = (player: string, opponent: string) => {
    opponents.set(player, [...(opponents.get(player) ?? []), opponent]);
  };
  for (const game of games) {
    if (game.b === null || game.a === game.b) continue;
    meet(game.a, game.b);
    meet(game.b, game.a);
  }
  const strengths = new Map<string, OpponentStrength>();
  for (const [player, met] of opponents) {
    const rates = met.flatMap((id) => {
      const rate = winRateOf(records.get(id));
      return rate === null ? [] : [rate];
    });
    const ratings = met.flatMap((id) => {
      const rating = elo.get(id);
      return rating === undefined ? [] : [rating];
    });
    strengths.set(player, {
      winRate: average(rates),
      elo: average(ratings),
      rated: ratings.length,
      games: met.length,
    });
  }
  return strengths;
}
