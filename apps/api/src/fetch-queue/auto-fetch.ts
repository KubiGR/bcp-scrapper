import { eventFinishedBy, eventPhase, isBigEvent, type EventSizeRule } from '@bcp/shared';
import { and, desc, gte, lte } from 'drizzle-orm';
import { refreshLatest } from '../catalog';
import type { Db } from '../db/client';
import { events } from '../db/schema';
import type { Logger } from '../logger';
import { getAutoFetchEnabled } from '../repo/app-settings';
import {
  AUTO_PRIORITY,
  enqueueEventPairings,
  enqueueLists,
  eventPairingsJobs,
  failedTargets,
  markPairingsSyncedIfComplete,
  roundFetchIsFinal,
} from '../repo/fetch-queue';
import { storedPairingRounds } from '../repo/pairings';
import { findPlayersMissingLists, tidyDetachments } from '../repo/lists';
import type { SyncRunner } from '../sync/runner';

const DAY_MS = 86_400_000;

export interface AutoFetchPlannerOptions {
  db: Db;
  runner: SyncRunner;
  logger: Logger;
  eventRule: EventSizeRule;
  /** Only events that started within this many days are planned. */
  days: number;
  intervalMs: number;
  catalogIntervalMs: number;
  now?: () => Date;
  /** Whether BCP rejects the login (the queue is paused for it): the catalogue refresh waits. */
  loginRejected?: () => Promise<boolean>;
}

/**
 * Keeps big finished events of the last `days` fully loaded: every `intervalMs` it queues, at the
 * lowest priority and marked automatic, whatever an event is missing (the event itself, its
 * pairings, its lists), newest event first. It only queues work; the fetch queue does it at its
 * usual pace. Failed work is left for the user's Retry, and fetched rounds aren't fetched again.
 */
export class AutoFetchPlanner {
  readonly #options: AutoFetchPlannerOptions;
  readonly #now: () => Date;
  #timers: NodeJS.Timeout[] = [];
  #running: Promise<unknown> = Promise.resolve();
  lastPlannedAt: Date | null = null;

  /** Only events that started within this many days are planned. */
  get days(): number {
    return this.#options.days;
  }

  constructor(options: AutoFetchPlannerOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => new Date());
  }

  /** Plans now and refreshes the catalogue, then keeps doing both on their intervals. */
  start(): void {
    this.#schedule(() => this.planOnce());
    this.#schedule(() => this.refreshCatalogue());
    this.#timers = [
      setInterval(() => {
        this.#schedule(() => this.planOnce());
      }, this.#options.intervalMs),
      setInterval(() => {
        this.#schedule(() => this.refreshCatalogue());
      }, this.#options.catalogIntervalMs),
    ];
  }

  /** Plans as soon as the previous piece of work is done, without waiting for it. */
  planSoon(): void {
    this.#schedule(() => this.planOnce());
  }

  /** Resolves once the planner has nothing running. */
  async idle(): Promise<void> {
    await this.#running;
  }

  async stop(): Promise<void> {
    this.#timers.forEach((timer) => {
      clearInterval(timer);
    });
    this.#timers = [];
    await this.#running;
  }

  /** Runs one piece of work after the previous one, logging failures instead of throwing. */
  #schedule(work: () => Promise<unknown>): void {
    this.#running = this.#running.then(work).catch((error: unknown) => {
      this.#options.logger.warn({ err: error }, 'Automatic fetching failed; will try again');
    });
  }

  /** The latest-window catalogue sync (skipped while fresh), so new events appear. */
  async refreshCatalogue(): Promise<void> {
    if (!(await getAutoFetchEnabled(this.#options.db))) return;
    // It would only fail the same way; the next refresh after a fresh login catches up.
    if ((await this.#options.loginRejected?.()) === true) return;
    await refreshLatest({ db: this.#options.db, runner: this.#options.runner }, this.#now());
  }

  /** Queues what the window's events are missing; returns how many events and jobs it queued. */
  async planOnce(): Promise<{ events: number; jobs: number }> {
    const { db, eventRule, days } = this.#options;
    if (!(await getAutoFetchEnabled(db))) return { events: 0, jobs: 0 };
    // Lists fetched since the last pass teach new detachment names: split and respell with them.
    await tidyDetachments(db);
    const now = this.#now();
    const candidates = await db
      .select()
      .from(events)
      .where(
        and(
          gte(events.startDate, new Date(now.getTime() - days * DAY_MS)),
          lte(events.startDate, now),
        ),
      )
      .orderBy(desc(events.startDate), events.id);

    let planned = 0;
    let jobs = 0;
    for (const event of candidates) {
      if (!isBigEvent(event, eventRule) || eventPhase(event, now) !== 'finished') continue;
      // Switched off mid-pass: stop adding work.
      if (!(await getAutoFetchEnabled(db))) break;
      const queued = await this.#planEvent(event);
      if (queued > 0) planned += 1;
      jobs += queued;
    }
    this.lastPlannedAt = now;
    if (jobs > 0)
      this.#options.logger.info({ events: planned, jobs }, 'Automatic fetching queued work');
    return { events: planned, jobs };
  }

  async #planEvent(event: typeof events.$inferSelect): Promise<number> {
    const { db } = this.#options;
    const failed = await failedTargets(db, event.id);
    if (event.lastSyncedAt === null) {
      // Already being loaded (or it failed and waits for Retry): nothing to add.
      if (failed.event || (await eventPairingsJobs(db, event.id)).queued > 0) return 0;
      await enqueueEventPairings(db, event.id, {
        rounds: null,
        priority: AUTO_PRIORITY,
        origin: 'auto',
      });
      return 1;
    }
    let queued = 0;
    if (event.pairingsSyncedAt === null && !failed.pairings) {
      const now = this.#now();
      const stored = await storedPairingRounds(db, event.id);
      // A round fetched while the event ran may have come back empty (not played yet): fetch it
      // again, once, after the event is over by its dates (so it can't repeat every pass).
      const pastCutoff = eventFinishedBy(event) <= now;
      const rounds = Array.from({ length: event.roundCount }, (_, i) => i + 1).filter((round) => {
        if (!failed.doneRounds.has(round)) return true;
        const fetchedAt = failed.doneRounds.get(round) ?? null;
        return pastCutoff && !roundFetchIsFinal(event, fetchedAt, stored.has(round), now);
      });
      const added = (
        await enqueueEventPairings(db, event.id, {
          rounds,
          priority: AUTO_PRIORITY,
          origin: 'auto',
        })
      ).queuedRounds;
      queued += added;
      // Nothing left to fetch: every round is final, so the event's pairings are complete.
      if (rounds.length === 0) await markPairingsSyncedIfComplete(db, event.id, now);
    }
    const missing = (await findPlayersMissingLists(db, event.id)).filter(
      (item) => !failed.players.has(item.playerId),
    );
    queued += await enqueueLists(db, event.id, missing, AUTO_PRIORITY, 'auto');
    return queued;
  }
}
