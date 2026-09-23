import { SyncRunSchema, type SyncRequest, type SyncRun } from '@bcp/shared';
import { apiGet, apiPost } from '../../api/client';

/** How often a running sync is polled (spec §7). */
export const SYNC_POLL_MS = 2000;

export const isActiveRun = (run: SyncRun) => run.status === 'queued' || run.status === 'running';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls a run until it has finished, reporting each state; resolves with the finished run. */
export async function followRun(
  run: SyncRun,
  onProgress: (run: SyncRun) => void,
  pollMs = SYNC_POLL_MS,
): Promise<SyncRun> {
  let current = run;
  onProgress(current);
  while (isActiveRun(current)) {
    await wait(pollMs);
    current = await apiGet(`/api/sync-runs/${current.id}`, SyncRunSchema);
    onProgress(current);
  }
  return current;
}

/** Starts a sync (or joins the equivalent active one) and follows it to the end. */
export async function startAndFollow(
  request: SyncRequest,
  onProgress: (run: SyncRun) => void,
  pollMs = SYNC_POLL_MS,
): Promise<SyncRun> {
  return followRun(await apiPost('/api/sync', request, SyncRunSchema), onProgress, pollMs);
}
