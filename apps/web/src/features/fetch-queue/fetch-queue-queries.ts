import { FetchQueueStateSchema, QueueDetailsSchema, type FetchQueueState } from '@bcp/shared';
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

/** The Queue page's detail: failures by reason and what runs next (polled while work waits). */
export const queueDetailsQuery = queryOptions({
  queryKey: ['fetch-queue', 'details'],
  queryFn: () => apiGet('/api/fetch-queue/details', QueueDetailsSchema),
  refetchInterval: (query) => ((query.state.data?.next.length ?? 0) > 0 ? 5000 : 30_000),
});

/**
 * `only: 'pairings'`: just the event's pairings, leaving its failed lists; `code`: just the
 * failures with that error code.
 */
export const retryFailed = (eventId?: string, only?: 'pairings', code?: string) =>
  apiPost(
    '/api/fetch-queue/retry-failed',
    {
      ...(eventId === undefined ? {} : { eventId }),
      ...(only === undefined ? {} : { only }),
      ...(code === undefined ? {} : { code }),
    },
    z.object({ requeued: z.number().int() }),
  );

export const cancelQueued = (eventId: string) =>
  apiDelete(
    `/api/events/${encodeURIComponent(eventId)}/lists/queue`,
    z.object({ removed: z.number().int() }),
  );
