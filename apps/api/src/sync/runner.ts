import type { SyncRequest, SyncRun } from '@bcp/shared';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { AppError } from '../errors';
import type { Logger } from '../logger';
import {
  createSyncRun,
  eventIdOf,
  findActiveSyncRun,
  finishSyncRun,
  incrementSyncRun,
  markSyncRunRunning,
  setSyncRunTotal,
} from '../repo/sync-runs';
import { runJob, type Progress } from './jobs';

export interface SyncRunnerDeps {
  db: Db;
  source: TournamentSource;
  logger: Logger;
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));
const codeOf = (error: unknown) => (error instanceof AppError ? error.code : 'INTERNAL');

/** Runs sync jobs in the background of this process and records their progress in sync_runs. */
export class SyncRunner {
  readonly #deps: SyncRunnerDeps;
  readonly #inFlight = new Set<Promise<void>>();

  constructor(deps: SyncRunnerDeps) {
    this.#deps = deps;
  }

  /** Starts a sync in the background, or returns the equivalent run that is already active. */
  async start(request: SyncRequest): Promise<SyncRun> {
    const { db } = this.#deps;
    const created = await createSyncRun(db, request);
    if (!created) {
      const active = await findActiveSyncRun(db, request.kind, eventIdOf(request));
      // The active run finished between our insert and select: try again.
      return active ?? this.start(request);
    }

    const job = this.#execute(created.id, request);
    this.#inFlight.add(job);
    void job.finally(() => this.#inFlight.delete(job));
    return created;
  }

  /** Resolves once every background job has settled. */
  async idle(): Promise<void> {
    while (this.#inFlight.size > 0) await Promise.allSettled([...this.#inFlight]);
  }

  async #execute(runId: number, request: SyncRequest): Promise<void> {
    const { db, source } = this.#deps;
    const logger = this.#deps.logger.child({ syncRunId: runId, kind: request.kind });
    const progress: Progress = {
      setTotal: (total) => setSyncRunTotal(db, runId, total),
      succeeded: (count = 1) => incrementSyncRun(db, runId, 'done', count),
      failed: (count = 1) => incrementSyncRun(db, runId, 'failed', count),
    };

    try {
      await markSyncRunRunning(db, runId);
      await runJob({ db, source, progress, logger }, request);
      await finishSyncRun(db, runId, { status: 'succeeded' });
      logger.info('Sync finished');
    } catch (error) {
      logger.error({ err: error }, 'Sync failed');
      await finishSyncRun(db, runId, {
        status: 'failed',
        error: describeError(error),
        code: codeOf(error),
      }).catch((finishError: unknown) => {
        logger.error({ err: finishError }, 'Could not record sync failure');
      });
    }
  }
}
