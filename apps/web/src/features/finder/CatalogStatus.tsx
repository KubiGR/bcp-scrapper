import { LatestRefreshSchema, type SyncRun } from '@bcp/shared';
import { Text } from '@mantine/core';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiPost } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { followRun, sameRange, type FollowOptions } from '../sync/follow-sync';
import { useSync } from '../sync/use-sync';
import { coverageQuery } from './finder-queries';

/**
 * Asks the API to refresh the latest window and follows the run. Only one catalogue run can be
 * active at a time, so the API may hand back another one: that is followed to the end, then the
 * refresh is asked for again. Resolves with the last run followed, or null if the window was fresh.
 */
async function refreshLatest(
  queryClient: QueryClient,
  onProgress: (run: SyncRun) => void,
  options: FollowOptions,
): Promise<SyncRun | null> {
  let last: SyncRun | null = null;
  for (;;) {
    const { window, run } = await apiPost('/api/catalog/latest', {}, LatestRefreshSchema);
    if (!run) return last;
    // The coverage notice shows the active run straight away.
    void queryClient.invalidateQueries({ queryKey: coverageQuery.queryKey });
    last = await followRun(run, onProgress, options);
    if (sameRange(run.range, window)) return last;
  }
}

/** Keeps the "Latest" view current and says when the catalogue last synced. */
export function CatalogStatus() {
  const queryClient = useQueryClient();
  const coverage = useQuery(coverageQuery);
  const sync = useSync({
    label: 'Catalogue refresh',
    invalidate: [['events'], coverageQuery.queryKey],
    quiet: true,
  });
  const { track, follow } = sync;
  const activeRun = coverage.data?.activeRun ?? null;

  // Once per visit. The API skips it when the last 30 days were synced under 6 hours ago.
  useEffect(() => {
    track((onProgress, options) => refreshLatest(queryClient, onProgress, options));
  }, [track, queryClient]);

  // A catalogue run started elsewhere (a deep-search fetch, another tab) is followed to the end.
  useEffect(() => {
    if (activeRun) follow(activeRun);
  }, [activeRun, follow]);

  const run = sync.isSyncing ? sync.run : activeRun;
  if (run) {
    return (
      <Text size="sm" c="dimmed" aria-live="polite">
        Updating the catalogue from BCP… <span className="numeric">{run.done}</span> found
      </Text>
    );
  }
  if (sync.error) {
    return (
      <Text size="sm" c="red">
        Couldn't refresh from BCP: {sync.error.message}
      </Text>
    );
  }
  const lastSyncedAt = coverage.data?.lastSyncedAt;
  return (
    <Text size="sm" c="dimmed">
      {lastSyncedAt
        ? `Catalogue synced ${formatDateTime(lastSyncedAt)}`
        : 'Catalogue not synced yet'}
    </Text>
  );
}
