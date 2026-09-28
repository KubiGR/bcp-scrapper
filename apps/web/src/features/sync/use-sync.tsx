import type { SyncRequest, SyncRun } from '@bcp/shared';
import { Anchor } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import {
  followRun,
  LostTrackError,
  startAndFollow,
  type FollowOptions,
  type OnProgress,
} from './follow-sync';

export interface UseSyncOptions {
  /** Shown in notifications, e.g. "Army lists". */
  label: string;
  /** Queries to refresh once the run has finished. */
  invalidate: QueryKey[];
  /** Background refreshes: notify only when a run fails, and leave errors to `error`. */
  quiet?: boolean;
}

/** A task that syncs something and resolves with the finished run, or null if nothing ran. */
export type SyncTask = (onProgress: OnProgress, options: FollowOptions) => Promise<SyncRun | null>;

/** The error of a failed run, with a Settings link when the BCP login was refused. */
export function SyncRunError({ run }: { run: SyncRun }) {
  return (
    <>
      {run.error ?? 'Unknown error'}
      {run.errorCode === 'BCP_AUTH' && (
        <>
          {' '}
          <Anchor component={Link} to="/settings" inherit>
            Open Settings
          </Anchor>
        </>
      )}
    </>
  );
}

export function notifySyncFinished(label: string, run: SyncRun): void {
  if (run.status === 'failed') {
    notifications.show({
      color: 'red',
      title: `${label} failed`,
      message: <SyncRunError run={run} />,
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
 * Follows the component's lifetime. StrictMode's simulated unmount is followed synchronously by a
 * remount, so the abort waits a microtask and a remount cancels it: only a real unmount aborts.
 */
function useUnmountSignal(): AbortSignal {
  const [controller] = useState(() => new AbortController());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) controller.abort();
      });
    };
  }, [controller]);
  return controller.signal;
}

/**
 * Starts (or resumes following) a sync and follows it to the end. The polling lives inside the
 * mutation, so there is no effect to keep in step: `run` is the latest progress, `isSyncing` is
 * true until it has finished. One sync at a time: calls while one is running are ignored. Polling
 * stops when the component unmounts.
 */
export function useSync({ label, invalidate, quiet }: UseSyncOptions) {
  const queryClient = useQueryClient();
  const signal = useUnmountSignal();
  const [run, setRun] = useState<SyncRun | null>(null);
  const [waiting, setWaiting] = useState(false);
  const busy = useRef(false);
  const mutation = useMutation({
    mutationFn: (task: SyncTask) =>
      task(
        (progress, isWaiting = false) => {
          setRun(progress);
          setWaiting(isWaiting);
        },
        { signal },
      ),
    onSuccess: async (finished) => {
      if (!finished) return;
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      if (quiet !== true || finished.status === 'failed') notifySyncFinished(label, finished);
    },
    onError: (error) => {
      if (signal.aborted) return;
      // The run may still be going (or be over): refresh what the page shows about it, so
      // nothing stays stuck on "syncing" until some later refetch.
      if (error instanceof LostTrackError) {
        for (const queryKey of invalidate) void queryClient.invalidateQueries({ queryKey });
      }
      if (quiet === true) return;
      if (error instanceof LostTrackError) {
        notifications.show({ color: 'yellow', title: label, message: error.message });
        return;
      }
      notifications.show({ color: 'red', title: `${label} failed`, message: error.message });
    },
    onSettled: () => {
      busy.current = false;
      setWaiting(false);
    },
  });
  const { mutate } = mutation;

  const track = (task: SyncTask) => {
    if (busy.current) return;
    busy.current = true;
    mutate(task);
  };

  return {
    /** Runs any sync task, e.g. several catalogue gaps in turn. */
    track,
    start: (request: SyncRequest) => {
      track((onProgress, options) => startAndFollow(request, onProgress, options));
    },
    /** Resumes following a run that is already active on the server. */
    follow: (active: SyncRun) => {
      track((onProgress, options) => followRun(active, onProgress, options));
    },
    run,
    /** Following another catalogue run before ours can start. */
    waiting,
    isSyncing: mutation.isPending,
    error: mutation.error,
  };
}
