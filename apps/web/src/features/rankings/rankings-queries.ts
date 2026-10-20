import { PlayerRankingSchema, RankingsResponseSchema, TopRanksSchema } from '@bcp/shared';
import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query';
import { ApiError, apiGet } from '../../api/client';

export const topRanksQuery = queryOptions({
  queryKey: ['rankings', 'top'],
  queryFn: () => apiGet('/api/rankings/top', TopRanksSchema),
  staleTime: 5 * 60_000,
  retry: false,
});

/** Rankings pages of this size, loaded one after another ("Show more"). */
export const RANKINGS_PAGE = 100;

export const rankingsPagesQuery = (filters: {
  search?: string;
  faction?: string;
  /** By wh40k-elo's rating instead of points. */
  order?: 'wh40kElo';
}) => {
  const params = (offset: number) => {
    const query = new URLSearchParams();
    if (filters.search) query.set('search', filters.search);
    if (filters.faction) query.set('faction', filters.faction);
    if (filters.order) query.set('sort', filters.order);
    query.set('offset', String(offset));
    query.set('limit', String(RANKINGS_PAGE));
    return query.toString();
  };
  return infiniteQueryOptions({
    queryKey: [
      'rankings',
      'pages',
      filters.search ?? '',
      filters.faction ?? '',
      filters.order ?? 'points',
    ],
    queryFn: ({ pageParam }) =>
      apiGet(`/api/rankings?${params(pageParam)}`, RankingsResponseSchema),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const next = pages.length * RANKINGS_PAGE;
      return next < last.total ? next : undefined;
    },
    placeholderData: keepPreviousData,
  });
};

export const playerRankingQuery = (userId: string) =>
  queryOptions({
    queryKey: ['rankings', 'player', userId],
    queryFn: () => apiGet(`/api/rankings/${encodeURIComponent(userId)}`, PlayerRankingSchema),
    // An unknown account stays unknown.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 3,
  });
