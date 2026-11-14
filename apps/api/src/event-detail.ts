import type { EventDetail } from '@bcp/shared';
import type { Db } from './db/client';
import { isEventStale } from './freshness';
import type { FetchQueueWorker } from './fetch-queue/worker';
import { findEvent, toEventListItem } from './repo/events';
import { fieldElos } from './repo/field-elo';
import { eventPairingsJobs } from './repo/fetch-queue';
import { storedPairingsSummary } from './repo/pairings';
import { countEventParticipants } from './repo/participants';
import { latestEventSyncRuns } from './repo/sync-runs';

/** Everything the event page header needs, or null when the event isn't in the catalogue. */
export async function getEventDetail(
  deps: { db: Db; fetchQueue: FetchQueueWorker },
  eventId: string,
  now: Date,
): Promise<EventDetail | null> {
  const { db } = deps;
  const row = await findEvent(db, eventId);
  if (!row) return null;
  const [counts, syncs, queueSeconds, stored, jobs, strength] = await Promise.all([
    countEventParticipants(db, eventId),
    latestEventSyncRuns(db, eventId),
    deps.fetchQueue.estimateSecondsFor(eventId),
    storedPairingsSummary(db, eventId),
    eventPairingsJobs(db, eventId),
    fieldElos(db, [eventId]),
  ]);
  // A blocked event isn't fetched again: its old failures are history, not something to retry.
  const blocked = row.blockedAt !== null;
  return {
    ...toEventListItem(row, strength.get(eventId)),
    stale: isEventStale(row, now),
    counts: blocked ? { ...counts, listsFailed: 0 } : counts,
    syncs,
    queueSeconds,
    pairings: {
      syncedAt: row.pairingsSyncedAt?.toISOString() ?? null,
      roundCount: row.roundCount,
      roundsDone: stored.rounds,
      queued: jobs.queued,
      queuedRounds: jobs.queuedRounds,
      failed: blocked ? 0 : jobs.failed,
      failedRounds: blocked ? [] : jobs.failedRounds,
      loadFailed: blocked ? false : jobs.loadFailed,
      gamesAvailable: stored.matchups === 0 || stored.games > 0,
    },
  };
}
