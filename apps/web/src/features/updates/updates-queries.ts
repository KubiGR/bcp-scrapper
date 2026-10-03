import {
  GameUpdatesResponseSchema,
  toIsoDate,
  updateSpans,
  type EffectiveUpdate,
  type GameUpdatesResponse,
  type UpdateSpan,
} from '@bcp/shared';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

export const updatesQuery = queryOptions({
  queryKey: ['game-updates'],
  queryFn: () => apiGet('/api/updates', GameUpdatesResponseSchema),
  staleTime: 5 * 60_000,
});

/** The updates people pick from (not merged or hidden), oldest first. */
export const effectiveOf = (data: GameUpdatesResponse | undefined): EffectiveUpdate[] =>
  (data?.updates ?? [])
    .filter((update) => !update.merged && !update.hidden)
    .map(({ id, name, start }) => ({ id, name, start }))
    .sort((a, b) => a.start.localeCompare(b.start));

/** Each update's days, oldest first; empty while loading or without updates. */
export function useUpdateSpans(): UpdateSpan[] {
  const { data } = useQuery(updatesQuery);
  return updateSpans(effectiveOf(data), toIsoDate(new Date()));
}
