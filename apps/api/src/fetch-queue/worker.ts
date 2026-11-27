import { randomUUID } from 'node:crypto';
import type { FetchQueuePauseReason, FetchQueueState } from '@bcp/shared';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { AppError, BcpAuthError, BcpRateLimitedError, EventBlockedError } from '../errors';
import type { Logger } from '../logger';
import { getAutoFetchEnabled } from '../repo/app-settings';
import { findEvent } from '../repo/events';
import {
  autoJobSummary,
  claimNextJob,
  enqueueEventPairings,
  markJobDone,
  markJobFailed,
  markPairingsSyncedIfComplete,
  NO_LIST_CODE,
  queueBacklog,
  queuedInOrder,
  queueTotals,
  releaseJob,
  requeueInterrupted,
  retryJobLater,
  retryFailedJobs,
  type ClaimedJob,
  jobPriorityAndOrigin,
} from '../repo/fetch-queue';
import { saveArmyList } from '../repo/lists';
import { syncEvent } from '../sync/jobs';
import { syncRoundPairings } from '../sync/round-pairings';

/** Waits after the 1st and 2nd failed attempt; the 3rd failure is final. */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;
const MAX_ATTEMPTS = 3;
const HEALTH_INTERVAL_MS = 60_000;

export type TickOutcome = 'idle' | 'busy' | 'paused' | 'fetched' | 'failed' | 'retry';

export interface FetchQueueWorkerOptions {
  db: Db;
  source: TournamentSource;
  logger: Logger;
  intervalMs: number;
  now?: () => Date;
  /**
   * Whether BCP rejects the login itself, asked once after a list fetch fails with an auth error.
   * True (or no check given): the whole queue pauses until resumed. False: BCP refused just this
   * list, so the row is backed off like any other failure instead of wedging the queue.
   */
  loginRejected?: () => Promise<boolean>;
  /** False when the server runs without automatic fetching (AUTO_FETCH_ENABLED=false). */
  autoFetchAvailable?: boolean;
}

interface Pause {
  reason: FetchQueuePauseReason;
  until: Date | null;
}

interface JobFailure {
  code: string;
  message: string;
}

/** Keep external payloads and unexpected exception text out of the observability index. */
function failureSummary(code: string): string {
  switch (code) {
    case 'BCP_AUTH':
      return 'BCP refused access to the requested data';
    case 'BCP_UNAVAILABLE':
      return 'BCP could not be reached or returned an error';
    case 'BCP_SCHEMA_MISMATCH':
      return 'BCP returned data in an unexpected format';
    case 'NOT_FOUND':
      return 'The requested data was missing';
    case 'EVENT_BLOCKED':
      return 'The event is blocked in Logis';
    default:
      return 'The fetch job encountered an error';
  }
}

const eventOrder = () => Math.floor((performance.timeOrigin + performance.now()) * 1000);

function eventMetadata(order: number) {
  return { logEventId: randomUUID(), occurredAt: Math.floor(order / 1000), order };
}

