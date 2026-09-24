import type { BulkPairingsResult, QueuePairingsResult } from '@bcp/shared';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { findEvent } from '../repo/events';
import { enqueueEventPairings, eventPairingsJobs } from '../repo/fetch-queue';
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

/**
 * Queues pairings for many events at once (the cross-event page). Events whose pairings are
 * already synced are skipped; open jobs are never duplicated. Nothing is fetched here: the
 * worker does it, one job per tick.
 */
export async function queueManyEventPairings(
  deps: { db: Db; fetchQueue: FetchQueueWorker },
  eventIds: string[],
  priority: number,
): Promise<BulkPairingsResult> {
  let eventsQueued = 0;
  let queuedRounds = 0;
  for (const eventId of new Set(eventIds)) {
    const event = await findEvent(deps.db, eventId);
    if (!event || event.pairingsSyncedAt) continue;
    const before = await eventPairingsJobs(deps.db, eventId);
    const result = await queueEventPairings(deps, eventId, priority);
    if (result.queuedRounds > 0 || (result.eventQueued && before.queued === 0)) {
      eventsQueued += 1;
    }
    queuedRounds += result.queuedRounds;
  }
  return {
    events: eventsQueued,
    queuedRounds,
    estimatedSeconds: await deps.fetchQueue.estimateSecondsFor(),
  };
}
