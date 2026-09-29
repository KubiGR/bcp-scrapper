import {
  PlayerRankingSchema,
  RankingsResponseSchema,
  TopRanksSchema,
  type RankingsQuery,
} from '@bcp/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { ApiError, apiGet } from '../../api/client';

export const topRanksQuery = queryOptions({
  queryKey: ['rankings', 'top'],
  queryFn: () => apiGet('/api/rankings/top', TopRanksSchema),
  staleTime: 5 * 60_000,
  retry: false,
});

export const rankingsQuery = (query: Partial<RankingsQuery>) => {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.faction) params.set('faction', query.faction);
  if (query.offset) params.set('offset', String(query.offset));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  return queryOptions({
    queryKey: ['rankings', params.toString()],
    queryFn: () => apiGet(`/api/rankings?${params.toString()}`, RankingsResponseSchema),
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
