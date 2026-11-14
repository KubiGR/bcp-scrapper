import {
  defaultRangeFrom,
  GameUpdatesResponseSchema,
  toIsoDate,
  updateSpans,
  type DateRange,
  type EffectiveUpdate,
  type GameUpdateCreate,
  type GameUpdatePatch,
  type GameUpdatesResponse,
  type UpdateSpan,
} from '@bcp/shared';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/client';

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

/**
 * A page's dates as the URL has them; without a start, since the update in force on the end day
 * (today without an end), as the API reads them.
 */
export function useDateWindow(range: {
  from?: string | undefined;
  to?: string | undefined;
}): DateRange {
  const { data } = useQuery(updatesQuery);
  const to = range.to ?? toIsoDate(new Date());
  return { from: range.from ?? defaultRangeFrom(effectiveOf(data), to), to };
}

/** An admin's edit to an update (null name/start: back to the update's own). */
export const patchGameUpdate = (id: string, patch: GameUpdatePatch) =>
  apiPatch(`/api/updates/${encodeURIComponent(id)}`, patch, GameUpdatesResponseSchema);

/** An update an admin adds by hand (BSData, where they came from, was taken down). */
export const addGameUpdate = (update: GameUpdateCreate) =>
  apiPost('/api/updates', update, GameUpdatesResponseSchema);

/** Deletes an update added by hand. */
export const deleteGameUpdate = (id: string) =>
  apiDelete(`/api/updates/${encodeURIComponent(id)}`, GameUpdatesResponseSchema);
