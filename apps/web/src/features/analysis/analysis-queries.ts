import {
  QueuePairingsResultSchema,
  RoundsResponseSchema,
  StandingsResponseSchema,
  TeamDetailResponseSchema,
} from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../api/client';

const enc = encodeURIComponent;
/** While an event's pairings are being fetched, its analysis refreshes itself. */
const every = (live: boolean) => (live ? 5000 : false);

export const roundsQuery = (eventId: string, live: boolean) =>
  queryOptions({
    queryKey: ['event', eventId, 'rounds'],
    queryFn: () => apiGet(`/api/events/${enc(eventId)}/rounds`, RoundsResponseSchema),
    refetchInterval: every(live),
  });

export const standingsQuery = (eventId: string, live: boolean) =>
  queryOptions({
    queryKey: ['event', eventId, 'standings'],
    queryFn: () => apiGet(`/api/events/${enc(eventId)}/standings`, StandingsResponseSchema),
    refetchInterval: every(live),
  });

export const teamQuery = (eventId: string, teamId: string, live: boolean) =>
  queryOptions({
    queryKey: ['event', eventId, 'team', teamId],
    queryFn: () =>
      apiGet(`/api/events/${enc(eventId)}/teams/${enc(teamId)}`, TeamDetailResponseSchema),
    refetchInterval: every(live),
  });

export const queuePairings = (eventId: string) =>
  apiPost(`/api/events/${enc(eventId)}/pairings/queue`, {}, QueuePairingsResultSchema);
