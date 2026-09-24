import { CellGamesResponseSchema, MatchupsResponseSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';
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
