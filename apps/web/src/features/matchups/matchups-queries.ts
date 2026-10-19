import {
  addDays,
  BulkPairingsResultSchema,
  CellGamesResponseSchema,
  CrossEventMatchupsResponseSchema,
  DetachmentRowsResponseSchema,
  MatchupsResponseSchema,
  toIsoDate,
  type BulkPairingsResult,
  type DateRange,
  type DetachmentRowsResponse,
} from '@bcp/shared';
import { keepPreviousData, queryOptions, type UseQueryOptions } from '@tanstack/react-query';
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
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
  });
};

const detachmentRowsOptions = (queryKey: readonly unknown[], url: string) =>
  queryOptions({
    queryKey,
    queryFn: () => apiGet(url, DetachmentRowsResponseSchema),
    placeholderData: keepPreviousData,
  });
/** A faction's detachment rows, asked for when its row is opened. */
export type DetachmentRowsQuery = (
  faction: string,
) => UseQueryOptions<DetachmentRowsResponse, Error, DetachmentRowsResponse>;

export const eventDetachmentRowsQuery =
  (eventId: string, settings: MatrixSettings): DetachmentRowsQuery =>
  (faction) => {
    const params = { faction, ...matrixParams(settings) };
    return detachmentRowsOptions(
      ['event', eventId, 'matchups', 'detachments', params],
      `/api/events/${enc(eventId)}/matchups/detachments${toQuery(params)}`,
    );
  };

/** The cross-event page's URL search: a date range, event ticks, and the matrix's display
 * settings. `metric`/`minGames` are display-only (never sent to the API); `dispositions`/`side`
 * are server filters. */
export interface CrossSearch {
  from?: string;
  to?: string;
  exclude?: string;
  include?: string;
  metric?: 'winRate' | 'points';
  /** Rows and columns A→Z (`name`) rather than best first. */
  order?: 'overall' | 'name';
  minGames?: number;
  /** Comma-separated dispositions (any matches). */
  dispositions?: string;
  /** `|`-separated detachments (any matches; names may contain commas). */
  detachments?: string;
  side?: 'row' | 'both';
  /** `|`-separated factions shown as rows (display only, never sent to the API). */
  factions?: string;
}

/** Links from before the multi-select used a single `disposition`; read it as `dispositions`. */
export function fromLegacySearch(search: CrossSearch & { disposition?: string }): CrossSearch {
  const { disposition, ...rest } = search;
  if (disposition === undefined || rest.dispositions !== undefined) return rest;
  return { ...rest, dispositions: disposition };
}

const crossParams = (search: CrossSearch) =>
  new URLSearchParams(
    Object.entries({
      from: search.from,
      to: search.to,
      exclude: search.exclude,
      include: search.include,
      dispositions: search.dispositions,
      detachments: search.detachments,
      side: search.dispositions || search.detachments ? (search.side ?? 'row') : undefined,
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
    // The matrix is recomputed over every event's games: while some sync, a slow refresh is
    // enough (rounds arrive one every few seconds at best).
    refetchInterval: (query) =>
      query.state.data?.events.some((e) => e.pairings === 'fetching') ? 30_000 : false,
    placeholderData: keepPreviousData,
  });

export const crossCellGamesQuery = (search: CrossSearch, cell: { row: string; col: string }) =>
  queryOptions({
    queryKey: ['matchups', crossParams(search), 'games', cell.row, cell.col],
    queryFn: () =>
      apiGet(
        `/api/matchups/games?${crossParams(search)}&${new URLSearchParams(cell).toString()}`,
        CellGamesResponseSchema,
      ),
    placeholderData: keepPreviousData,
  });

export const crossDetachmentRowsQuery =
  (search: CrossSearch): DetachmentRowsQuery =>
  (faction) =>
    detachmentRowsOptions(
      ['matchups', crossParams(search), 'detachments', faction],
      `/api/matchups/detachments?${crossParams(search)}&${new URLSearchParams({ faction }).toString()}`,
    );

export const queueManyPairings = (eventIds: string[]) =>
  apiPost('/api/pairings-queue', { eventIds }, BulkPairingsResultSchema);

/** BCP's bulk-sync endpoint caps a request at 200 event ids; send more in sequential chunks and
 * sum the results so the caller sees one combined notification. */
const BULK_SYNC_CHUNK = 200;

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

export async function queueManyPairingsChunked(eventIds: string[]): Promise<BulkPairingsResult> {
  let events = 0;
  let queuedRounds = 0;
  const estimates: number[] = [];
  for (const ids of chunk(eventIds, BULK_SYNC_CHUNK)) {
    // Sequential, not Promise.all: BCP bulk sync must not burst multiple chunk requests at once.
    const result = await queueManyPairings(ids);
    events += result.events;
    queuedRounds += result.queuedRounds;
    if (result.estimatedSeconds !== null) estimates.push(result.estimatedSeconds);
  }
  return {
    events,
    queuedRounds,
    estimatedSeconds: estimates.length > 0 ? estimates.reduce((a, b) => a + b, 0) : null,
  };
}
