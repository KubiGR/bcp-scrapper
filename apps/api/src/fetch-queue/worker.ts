import type { FetchQueuePauseReason, FetchQueueState } from '@bcp/shared';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { AppError, BcpAuthError, BcpRateLimitedError } from '../errors';
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
  queuedInOrder,
  queueTotals,
  releaseJob,
  requeueInterrupted,
  retryJobLater,
  type ClaimedJob,
} from '../repo/fetch-queue';
import { saveArmyList } from '../repo/lists';
import { syncEvent } from '../sync/jobs';
import { syncRoundPairings } from '../sync/round-pairings';

/** Waits after the 1st and 2nd failed attempt; the 3rd failure is final. */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;
const MAX_ATTEMPTS = 3;

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
}

interface Pause {
  reason: FetchQueuePauseReason;
  until: Date | null;
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
  }

  /** Stops ticking; resolves once a tick in flight has finished (so the database can close). */
  async stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    await this.#inFlight?.catch(() => undefined);
  }

  pause(reason: FetchQueuePauseReason = 'user', until: Date | null = null): void {
    this.#pause = { reason, until };
  }

  resume(): void {
    this.#pause = null;
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
        enabled: await getAutoFetchEnabled(this.#options.db),
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
    const last =
      eventId === undefined
        ? order.length
        : order.findLastIndex((row) => row.eventId === eventId) + 1;
    if (last === 0) return null;
    return Math.ceil((last * this.intervalMs) / 1000);
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
          kind: claimed.kind,
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
      switch (claimed.kind) {
        case 'list':
          return log(await this.#fetchList(claimed));
        case 'event':
          return log(await this.#fetchEvent(claimed));
        case 'pairings-round':
          return log(await this.#fetchRound(claimed));
      }
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
      if (claimed.attempts < MAX_ATTEMPTS) {
        const wait =
          BACKOFF_MS[claimed.attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 60_000;
        await retryJobLater(
          db,
          claimed.id,
          new Date(this.#now().getTime() + wait),
          messageOf(error),
        );
        return log('retry');
      }
      const code = error instanceof AppError ? error.code : 'INTERNAL';
      await markJobFailed(db, claimed.id, messageOf(error), code);
      return log('failed');
    }
  }

  async #fetchList(job: ClaimedJob): Promise<TickOutcome> {
    const { db, source } = this.#options;
    if (job.playerId === null || job.listId === null) {
      await markJobFailed(db, job.id, 'List job without player or list', 'INTERNAL');
      return 'failed';
    }
    const list = await source.getList(job.listId);
    if (list === null) {
      await markJobFailed(db, job.id, 'No list on BCP', NO_LIST_CODE);
      return 'failed';
    }
    await saveArmyList(db, job.playerId, list);
    await markJobDone(db, job.id);
    return 'fetched';
  }

  /** Event detail, teams and players; with a pairings follow-up, then queues every round. */
  async #fetchEvent(job: ClaimedJob): Promise<TickOutcome> {
    const { db, source } = this.#options;
    const event = await syncEvent({ db, source }, job.eventId);
    if (job.followUp === 'pairings') {
      // Before markJobDone, so a failure here retries this job rather than a done row. Queueing
      // again is a no-op for rounds already open.
      const rounds = Array.from({ length: event.roundCount }, (_, index) => index + 1);
      await enqueueEventPairings(db, job.eventId, { rounds, priority: job.priority });
    }
    await markJobDone(db, job.id);
    return 'fetched';
  }

  /** One round's team matchups and games; marks the event's pairings synced after the last. */
  async #fetchRound(job: ClaimedJob): Promise<TickOutcome> {
    const { db, source, logger } = this.#options;
    const event = await findEvent(db, job.eventId);
    if (!event || job.round === null) {
      await markJobFailed(db, job.id, 'Round job for an unknown event or round', 'NOT_FOUND');
      return 'failed';
    }
    await syncRoundPairings(
      { db, source, logger },
      { id: event.id, isTeamEvent: event.isTeamEvent },
      job.round,
    );
    await markJobDone(db, job.id);
    try {
      await markPairingsSyncedIfComplete(db, event.id, event.roundCount);
    } catch (error) {
      // The round is stored; the next round job (or a refresh) sets the synced time.
      logger.warn({ err: error, eventId: event.id }, 'Could not mark the event’s pairings synced');
    }
    return 'fetched';
  }
}
