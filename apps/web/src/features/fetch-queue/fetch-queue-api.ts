import { QueueListsResultSchema, type QueueListsRequest, type QueueListsResult } from '@bcp/shared';
import { apiPost } from '../../api/client';
import { formatDuration } from '../../lib/format';

export function queueLists(eventId: string, request: QueueListsRequest): Promise<QueueListsResult> {
  return apiPost(
    `/api/events/${encodeURIComponent(eventId)}/lists/queue`,
    request,
    QueueListsResultSchema,
  );
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** One line for a notification, e.g. "Queued 7 lists · 1 has no list · about 35 s". */
export function describeQueueResult(result: QueueListsResult): string {
  const parts = [`Queued ${result.queued} ${plural(result.queued, 'list', 'lists')}`];
  if (result.alreadyQueued > 0) parts.push(`${result.alreadyQueued} already queued`);
  if (result.alreadyFetched > 0) parts.push(`${result.alreadyFetched} already fetched`);
  if (result.noListOnBcp > 0) {
    parts.push(`${result.noListOnBcp} ${plural(result.noListOnBcp, 'has', 'have')} no list`);
  }
  if (result.estimatedSeconds !== null)
    parts.push(`about ${formatDuration(result.estimatedSeconds)}`);
  return parts.join(' · ');
}
