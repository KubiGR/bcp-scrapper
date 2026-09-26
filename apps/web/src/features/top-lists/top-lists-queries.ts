import { addDays, PlayerSearchResponseSchema, toIsoDate, type DateRange } from '@bcp/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

/** The Top lists page's URL search; lists are comma-separated, detachments `|`-separated. */
export interface TopListsSearch {
  factions?: string;
  dispositions?: string;
  detachments?: string;
  from?: string;
  to?: string;
  maxLosses?: number;
}

/** The query string for GET /api/players/search: only what is set. */
export function topListsParams(search: TopListsSearch): string {
  return new URLSearchParams(
    Object.entries(search).flatMap(([key, value]) =>
      value === undefined || value === '' ? [] : [[key, String(value)]],
    ),
  ).toString();
}

/** The range shown when the URL has none: the API's default, the last 90 days. */
export function topListsWindow(search: TopListsSearch, now: Date): DateRange {
  const to = search.to ?? toIsoDate(now);
  return { from: search.from ?? addDays(to, -90), to };
}

export const topListsQuery = (search: TopListsSearch) =>
  queryOptions({
    queryKey: ['top-lists', topListsParams(search)],
    queryFn: () => {
      const params = topListsParams(search);
      return apiGet(`/api/players/search${params ? `?${params}` : ''}`, PlayerSearchResponseSchema);
    },
    placeholderData: keepPreviousData,
    // While any shown list is being fetched, follow it.
    refetchInterval: (query) =>
      query.state.data?.players.some(
        (player) => player.listStatus === 'queued' || player.listStatus === 'fetching',
      )
        ? 3000
        : false,
  });
