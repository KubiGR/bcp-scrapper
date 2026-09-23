import type { SyncRequest, SyncRun } from '@bcp/shared';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useState } from 'react';
import { startAndFollow } from './follow-sync';

export interface UseSyncOptions {
  /** Shown in notifications, e.g. "Army lists". */
  label: string;
  /** Queries to refresh once the run has finished. */
  invalidate: QueryKey[];
}

export function notifySyncFinished(label: string, run: SyncRun): void {
  if (run.status === 'failed') {
    notifications.show({
      color: 'red',
      title: `${label} failed`,
      message: run.error ?? 'Unknown error',
    });
    return;
  }
  const unavailable = run.failed > 0 ? ` · ${run.failed} unavailable` : '';
  notifications.show({
    color: 'neon',
    title: `${label} finished`,
    message: `${run.done} done${unavailable}`,
  });
}

/**
 * Starts a sync and follows it to the end. The polling lives inside the mutation, so there is no
 * effect to keep in step: `run` is the latest progress, `isSyncing` is true until it has finished.
 */
export function useSync({ label, invalidate }: UseSyncOptions) {
  const queryClient = useQueryClient();
  const [run, setRun] = useState<SyncRun | null>(null);
  const mutation = useMutation({
    mutationFn: (request: SyncRequest) => startAndFollow(request, setRun),
    onSuccess: async (finished) => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      notifySyncFinished(label, finished);
    },
    onError: (error) => {
      notifications.show({ color: 'red', title: `${label} failed`, message: error.message });
    },
  });
  return { start: mutation.mutate, run, isSyncing: mutation.isPending };
}
