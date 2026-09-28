import { FetchQueueStateSchema, type FetchQueueState } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiDelete, apiGet, apiPost } from '../../api/client';

const hasWork = (state: FetchQueueState | undefined) =>
  state !== undefined &&
  (state.totals.queued > 0 || state.totals.fetching > 0 || state.auto.jobs > 0);

/** Polls quickly while lists are being fetched, and rarely otherwise (another tab may queue some). */
export const fetchQueueQuery = queryOptions({
  queryKey: ['fetch-queue'],
  queryFn: () => apiGet('/api/fetch-queue', FetchQueueStateSchema),
  refetchInterval: (query) => (hasWork(query.state.data) ? 5000 : 30_000),
});

export const pauseQueue = () => apiPost('/api/fetch-queue/pause', {}, FetchQueueStateSchema);
export const resumeQueue = () => apiPost('/api/fetch-queue/resume', {}, FetchQueueStateSchema);

/** `only: 'pairings'`: just the event's pairings, leaving its failed lists. */
export const retryFailed = (eventId?: string, only?: 'pairings') =>
  apiPost(
    '/api/fetch-queue/retry-failed',
    { ...(eventId === undefined ? {} : { eventId }), ...(only === undefined ? {} : { only }) },
    z.object({ requeued: z.number().int() }),
  );

export const cancelQueued = (eventId: string) =>
  apiDelete(
    `/api/events/${encodeURIComponent(eventId)}/lists/queue`,
    z.object({ removed: z.number().int() }),
  );
