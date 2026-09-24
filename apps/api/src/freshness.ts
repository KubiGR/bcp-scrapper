import { eventPhase, type DateRange } from '@bcp/shared';

/** The latest window counts as fresh this long after a covering catalogue sync (spec §7). */
export const CATALOG_MAX_AGE_MS = 6 * 3_600_000;
/** A running event's data counts as fresh this long after its last sync (spec §7). */
export const RUNNING_EVENT_MAX_AGE_MS = 10 * 60_000;

export interface FinishedRange extends DateRange {
  finishedAt: Date;
}

/** True when one succeeded catalogue run covers the whole window and finished under 6 hours ago. */
export function isLatestFresh(window: DateRange, runs: FinishedRange[], now: Date): boolean {
  return runs.some(
    (run) =>
      run.from <= window.from &&
      run.to >= window.to &&
      now.getTime() - run.finishedAt.getTime() < CATALOG_MAX_AGE_MS,
  );
}

/**
 * Whether the event page should (re)load the event from BCP: never synced, or its phase is
 * `running` and it was synced 10+ minutes ago. Upcoming and finished events stay cached until
 * the user presses Refresh.
 */
export function isEventStale(
  event: { startDate: Date; endDate: Date | null; ended: boolean; lastSyncedAt: Date | null },
  now: Date,
): boolean {
  if (event.lastSyncedAt === null) return true;
  if (eventPhase(event, now) !== 'running') return false;
  return now.getTime() - event.lastSyncedAt.getTime() >= RUNNING_EVENT_MAX_AGE_MS;
}
