import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { events, fetchQueue } from '../db/schema';

export type FetchJobKind = (typeof fetchQueue.$inferSelect)['kind'];

/** Priority of work someone is waiting for (a single list, an event page's pairings); normal is 0. */
export const USER_WAITING_PRIORITY = 10;
/** Priority of a single list someone is waiting for. */
export const SINGLE_LIST_PRIORITY = USER_WAITING_PRIORITY;
/** `error_code` of a list BCP says doesn't exist; never retried. */
export const NO_LIST_CODE = 'NO_LIST';

export type FetchQueueStatus = (typeof fetchQueue.$inferSelect)['status'];

export interface ClaimedJob {
  id: number;
  kind: FetchJobKind;
  eventId: string;
  playerId: string | null;
  listId: string | null;
  round: number | null;
  followUp: string | null;
  priority: number;
  attempts: number;
}

const OPEN = ['queued', 'fetching'] as const;
const PAIRINGS_KINDS = ['event', 'pairings-round'] as const;
const ALL_KINDS: readonly FetchJobKind[] = ['list', 'event', 'pairings-round'];

/**
 * Queues lists; a player with an open request is skipped. At the single-list priority, open
 * requests of those players are raised too, so a list someone is waiting for jumps the queue.
 * Returns how many rows were newly queued.
 */
export async function enqueueLists(
  db: Db,
  eventId: string,
  items: { playerId: string; listId: string }[],
  priority: number,
): Promise<number> {
  if (items.length === 0) return 0;
  const inserted = await db
    .insert(fetchQueue)
    .values(items.map((item) => ({ kind: 'list' as const, eventId, ...item, priority })))
    .onConflictDoNothing()
    .returning({ id: fetchQueue.id });
  if (priority === SINGLE_LIST_PRIORITY) {
    await db
      .update(fetchQueue)
      .set({ priority })
      .where(
        and(
          eq(fetchQueue.kind, 'list'),
          inArray(
            fetchQueue.playerId,
            items.map((item) => item.playerId),
          ),
          eq(fetchQueue.status, 'queued'),
        ),
      );
  }
  return inserted.length;
}

/**
 * Queues an event's pairings. With rounds, one pairings-round job per round (rounds with an open
 * job are skipped). With `rounds: null` (the event was never synced, so its round count is
 * unknown) one event job whose follow-up queues the rounds when it is done. At the user-waiting
 * priority, the event's queued pairings jobs are raised too, so an event page jumps the queue.
 */
export async function enqueueEventPairings(
  db: Db,
  eventId: string,
  { rounds, priority }: { rounds: number[] | null; priority: number },
): Promise<{ eventQueued: boolean; queuedRounds: number }> {
  let result: { eventQueued: boolean; queuedRounds: number };
  if (rounds === null) {
    await db
      .insert(fetchQueue)
      .values({ kind: 'event', eventId, priority, followUp: 'pairings' })
      .onConflictDoNothing();
    // Queued before without the follow-up (or both callers raced): make sure pairings follow.
    await db
      .update(fetchQueue)
      .set({ followUp: 'pairings' })
      .where(
        and(
          eq(fetchQueue.eventId, eventId),
          eq(fetchQueue.kind, 'event'),
          inArray(fetchQueue.status, [...OPEN]),
        ),
      );
    result = { eventQueued: true, queuedRounds: 0 };
  } else {
    const inserted =
      rounds.length === 0
        ? []
        : await db
            .insert(fetchQueue)
            .values(
              rounds.map((round) => ({
                kind: 'pairings-round' as const,
                eventId,
                round,
                priority,
              })),
            )
            .onConflictDoNothing()
            .returning({ id: fetchQueue.id });
    result = { eventQueued: false, queuedRounds: inserted.length };
  }
  if (priority >= USER_WAITING_PRIORITY) {
    await db
      .update(fetchQueue)
      .set({ priority })
      .where(
        and(
          eq(fetchQueue.eventId, eventId),
          inArray(fetchQueue.kind, [...PAIRINGS_KINDS]),
          eq(fetchQueue.status, 'queued'),
          lt(fetchQueue.priority, priority),
        ),
      );
  }
  return result;
}

/** Atomically takes the next due row (highest priority, then oldest) and marks it fetching. */
export async function claimNextJob(db: Db, now: Date): Promise<ClaimedJob | null> {
  const next = sql`(
    select ${fetchQueue.id} from ${fetchQueue}
    where ${fetchQueue.status} = 'queued' and ${fetchQueue.notBefore} <= ${now.toISOString()}::timestamptz
    order by ${fetchQueue.priority} desc, ${fetchQueue.queuedAt}, ${fetchQueue.id}
    limit 1
    for update skip locked
  )`;
  const [row] = await db
    .update(fetchQueue)
    .set({ status: 'fetching', attempts: sql`${fetchQueue.attempts} + 1` })
    .where(eq(fetchQueue.id, next))
    .returning({
      id: fetchQueue.id,
      kind: fetchQueue.kind,
      eventId: fetchQueue.eventId,
      playerId: fetchQueue.playerId,
      listId: fetchQueue.listId,
      round: fetchQueue.round,
      followUp: fetchQueue.followUp,
      priority: fetchQueue.priority,
      attempts: fetchQueue.attempts,
    });
  return row ?? null;
}

