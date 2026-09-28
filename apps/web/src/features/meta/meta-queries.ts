import { addDays, MetaResponseSchema, toIsoDate, type DateRange } from '@bcp/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

export type MetaSort = 'faction' | 'players' | 'winRate' | 'x1';

/** The Meta page's URL search. `expanded`: `|`-separated factions ("(unknown)" for none). */
export interface MetaSearch {
  from?: string;
  to?: string;
  type?: 'all' | 'singles' | 'teams';
  minPlayers?: number;
  sort?: MetaSort;
  /** Sort direction; default high to low (A→Z for faction). */
  dir?: 'asc' | 'desc';
  expanded?: string;
}

export const DEFAULT_MIN_PLAYERS = 10;

/** Only the date range and event type go to the API; the rest is display. */
export function metaParams(search: MetaSearch): string {
  return new URLSearchParams(
    Object.entries({ from: search.from, to: search.to, type: search.type }).flatMap(
      ([key, value]) => (value === undefined ? [] : [[key, value]]),
    ),
  ).toString();
}

export const metaQuery = (search: MetaSearch) =>
  queryOptions({
    queryKey: ['meta', metaParams(search)],
    queryFn: () => {
      const params = metaParams(search);
      return apiGet(`/api/meta${params ? `?${params}` : ''}`, MetaResponseSchema);
    },
    placeholderData: keepPreviousData,
  });

/** The range shown when the URL has none: the API's default, the last 90 days. */
export function metaWindow(search: MetaSearch, now: Date): DateRange {
  const to = search.to ?? toIsoDate(now);
  return { from: search.from ?? addDays(to, -90), to };
}

/** Like the matchups heatmap: below 45 % bad, above 55 % good. */
export function winRateTone(rate: number): 'good' | 'bad' | 'even' {
  if (rate > 0.55) return 'good';
  if (rate < 0.45) return 'bad';
  return 'even';
}

export const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;
