import {
  EventDetailSchema,
  EventPlayersResponseSchema,
  PlayerListSchema,
  type ListExportFormat,
} from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

const enc = encodeURIComponent;

/** Everything under ['event', id] is refreshed together after an event or lists sync. */
export const eventQuery = (eventId: string) =>
  queryOptions({
    queryKey: ['event', eventId],
    queryFn: () => apiGet(`/api/events/${enc(eventId)}`, EventDetailSchema),
  });

export const playersQuery = (eventId: string) =>
  queryOptions({
    queryKey: ['event', eventId, 'players'],
    queryFn: () => apiGet(`/api/events/${enc(eventId)}/players`, EventPlayersResponseSchema),
  });

export const playerListQuery = (playerId: string) =>
  queryOptions({
    queryKey: ['player-list', playerId],
    queryFn: () => apiGet(`/api/players/${enc(playerId)}/list`, PlayerListSchema),
  });

export const exportUrl = (eventId: string, format: ListExportFormat) =>
  `/api/events/${enc(eventId)}/lists/export?format=${format}`;
