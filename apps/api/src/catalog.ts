import {
  latestWindow,
  mergeRanges,
  toIsoDate,
  type CatalogCoverage,
  type CoveredRange,
  type LatestRefresh,
} from '@bcp/shared';
import type { Db } from './db/client';
import { isLatestFresh } from './freshness';
import {
  findActiveSyncRun,
  listSucceededCatalogRuns,
  type CatalogRunRange,
} from './repo/sync-runs';
import type { SyncRunner } from './sync/runner';

/**
 * The days a run really covers: up to the (UTC) day it finished. Days still in the future then
 * may have gained events since, so they don't count as fetched.
 */
function coveredPart(run: CatalogRunRange): CoveredRange[] {
  const finishedDay = toIsoDate(run.finishedAt);
  const to = run.to < finishedDay ? run.to : finishedDay;
  return run.from <= to ? [{ from: run.from, to, syncedAt: run.finishedAt.toISOString() }] : [];
}

/** Which date ranges have been fetched from BCP, when the catalogue last synced, and any active run. */
export async function getCoverage(db: Db): Promise<CatalogCoverage> {
  const runs = await listSucceededCatalogRuns(db);
  const ranges = mergeRanges(runs.flatMap(coveredPart));
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
 * finished under 50 minutes ago. If another catalogue run is active, that run is returned instead.
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
