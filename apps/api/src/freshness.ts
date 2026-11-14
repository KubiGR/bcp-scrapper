import { eventFinishedBy, eventPhase, type DateRange } from '@bcp/shared';

/** The latest window counts as fresh this long after a covering catalogue sync (spec §7). */
/** Under the hourly refresh, so each hourly tick finds the last run stale. */
export const CATALOG_MAX_AGE_MS = 50 * 60_000;
/** A running event's data counts as fresh this long after its last sync (spec §7). */
export const RUNNING_EVENT_MAX_AGE_MS = 10 * 60_000;

export interface FinishedRange extends DateRange {
  finishedAt: Date;
}

/** True when one succeeded catalogue run covers the whole window and finished under 50 minutes ago. */
export function isLatestFresh(window: DateRange, runs: FinishedRange[], now: Date): boolean {
  return runs.some(
    (run) =>
      run.from <= window.from &&
      run.to >= window.to &&
      now.getTime() - run.finishedAt.getTime() < CATALOG_MAX_AGE_MS,
  );
}

/**
 * Whether an event's last load came before it ended (its end date, else the start's grace), so
 * its standings and records are from mid-round — a 5-0 player still placed below 0-5 ones.
 */
export function syncedBeforeEnd(event: {
  startDate: Date;
  endDate: Date | null;
  lastSyncedAt: Date | null;
}): boolean {
  if (event.lastSyncedAt === null) return false;
  const end = event.endDate ?? eventFinishedBy(event);
  return event.lastSyncedAt.getTime() < end.getTime();
}

/**
 * Whether the event page should (re)load the event from BCP: never synced; its phase is
 * `running` and it was synced 10+ minutes ago; or it's over but was last synced before it ended
 * (once: the load makes it final). Upcoming and finished events otherwise stay cached until the
 * user presses Refresh. An event BCP removed is never stale: reloading it would only 404. Nor is
 * one an admin blocked: it isn't fetched at all.
 */
export function isEventStale(
  event: {
    startDate: Date;
    endDate: Date | null;
    ended: boolean;
    lastSyncedAt: Date | null;
    removedFromBcpAt?: Date | null;
    blockedAt?: Date | null;
  },
  now: Date,
): boolean {
  if (event.removedFromBcpAt || event.blockedAt) return false;
  if (event.lastSyncedAt === null) return true;
  const phase = eventPhase(event, now);
  if (phase === 'finished') return syncedBeforeEnd(event);
  if (phase !== 'running') return false;
  return now.getTime() - event.lastSyncedAt.getTime() >= RUNNING_EVENT_MAX_AGE_MS;
}
