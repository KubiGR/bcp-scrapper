import type { PlayerSearchResponse } from '@bcp/shared';
import type { SortValue } from '../../lib/table-sort';

type FoundPlayer = PlayerSearchResponse['players'][number];

/**
 * How a found player's columns sort (Top lists, Meta's players). Players come from events of
 * different lengths, so the record sorts by win ratio (draws half), more wins first on a tie.
 */
export const FOUND_PLAYER_SORT = {
  player: (p) => p.name,
  event: (p) => Date.parse(p.eventStartDate),
  record: (p) => {
    const games = p.wins + p.losses + p.draws;
    return games === 0 ? null : (p.wins + p.draws / 2) / games + p.wins / 1_000_000;
  },
  army: (p) => p.faction,
} satisfies Record<string, SortValue<FoundPlayer>>;
