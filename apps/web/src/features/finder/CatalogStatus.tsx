import { LatestRefreshSchema, type SyncRun } from '@bcp/shared';
import { Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiPost } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { followRun } from '../sync/follow-sync';
import { notifySyncFinished } from '../sync/use-sync';
import { coverageQuery } from './finder-queries';

/** Keeps the "Latest" view current and says when the catalogue last synced. */
export function CatalogStatus() {
  const queryClient = useQueryClient();
  const coverage = useQuery(coverageQuery);
  const [run, setRun] = useState<SyncRun | null>(null);
  const refresh = useMutation({
    mutationFn: async () => {
      const { run: started } = await apiPost('/api/catalog/latest', {}, LatestRefreshSchema);
      return started ? followRun(started, setRun) : null;
    },
    onSuccess: async (finished) => {
      if (!finished) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: coverageQuery.queryKey }),
      ]);
      if (finished.status === 'failed') notifySyncFinished('Catalogue refresh', finished);
    },
  });
  const { mutate } = refresh;

  // Once per visit. The API skips it when the last 30 days were synced under 6 hours ago.
  useEffect(() => {
    mutate();
  }, [mutate]);

  if (refresh.isPending && run) {
    return (
      <Text size="sm" c="dimmed">
        Updating latest events from BCP… <span className="numeric">{run.done}</span> found
      </Text>
    );
  }
  if (refresh.isError) {
    return (
      <Text size="sm" c="red">
        Couldn't refresh from BCP: {refresh.error.message}
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
