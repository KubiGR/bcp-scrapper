import { SyncRunSchema, type DateRange, type SyncRequest, type SyncRun } from '@bcp/shared';
import { apiGet, apiPost } from '../../api/client';

/** How often a running sync is polled (spec §7). */
export const SYNC_POLL_MS = 2000;
/** A failed poll is retried this many times, with doubling waits, before giving up. */
export const POLL_RETRIES = 3;

export const isActiveRun = (run: SyncRun) => run.status === 'queued' || run.status === 'running';

/** Polling gave up: the run itself may well still be going on the server. */
export class LostTrackError extends Error {
  constructor(cause: unknown) {
    super('Lost track of the sync; it may still be running on the server', { cause });
    this.name = 'LostTrackError';
  }
}

export interface FollowOptions {
  pollMs?: number;
  /** Stops following (the run itself carries on on the server). */
  signal?: AbortSignal;
}

/** `waiting`: following another catalogue run before ours can start. */
export type OnProgress = (run: SyncRun, waiting?: boolean) => void;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason as Error);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function poll(id: number, { pollMs = SYNC_POLL_MS, signal }: FollowOptions) {
  for (let retry = 0; ; retry += 1) {
    try {
      const run = await apiGet(`/api/sync-runs/${id}`, SyncRunSchema);
      signal?.throwIfAborted();
      return run;
    } catch (error) {
      signal?.throwIfAborted();
      if (retry >= POLL_RETRIES) throw new LostTrackError(error);
      await wait(pollMs * 2 ** retry, signal);
    }
  }
}

/** Polls a run until it has finished, reporting each state; resolves with the finished run. */
export async function followRun(
  run: SyncRun,
  onProgress: (run: SyncRun) => void,
  options: FollowOptions = {},
): Promise<SyncRun> {
  let current = run;
  onProgress(current);
  while (isActiveRun(current)) {
    await wait(options.pollMs ?? SYNC_POLL_MS, options.signal);
    current = await poll(current.id, options);
    onProgress(current);
  }
  return current;
}

/** Starts a sync (or joins the equivalent active one) and follows it to the end. */
export async function startAndFollow(
  request: SyncRequest,
  onProgress: (run: SyncRun) => void,
  options: FollowOptions = {},
): Promise<SyncRun> {
  return followRun(await apiPost('/api/sync', request, SyncRunSchema), onProgress, options);
}

export const sameRange = (a: DateRange | null, b: DateRange) => a?.from === b.from && a.to === b.to;

/**
 * Fetches each catalogue gap in turn. Only one catalogue run can be active at a time, so the API
 * may answer with another run (a different range): that one is followed to the end, then the gap
 * is requested again. Stops at the first gap whose run fails. Resolves with the last finished run,
 * `done`/`failed` summed over every gap.
 */
export async function fetchCatalogGaps(
  gaps: DateRange[],
  onProgress: OnProgress,
  options: FollowOptions = {},
): Promise<SyncRun> {
  let done = 0;
  let failed = 0;
  let last: SyncRun | null = null;
  for (const gap of gaps) {
    for (;;) {
      const run = await apiPost('/api/sync', { kind: 'catalog', ...gap }, SyncRunSchema);
      options.signal?.throwIfAborted();
      const ours = sameRange(run.range, gap);
      const finished = await followRun(
        run,
        (progress) => {
          onProgress(ours ? { ...progress, done: done + progress.done } : progress, !ours);
        },
        options,
      );
      if (!ours) continue;
      if (finished.status === 'failed') return finished;
      done += finished.done;
      failed += finished.failed;
      last = finished;
      break;
    }
  }
  if (!last) throw new Error('There were no date ranges to fetch');
  return { ...last, done, failed };
}