function queueEvent(job: Pick<ClaimedJob, 'id' | 'kind'>, order: number) {
  return { ...eventMetadata(order), jobId: job.id, kind: job.kind };
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Drains the fetch queue gently: every `intervalMs` it claims at most one job, fetches it through
 * the rate-limited BCP client and stores it. It pauses itself when BCP rejects the login (until
 * resumed) or rate-limits us (until the limit has passed).
 */
export class FetchQueueWorker {
  readonly intervalMs: number;
  readonly #options: FetchQueueWorkerOptions;
  readonly #now: () => Date;
  #timer: ReturnType<typeof setInterval> | null = null;
  /** The tick in flight, if any; stop() waits for it. */
  #inFlight: Promise<TickOutcome> | null = null;
  #healthTimer: ReturnType<typeof setInterval> | null = null;
  #healthInFlight: Promise<void> | null = null;
  #pause: Pause | null = null;

  constructor(options: FetchQueueWorkerOptions) {
    this.#options = options;
    this.intervalMs = options.intervalMs;
    // A few ms ahead of the real clock: Postgres' `now()` (used for `not_before`'s default) has
    // microsecond precision, while `Date.now()` truncates to whole milliseconds. Without this,
    // a row inserted and then claimed within the same millisecond can look "not due yet" and the
    // worker (or a test's drainQueue) sees a false 'idle'. Callers that inject their own `now`
    // (tests driving an explicit clock) are unaffected.
    this.#now = options.now ?? (() => new Date(Date.now() + 5));
  }

  /** Puts rows cut off by a previous process back in the queue, then ticks every interval. */
  async start(): Promise<void> {
    const requeued = await requeueInterrupted(this.#options.db);
    if (requeued > 0)
      this.#options.logger.warn({ requeued }, 'Requeued interrupted fetch-queue jobs');
    this.#timer = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        // A rejection here would otherwise be unhandled and crash the process (Node >= 15).
        this.#options.logger.error({ err: error }, 'Fetch queue tick failed');
      });
    }, this.intervalMs);
    this.#recordHealth();
    this.#healthTimer = setInterval(() => {
      this.#recordHealth();
    }, HEALTH_INTERVAL_MS);
  }

  /** Stops ticking; resolves once a tick in flight has finished (so the database can close). */
  async stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    if (this.#healthTimer) clearInterval(this.#healthTimer);
    this.#healthTimer = null;
    await Promise.all([this.#inFlight?.catch(() => undefined), this.#healthInFlight]);
  }

  pause(reason: FetchQueuePauseReason = 'user', until: Date | null = null): void {
    this.#pause = { reason, until };
  }

  resume(): void {
    this.#pause = null;
  }

  async retryFailed(eventId?: string, only?: 'pairings', code?: string): Promise<number> {
    // Order the requeue before any outcome from a worker that claims the newly available job.
    const order = eventOrder();
    const rows = await retryFailedJobs(this.#options.db, eventId, only, code);
    for (const job of rows) {
      this.#options.logger.info(
        { ...queueEvent(job, order), attempt: 0, status: 'requeued' },
        'Fetch queue job',
      );
    }
    return rows.length;
  }

  /** Claims and runs at most one job. */
  async tick(): Promise<TickOutcome> {
    if (this.#inFlight) return 'busy';
    if (this.#isPaused()) return 'paused';
    const current = this.#fetchNext();
    this.#inFlight = current;
    try {
      return await current;
    } finally {
      this.#inFlight = null;
    }
  }

  async state(): Promise<FetchQueueState> {
    const paused = this.#isPaused();
    return {
      paused,
      pausedReason: paused ? (this.#pause?.reason ?? null) : null,
      pausedUntil: paused ? (this.#pause?.until?.toISOString() ?? null) : null,
      intervalMs: this.intervalMs,
      totals: await queueTotals(this.#options.db),
      estimatedSeconds: await this.estimateSecondsFor(),
      auto: {
        enabled:
          (this.#options.autoFetchAvailable ?? true) &&
          (await getAutoFetchEnabled(this.#options.db)),
        ...(await autoJobSummary(this.#options.db)),
      },
    };
  }

  /**
   * Seconds until the queue (or, given an event, that event's queued jobs) is done at the
   * current pace; null when there is nothing queued.
   */
  async estimateSecondsFor(eventId?: string): Promise<number | null> {
    // The whole-queue estimate is the user's own work; automatic jobs come after it anyway.
    const order = await queuedInOrder(this.#options.db, { userOnly: eventId === undefined });
    if (eventId === undefined) {
      return order.length === 0 ? null : Math.ceil((order.length * this.intervalMs) / 1000);
    }
    const last = order.findLastIndex((row) => row.eventId === eventId) + 1;
    if (last === 0) return null;
    // An event load with pairings to follow queues the event's rounds once it's done: count them.
    const loading = order.some(
      (row) => row.eventId === eventId && row.kind === 'event' && row.followUp === 'pairings',
    );
    const rounds = loading ? ((await findEvent(this.#options.db, eventId))?.roundCount ?? 0) : 0;
    return Math.ceil(((last + rounds) * this.intervalMs) / 1000);
  }

  #recordHealth(): void {
    if (this.#healthInFlight) return;
    this.#healthInFlight = queueBacklog(this.#options.db)
      .then(({ waiting, oldestQueuedAt }) => {
        const pause = this.#isPaused() ? this.#pause : null;
        this.#options.logger.info(
          {
            ...eventMetadata(eventOrder()),
            waiting,
            oldestWaitSeconds:
              oldestQueuedAt === null
                ? null
                : Math.max(
                    0,
                    Math.floor((this.#now().getTime() - oldestQueuedAt.getTime()) / 1000),
                  ),
            workerState: pause ? 'paused' : 'running',
            reason: pause?.reason,
            until: pause?.until?.toISOString(),
          },
          'Fetch queue health',
        );
      })
      .catch((error: unknown) => {
        this.#options.logger.warn({ err: error }, 'Could not sample fetch queue health');
      })
      .finally(() => {
        this.#healthInFlight = null;
      });
  }

  #isPaused(): boolean {
    if (!this.#pause) return false;
    const { until } = this.#pause;
    if (until !== null && until <= this.#now()) {
      this.#pause = null;
      return false;
    }
    return true;
  }

  /** Asks the login check; when it can't tell (no check, or it fails), assumes the worst. */
  async #isLoginRejected(): Promise<boolean> {
    const { loginRejected, logger } = this.#options;
    if (!loginRejected) return true;
    try {
      return await loginRejected();
    } catch (error) {
      logger.warn({ err: error }, 'Could not check the BCP login after an auth error');
      return true;
    }
  }

  async #fetchNext(): Promise<TickOutcome> {
    const { db, logger } = this.#options;
    const claimed = await claimNextJob(db, this.#now());
    if (!claimed) return 'idle';

    const startedAt = performance.now();
    const log = (
      status: TickOutcome,
      level: 'info' | 'warn' = 'info',
      extra: Record<string, unknown> = {},
    ) => {
      logger[level](
        {
          ...queueEvent(claimed, eventOrder()),
          attempt: claimed.attempts,
          eventId: claimed.eventId,
          ...(claimed.playerId === null ? {} : { playerId: claimed.playerId }),
          ...(claimed.round === null ? {} : { round: claimed.round }),
          status,
          durationMs: Math.round(performance.now() - startedAt),
          ...extra,
        },
        'Fetch queue job',
      );
      return status;
    };

    try {
      const failure = await this.#runJob(claimed);
      if (!failure) return log('fetched');
      await markJobFailed(db, claimed.id, failure.message, failure.code);
      return log('failed', 'info', { errorCode: failure.code, errorMessage: failure.message });
    } catch (error) {
      if (error instanceof BcpAuthError && (await this.#isLoginRejected())) {
        await releaseJob(db, claimed.id);
        this.pause('login-rejected');
        return log('paused', 'warn', { reason: 'login-rejected' });
      }
      if (error instanceof BcpRateLimitedError) {
        await releaseJob(db, claimed.id);
        const until = new Date(this.#now().getTime() + error.retryAfterSeconds * 1000);
        this.pause('rate-limited', until);
        return log('paused', 'warn', { reason: 'rate-limited', until: until.toISOString() });
      }
      const code = error instanceof AppError ? error.code : 'INTERNAL';
      const details = { errorCode: code, errorMessage: failureSummary(code) };
      // Blocked after it was claimed: trying again won't help, and its failures don't count.
      if (claimed.attempts < MAX_ATTEMPTS && !(error instanceof EventBlockedError)) {
        const wait =
          BACKOFF_MS[claimed.attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 60_000;
        await retryJobLater(
          db,
          claimed.id,
          new Date(this.#now().getTime() + wait),
          messageOf(error),
        );
        return log('retry', 'info', details);
      }
      await markJobFailed(db, claimed.id, messageOf(error), code);
      return log('failed', 'info', details);
    }
  }

  #runJob(job: ClaimedJob): Promise<JobFailure | undefined> {
    switch (job.kind) {
      case 'list':
        return this.#fetchList(job);
      case 'event':
        return this.#fetchEvent(job);
      case 'pairings-round':
        return this.#fetchRound(job);
    }
  }

  async #fetchList(job: ClaimedJob): Promise<JobFailure | undefined> {
    const { db, source } = this.#options;
    if (job.playerId === null || job.listId === null) {
      return { code: 'INTERNAL', message: 'List job without player or list' };
    }
    const list = await source.getList(job.listId);
    if (list === null) {
      return { code: NO_LIST_CODE, message: 'No list on BCP' };
    }
    await saveArmyList(db, job.playerId, list, job.listId);
    await markJobDone(db, job.id);
  }

  /** Event detail, teams and players; with a pairings follow-up, then queues every round. */
  async #fetchEvent(job: ClaimedJob): Promise<undefined> {
    const { db, source } = this.#options;
    const event = await syncEvent({ db, source }, job.eventId);
    if (job.followUp === 'pairings' && event.removedFromBcpAt === null) {
      // Before markJobDone, so a failure here retries this job rather than a done row. Queueing
      // again is a no-op for rounds already open.
      const rounds = Array.from({ length: event.roundCount }, (_, index) => index + 1);
      // The rounds inherit the load's priority and origin as they are now, not as claimed.
      const { priority, origin } = (await jobPriorityAndOrigin(db, job.id)) ?? job;
      await enqueueEventPairings(db, job.eventId, { rounds, priority, origin });
    }
    await markJobDone(db, job.id);
    return undefined;
  }

  /** One round's team matchups and games; marks the event's pairings synced after the last. */
  async #fetchRound(job: ClaimedJob): Promise<JobFailure | undefined> {
    const { db, source, logger } = this.#options;
    const event = await findEvent(db, job.eventId);
    if (!event || job.round === null) {
      return { code: 'NOT_FOUND', message: 'Round job for an unknown event or round' };
    }
    await syncRoundPairings(
      { db, source, logger },
      { id: event.id, isTeamEvent: event.isTeamEvent },
      job.round,
    );
    await markJobDone(db, job.id);
    try {
      await markPairingsSyncedIfComplete(db, event.id);
    } catch (error) {
      // The round is stored; the next round job (or a refresh) sets the synced time.
      logger.warn({ err: error, eventId: event.id }, 'Could not mark the event’s pairings synced');
    }
  }
}
