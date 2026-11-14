import {
  EventDetailSchema,
  EventPlayersResponseSchema,
  PlayerListSchema,
  type ListExportFormat,
} from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiDelete, apiGet, apiPost } from '../../api/client';

const enc = encodeURIComponent;

/** Everything under ['event', id] is refreshed together after an event sync or a list fetch. */
export const eventQuery = (eventId: string) =>
  queryOptions({
    queryKey: ['event', eventId],
    queryFn: () => apiGet(`/api/events/${enc(eventId)}`, EventDetailSchema),
    refetchInterval: (query) => {
      const detail = query.state.data;
      return detail && (detail.counts.listsQueued > 0 || detail.pairings.queued > 0) ? 5000 : false;
    },
  });

export const playersQuery = (eventId: string) =>
  queryOptions({
    queryKey: ['event', eventId, 'players'],
    queryFn: () => apiGet(`/api/events/${enc(eventId)}/players`, EventPlayersResponseSchema),
    refetchInterval: (query) =>
      query.state.data?.items.some((p) => p.listStatus === 'queued' || p.listStatus === 'fetching')
        ? 5000
        : false,
  });

export const playerListQuery = (playerId: string) =>
  queryOptions({
    queryKey: ['player-list', playerId],
    queryFn: () => apiGet(`/api/players/${enc(playerId)}/list`, PlayerListSchema),
  });

export const exportUrl = (eventId: string, format: ListExportFormat) =>
  `/api/events/${enc(eventId)}/lists/export?format=${format}`;

const BlockedSchema = z.object({ blockedAt: z.iso.datetime().nullable() });

/** An admin blocks the event: Logis stops asking BCP for it (and drops its queued work). */
export const blockEvent = (eventId: string) =>
  apiPost(`/api/events/${enc(eventId)}/block`, {}, BlockedSchema);

/** Makes a blocked event fetchable again. */
export const unblockEvent = (eventId: string) =>
  apiDelete(`/api/events/${enc(eventId)}/block`, BlockedSchema);
