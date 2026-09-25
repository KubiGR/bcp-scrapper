import {
  addDays,
  BulkPairingsResultSchema,
  CellGamesResponseSchema,
  CrossEventMatchupsResponseSchema,
  MatchupsResponseSchema,
  toIsoDate,
  type DateRange,
} from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../api/client';
import { matrixParams, type MatrixSettings } from './matrix-view';

const enc = encodeURIComponent;
/** While an event's pairings are being fetched, the matchups matrix refreshes itself. */
const every = (live: boolean) => (live ? 5000 : false);

const toQuery = (params: Record<string, string>) => {
  const qs = new URLSearchParams(params).toString();
  return qs === '' ? '' : `?${qs}`;
};

export const eventMatchupsQuery = (eventId: string, settings: MatrixSettings, live: boolean) => {
  const params = matrixParams(settings);
  return queryOptions({
    queryKey: ['event', eventId, 'matchups', params],
    queryFn: () =>
      apiGet(`/api/events/${enc(eventId)}/matchups${toQuery(params)}`, MatchupsResponseSchema),
    refetchInterval: every(live),
  });
};

export const eventCellGamesQuery = (
  eventId: string,
  cell: { row: string; col: string },
  settings: MatrixSettings,
) => {
  const params = { row: cell.row, col: cell.col, ...matrixParams(settings) };
  return queryOptions({
    queryKey: ['event', eventId, 'matchups', 'games', cell, matrixParams(settings)],
    queryFn: () =>
      apiGet(
        `/api/events/${enc(eventId)}/matchups/games${toQuery(params)}`,
        CellGamesResponseSchema,
      ),
  });
};

/** The cross-event page's URL search: a date range, event ticks, and the matrix's display
 * settings. `metric`/`minGames` are display-only (never sent to the API); `disposition`/`side`
 * are server filters. */
export interface CrossSearch {
  from?: string;
  to?: string;
  exclude?: string;
  include?: string;
  metric?: 'winRate' | 'points';
  minGames?: number;
  disposition?: string;
  side?: 'row' | 'both';
}

const crossParams = (search: CrossSearch) =>
  new URLSearchParams(
    Object.entries({
      from: search.from,
      to: search.to,
      exclude: search.exclude,
      include: search.include,
      disposition: search.disposition,
      side: search.disposition ? (search.side ?? 'row') : undefined,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
    ),
  ).toString();

/** The default date range shown when the URL has none: the API's own default (last 90 days). */
export function crossWindow(search: Pick<CrossSearch, 'from' | 'to'>, now: Date): DateRange {
  const to = search.to ?? toIsoDate(now);
  const from = search.from ?? addDays(to, -90);
  return { from, to };
}

export const crossMatchupsQuery = (search: CrossSearch) =>
  queryOptions({
    queryKey: ['matchups', crossParams(search)],
    queryFn: () => apiGet(`/api/matchups?${crossParams(search)}`, CrossEventMatchupsResponseSchema),
    refetchInterval: (query) =>
      query.state.data?.events.some((e) => e.pairings === 'fetching') ? 5000 : false,
  });

export const crossCellGamesQuery = (search: CrossSearch, cell: { row: string; col: string }) =>
  queryOptions({
    queryKey: ['matchups', crossParams(search), 'games', cell.row, cell.col],
    queryFn: () =>
      apiGet(
        `/api/matchups/games?${crossParams(search)}&${new URLSearchParams(cell).toString()}`,
        CellGamesResponseSchema,
      ),
  });

export const queueManyPairings = (eventIds: string[]) =>
  apiPost('/api/pairings-queue', { eventIds }, BulkPairingsResultSchema);
