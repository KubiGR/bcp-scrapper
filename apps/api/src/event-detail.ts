import type { EventDetail } from '@bcp/shared';
import type { Db } from './db/client';
import { isEventStale } from './freshness';
import type { ListQueueWorker } from './list-queue/worker';
import { findEvent, toEventListItem } from './repo/events';
import { countEventParticipants } from './repo/participants';
import { latestEventSyncRuns } from './repo/sync-runs';

/** Everything the event page header needs, or null when the event isn't in the catalogue. */
export async function getEventDetail(
  deps: { db: Db; listQueue: ListQueueWorker },
  eventId: string,
  now: Date,
): Promise<EventDetail | null> {
  const { db } = deps;
  const row = await findEvent(db, eventId);
  if (!row) return null;
  const [counts, syncs, listQueueSeconds] = await Promise.all([
    countEventParticipants(db, eventId),
    latestEventSyncRuns(db, eventId),
    deps.listQueue.estimateSecondsFor(eventId),
  ]);
  return {
    ...toEventListItem(row),
    stale: isEventStale(row, now),
    counts,
    syncs,
    listQueueSeconds,
  };
}
