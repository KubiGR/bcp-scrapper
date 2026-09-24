import { ListQueueStateSchema, type ListQueueState } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiDelete, apiGet, apiPost } from '../../api/client';

const hasWork = (state: ListQueueState | undefined) =>
  state !== undefined && (state.totals.queued > 0 || state.totals.fetching > 0);

/** Polls quickly while lists are being fetched, and rarely otherwise (another tab may queue some). */
export const listQueueQuery = queryOptions({
  queryKey: ['list-queue'],
  queryFn: () => apiGet('/api/list-queue', ListQueueStateSchema),
  refetchInterval: (query) => (hasWork(query.state.data) ? 5000 : 30_000),
});

export const pauseQueue = () => apiPost('/api/list-queue/pause', {}, ListQueueStateSchema);
export const resumeQueue = () => apiPost('/api/list-queue/resume', {}, ListQueueStateSchema);

export const retryFailed = (eventId?: string) =>
  apiPost(
    '/api/list-queue/retry-failed',
    eventId === undefined ? {} : { eventId },
    z.object({ requeued: z.number().int() }),
  );

export const cancelQueued = (eventId: string) =>
  apiDelete(
    `/api/events/${encodeURIComponent(eventId)}/lists/queue`,
    z.object({ removed: z.number().int() }),
  );