export async function markJobDone(db: Db, id: number): Promise<void> {
  await db
    .update(fetchQueue)
    .set({ status: 'done', error: null, errorCode: null, finishedAt: new Date() })
    .where(eq(fetchQueue.id, id));
}

export async function markJobFailed(
  db: Db,
  id: number,
  error: string,
  code: string,
): Promise<void> {
  await db
    .update(fetchQueue)
    .set({ status: 'failed', error, errorCode: code, finishedAt: new Date() })
    .where(eq(fetchQueue.id, id));
}

/** Back to the queue after a transient failure, not before `notBefore`. */
export async function retryJobLater(
  db: Db,
  id: number,
  notBefore: Date,
  error: string,
): Promise<void> {
  await db
    .update(fetchQueue)
    .set({ status: 'queued', notBefore, error })
    .where(eq(fetchQueue.id, id));
}

/** Back to the queue without counting the attempt (the worker paused; the list wasn't at fault). */
export async function releaseJob(db: Db, id: number): Promise<void> {
  await db
    .update(fetchQueue)
    .set({ status: 'queued', attempts: sql`greatest(${fetchQueue.attempts} - 1, 0)` })
    .where(eq(fetchQueue.id, id));
}

/** Rows left fetching by a process that stopped go back to the queue. */
export async function requeueInterrupted(db: Db): Promise<number> {
  const rows = await db
    .update(fetchQueue)
    .set({ status: 'queued' })
    .where(eq(fetchQueue.status, 'fetching'))
    .returning({ id: fetchQueue.id });
  return rows.length;
}

/** Removes an event's queued list jobs; its pairings jobs stay. */
export async function cancelQueuedLists(db: Db, eventId: string): Promise<number> {
  const rows = await db
    .delete(fetchQueue)
    .where(
      and(
        eq(fetchQueue.eventId, eventId),
        eq(fetchQueue.kind, 'list'),
        eq(fetchQueue.status, 'queued'),
      ),
    )
    .returning({ id: fetchQueue.id });
  return rows.length;
}

/**
 * Failed rows (except "no list on BCP") go back to the queue with a fresh attempt count. Only a
 * target's newest row is retried: a failure superseded by a newer request (open or done) stays
 * as history, so retrying never collides with an open row or refetches an older list.
 */
export async function retryFailedJobs(db: Db, eventId?: string): Promise<number> {
  const newer = alias(fetchQueue, 'newer');
  const rows = await db
    .update(fetchQueue)
    .set({ status: 'queued', attempts: 0, notBefore: new Date(), error: null, errorCode: null })
    .where(
      and(
        eq(fetchQueue.status, 'failed'),
        or(isNull(fetchQueue.errorCode), ne(fetchQueue.errorCode, NO_LIST_CODE)),
        eventId === undefined ? undefined : eq(fetchQueue.eventId, eventId),
        notExists(
          db
            .select({ id: newer.id })
            .from(newer)
            .where(
              and(
                eq(newer.kind, fetchQueue.kind),
                eq(newer.eventId, fetchQueue.eventId),
                sql`${newer.playerId} is not distinct from ${fetchQueue.playerId}`,
                sql`${newer.round} is not distinct from ${fetchQueue.round}`,
                gt(newer.id, fetchQueue.id),
              ),
            ),
        ),
      ),
    )
    .returning({ id: fetchQueue.id });
  return rows.length;
}

/**
 * The newest job per target `(kind, event, player, round)`; nulls compare equal in DISTINCT ON.
 * A target's queue state is its newest job; older failures that were retried or superseded
 * don't count.
 */
function newestJobPerTarget(db: Db, where?: SQL) {
  return db
    .selectDistinctOn(
      [fetchQueue.kind, fetchQueue.eventId, fetchQueue.playerId, fetchQueue.round],
      {
        kind: fetchQueue.kind,
        eventId: fetchQueue.eventId,
        playerId: fetchQueue.playerId,
        round: fetchQueue.round,
        status: fetchQueue.status,
        error: fetchQueue.error,
        errorCode: fetchQueue.errorCode,
      },
    )
    .from(fetchQueue)
    .where(where)
    .orderBy(
      fetchQueue.kind,
      fetchQueue.eventId,
      fetchQueue.playerId,
      fetchQueue.round,
      desc(fetchQueue.id),
    );
}

