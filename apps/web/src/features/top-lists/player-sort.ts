import type { PlayerSearchResponse } from '@bcp/shared';
import type { SortValue } from '../../lib/table-sort';

type FoundPlayer = PlayerSearchResponse['players'][number];

/**
 * How a found player's columns sort (Top lists, Meta's players). The record sorts fewest losses
 * first (X-0, then X-1, like the record filter), then most wins, then most draws. The sort is
 * stable, so the same record keeps the API's order: higher wh40k-elo first.
 */
export const FOUND_PLAYER_SORT = {
  player: (p) => p.name,
  event: (p) => Date.parse(p.eventStartDate),
  // No games is no record: blank, so last either way.
  record: (p) =>
    p.wins + p.losses + p.draws === 0 ? null : -p.losses * 1_000_000 + p.wins * 1_000 + p.draws,
  army: (p) => p.faction,
} satisfies Record<string, SortValue<FoundPlayer>>;

/**
 * Where a found player placed: in a team event their team's place ("Alpha Squad · #2"), else
 * their own ("#3"); null when unplaced and teamless.
 */
export function placingLine(player: FoundPlayer): string | null {
  if (player.teamName !== null) {
    return player.teamPlacing === null
      ? player.teamName
      : `${player.teamName} · #${String(player.teamPlacing)}`;
  }
  return player.placing === null ? null : `#${String(player.placing)}`;
}
