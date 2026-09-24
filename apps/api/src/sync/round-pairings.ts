import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import type { Logger } from '../logger';
import { replaceRoundPairings } from '../repo/pairings';

export interface RoundPairingsOutcome {
  matchups: number;
  games: number;
  /** Where the games came from; 'none' when neither endpoint had any. */
  gamesFrom: 'pairings' | 'event' | 'none';
}

/**
 * Fetches and stores one round: team matchups (team events), then individual games from
 * `/v1/pairings`. Bracket/GW team events have no games there, so when a round has team matchups
 * but no games, the event-level endpoint is asked instead (its games carry no VP).
 */
export async function syncRoundPairings(
  deps: { db: Db; source: TournamentSource; logger: Logger },
  event: { id: string; isTeamEvent: boolean },
  round: number,
): Promise<RoundPairingsOutcome> {
  const { db, source, logger } = deps;
  const teamMatchups = event.isTeamEvent ? await source.getTeamMatchups(event.id, round) : [];
  let games = await source.getGames(event.id, round);
  let gamesFrom: RoundPairingsOutcome['gamesFrom'] = games.length > 0 ? 'pairings' : 'none';
  if (games.length === 0 && teamMatchups.length > 0) {
    games = await source.getEventGames(event.id, round);
    if (games.length > 0) gamesFrom = 'event';
  }
  if (teamMatchups.length > 0 && games.length === 0) {
    logger.warn(
      { eventId: event.id, round },
      `BCP returned no individual games for round ${round}; team matchups stored only`,
    );
  }
  await replaceRoundPairings(db, event.id, round, { teamMatchups, games });
  return { matchups: teamMatchups.length, games: games.length, gamesFrom };
}
