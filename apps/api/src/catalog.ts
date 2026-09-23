import { latestWindow, mergeRanges, type CatalogCoverage, type LatestRefresh } from '@bcp/shared';
import type { Db } from './db/client';
import { isLatestFresh } from './freshness';
import { findActiveSyncRun, listSucceededCatalogRuns } from './repo/sync-runs';
import type { SyncRunner } from './sync/runner';

/** Which date ranges have been fetched from BCP, when the catalogue last synced, and any active run. */
export async function getCoverage(db: Db): Promise<CatalogCoverage> {
  const runs = await listSucceededCatalogRuns(db);
  const ranges = mergeRanges(
    runs.map((run) => ({ from: run.from, to: run.to, syncedAt: run.finishedAt.toISOString() })),
  );
  const lastSyncedAt = runs.reduce<Date | null>(
    (latest, run) => (latest && latest > run.finishedAt ? latest : run.finishedAt),
    null,
  );
  return {
    ranges,
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
    activeRun: await findActiveSyncRun(db, 'catalog', null),
  };
}

/**
 * Keeps the finder's default view current: syncs the latest window unless a covering sync
 * finished under 6 hours ago. If another catalogue run is active, that run is returned instead.
 */
export async function refreshLatest(
  deps: { db: Db; runner: SyncRunner },
  now: Date,
): Promise<LatestRefresh> {
  const window = latestWindow(now);
  if (isLatestFresh(window, await listSucceededCatalogRuns(deps.db), now)) {
    return { window, run: null };
  }
  return { window, run: await deps.runner.start({ kind: 'catalog', ...window }) };
}
