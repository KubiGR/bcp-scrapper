import type { QueuePairingsResult } from '@bcp/shared';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { findEvent } from '../repo/events';
import { enqueueEventPairings } from '../repo/fetch-queue';
import type { FetchQueueWorker } from './worker';

/**
 * Queues an event's pairings for the background worker; never fetches anything itself. An event
 * that was never synced first gets an event job (its round count is unknown until then), which
 * queues the rounds when it is done.
 */
export async function queueEventPairings(
  deps: { db: Db; fetchQueue: FetchQueueWorker },
  eventId: string,
  priority: number,
): Promise<QueuePairingsResult> {
  const event = await findEvent(deps.db, eventId);
  if (!event) throw new NotFoundError(`Event ${eventId} is not in the local catalogue`);
  const rounds = event.lastSyncedAt
    ? Array.from({ length: event.roundCount }, (_, index) => index + 1)
    : null;
  const queued = await enqueueEventPairings(deps.db, eventId, { rounds, priority });
  return { ...queued, estimatedSeconds: await deps.fetchQueue.estimateSecondsFor(eventId) };
}
