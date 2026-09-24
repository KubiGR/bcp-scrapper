import type { ListQueuePauseReason, ListQueueState } from '@bcp/shared';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { AppError, BcpAuthError, BcpRateLimitedError } from '../errors';
import type { Logger } from '../logger';
import {
  claimNextList,
  markListDone,
  markListFailed,
  NO_LIST_CODE,
  queuedInOrder,
  queueTotals,
  releaseList,
  requeueInterrupted,
  retryListLater,
} from '../repo/list-queue';
import { saveArmyList } from '../repo/lists';

/** Waits after the 1st and 2nd failed attempt; the 3rd failure is final. */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;
const MAX_ATTEMPTS = 3;

export type TickOutcome = 'idle' | 'busy' | 'paused' | 'fetched' | 'failed' | 'retry';

export interface ListQueueWorkerOptions {
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
  reason: ListQueuePauseReason;
  until: Date | null;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Drains the list queue gently: every `intervalMs` it claims at most one list, fetches it through
 * the rate-limited BCP client and stores it. It pauses itself when BCP rejects the login (until
 * resumed) or rate-limits us (until the limit has passed).
 */
export class ListQueueWorker {
  readonly intervalMs: number;
  readonly #options: ListQueueWorkerOptions;
  readonly #now: () => Date;
  #timer: ReturnType<typeof setInterval> | null = null;
  #ticking = false;
  #pause: Pause | null = null;

  constructor(options: ListQueueWorkerOptions) {
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
    if (requeued > 0) this.#options.logger.warn({ requeued }, 'Requeued interrupted list fetches');
    this.#timer = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        // A rejection here would otherwise be unhandled and crash the process (Node >= 15).
        this.#options.logger.error({ err: error }, 'List queue tick failed');
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  pause(reason: ListQueuePauseReason = 'user', until: Date | null = null): void {
    this.#pause = { reason, until };
  }

  resume(): void {
    this.#pause = null;
  }

  /** Claims and fetches at most one list. */
  async tick(): Promise<TickOutcome> {
    if (this.#ticking) return 'busy';
    if (this.#isPaused()) return 'paused';
    this.#ticking = true;
    try {
      return await this.#fetchNext();
    } finally {
      this.#ticking = false;
    }
  }

  async state(): Promise<ListQueueState> {
    const paused = this.#isPaused();
    return {
      paused,
      pausedReason: paused ? (this.#pause?.reason ?? null) : null,
      pausedUntil: paused ? (this.#pause?.until?.toISOString() ?? null) : null,
      intervalMs: this.intervalMs,
      totals: await queueTotals(this.#options.db),
      estimatedSeconds: await this.estimateSecondsFor(),
    };
  }

  /**
   * Seconds until the queue (or, given an event, that event's queued lists) is done at the
   * current pace; null when there is nothing queued.
   */
  async estimateSecondsFor(eventId?: string): Promise<number | null> {
    const order = await queuedInOrder(this.#options.db);
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
    const { db, source, logger } = this.#options;
    const claimed = await claimNextList(db, this.#now());
    if (!claimed) return 'idle';

    const startedAt = performance.now();
    const log = (
      status: TickOutcome,
      level: 'info' | 'warn' = 'info',
      extra: Record<string, unknown> = {},
    ) => {
      logger[level](
        {
          eventId: claimed.eventId,
          playerId: claimed.playerId,
          status,
          durationMs: Math.round(performance.now() - startedAt),
          ...extra,
        },
        'List queue fetch',
      );
      return status;
    };

    try {
      const list = await source.getList(claimed.listId);
      if (list === null) {
        await markListFailed(db, claimed.id, 'No list on BCP', NO_LIST_CODE);
        return log('failed');
      }
      await saveArmyList(db, claimed.playerId, list);
      await markListDone(db, claimed.id);
      return log('fetched');
    } catch (error) {
      if (error instanceof BcpAuthError && (await this.#isLoginRejected())) {
        await releaseList(db, claimed.id);
        this.pause('login-rejected');
        return log('paused', 'warn', { reason: 'login-rejected' });
      }
      if (error instanceof BcpRateLimitedError) {
        await releaseList(db, claimed.id);
        const until = new Date(this.#now().getTime() + error.retryAfterSeconds * 1000);
        this.pause('rate-limited', until);
        return log('paused', 'warn', { reason: 'rate-limited', until: until.toISOString() });
      }
      if (claimed.attempts < MAX_ATTEMPTS) {
        const wait =
          BACKOFF_MS[claimed.attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 60_000;
        await retryListLater(
          db,
          claimed.id,
          new Date(this.#now().getTime() + wait),
          messageOf(error),
        );
        return log('retry');
      }
      const code = error instanceof AppError ? error.code : 'INTERNAL';
      await markListFailed(db, claimed.id, messageOf(error), code);
      return log('failed');
    }
  }
}