interface JobTotals {
  queued: number;
  fetching: number;
  failed: number;
}

/** Open and failed jobs, summed and per kind (every kind present, zeros included). */
export async function queueTotals(
  db: Db,
): Promise<JobTotals & { byKind: Record<FetchJobKind, JobTotals> }> {
  const open = await db
    .select({ kind: fetchQueue.kind, status: fetchQueue.status, n: count() })
    .from(fetchQueue)
    .where(inArray(fetchQueue.status, [...OPEN]))
    .groupBy(fetchQueue.kind, fetchQueue.status);
  const newest = await newestJobPerTarget(db);
  const of = (kind: FetchJobKind, status: FetchQueueStatus) =>
    open.find((row) => row.kind === kind && row.status === status)?.n ?? 0;
  const totalsOf = (kind: FetchJobKind): JobTotals => ({
    queued: of(kind, 'queued'),
    fetching: of(kind, 'fetching'),
    failed: newest.filter((row) => row.kind === kind && isRetryableFailure(row)).length,
  });
  const byKind = {
    list: totalsOf('list'),
    event: totalsOf('event'),
    'pairings-round': totalsOf('pairings-round'),
  };
  const sum = (key: keyof JobTotals) =>
    ALL_KINDS.reduce((total, kind) => total + byKind[kind][key], 0);
  return { queued: sum('queued'), fetching: sum('fetching'), failed: sum('failed'), byKind };
}

/**
 * Open pairings work for an event, and failures: rounds whose newest pairings-round job failed,
 * plus one when the event's newest event job (the load that queues the rounds) failed.
 */
export async function eventPairingsJobs(
  db: Db,
  eventId: string,
): Promise<{ queued: number; failed: number }> {
  const [open] = await db
    .select({ n: count() })
    .from(fetchQueue)
    .where(
      and(
        eq(fetchQueue.eventId, eventId),
        inArray(fetchQueue.kind, [...PAIRINGS_KINDS]),
        inArray(fetchQueue.status, [...OPEN]),
      ),
    );
  const newest = await newestJobPerTarget(
    db,
    and(eq(fetchQueue.eventId, eventId), inArray(fetchQueue.kind, [...PAIRINGS_KINDS])),
  );
  return {
    queued: open?.n ?? 0,
    failed: newest.filter((row) => row.status === 'failed').length,
  };
}

/**
 * Sets `events.pairings_synced_at` when no pairings job of the event is open and every round
 * 1..roundCount has a newest pairings-round job that is done. Returns whether it did.
 */
export async function markPairingsSyncedIfComplete(
  db: Db,
  eventId: string,
  roundCount: number,
  at = new Date(),
): Promise<boolean> {
  if (roundCount === 0) return false;
  const { queued } = await eventPairingsJobs(db, eventId);
  if (queued > 0) return false;
  const newest = await newestJobPerTarget(
    db,
    and(eq(fetchQueue.eventId, eventId), eq(fetchQueue.kind, 'pairings-round')),
  );
  const done = new Set(newest.filter((row) => row.status === 'done').map((row) => row.round));
  for (let round = 1; round <= roundCount; round += 1) if (!done.has(round)) return false;
  await db.update(events).set({ pairingsSyncedAt: at }).where(eq(events.id, eventId));
  return true;
}

/** Queued rows in the order the worker will claim them. */
export async function queuedInOrder(
  db: Db,
): Promise<{ id: number; kind: FetchJobKind; eventId: string; playerId: string | null }[]> {
  return db
    .select({
      id: fetchQueue.id,
      kind: fetchQueue.kind,
      eventId: fetchQueue.eventId,
      playerId: fetchQueue.playerId,
    })
    .from(fetchQueue)
    .where(eq(fetchQueue.status, 'queued'))
    .orderBy(desc(fetchQueue.priority), fetchQueue.queuedAt, fetchQueue.id);
}

export interface LatestQueueRow {
  status: FetchQueueStatus;
  error: string | null;
  errorCode: string | null;
}

/**
 * A failure that counts as "failed" (and that retry-failed requeues): any but "no list on BCP",
 * which is final.
 */
export function isRetryableFailure(row: Pick<LatestQueueRow, 'status' | 'errorCode'>): boolean {
  return row.status === 'failed' && row.errorCode !== NO_LIST_CODE;
}

export async function latestQueueRowsByPlayer(
  db: Db,
  eventId: string,
): Promise<Map<string, LatestQueueRow>> {
  const rows = await newestJobPerTarget(
    db,
    and(eq(fetchQueue.kind, 'list'), eq(fetchQueue.eventId, eventId)),
  );
  const byPlayer = new Map<string, LatestQueueRow>();
  for (const row of rows) {
    if (row.playerId === null) continue;
    byPlayer.set(row.playerId, { status: row.status, error: row.error, errorCode: row.errorCode });
  }
  return byPlayer;
}
