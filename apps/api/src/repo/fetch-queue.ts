import { and, count, desc, eq, gt, inArray, isNull, ne, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { fetchQueue } from '../db/schema';

/** Priority of a single list someone is waiting for; normal requests are 0. */
export const SINGLE_LIST_PRIORITY = 10;
/** `error_code` of a list BCP says doesn't exist; never retried. */
export const NO_LIST_CODE = 'NO_LIST';

export type FetchQueueStatus = (typeof fetchQueue.$inferSelect)['status'];

export interface ClaimedJob {
  id: number;
  eventId: string;
  playerId: string;
  listId: string;
  attempts: number;
}

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
    .values(items.map((item) => ({ eventId, ...item, priority })))
    .onConflictDoNothing()
    .returning({ id: fetchQueue.id });
  if (priority === SINGLE_LIST_PRIORITY) {
    await db
      .update(fetchQueue)
      .set({ priority })
      .where(
        and(
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
      eventId: fetchQueue.eventId,
      playerId: fetchQueue.playerId,
      listId: fetchQueue.listId,
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

export async function cancelQueuedLists(db: Db, eventId: string): Promise<number> {
  const rows = await db
    .delete(fetchQueue)
    .where(and(eq(fetchQueue.eventId, eventId), eq(fetchQueue.status, 'queued')))
    .returning({ id: fetchQueue.id });
  return rows.length;
}

/**
 * Failed rows (except "no list on BCP") go back to the queue with a fresh attempt count. Only a
 * player's newest row is retried: a failure superseded by a newer request (open or done) stays
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
            .where(and(eq(newer.playerId, fetchQueue.playerId), gt(newer.id, fetchQueue.id))),
        ),
      ),
    )
    .returning({ id: fetchQueue.id });
  return rows.length;
}

/**
 * The newest row per player. A player's queue state is their newest request; older failures
 * that were retried or superseded don't count.
 */
function newestRowPerPlayer(db: Db, eventId?: string) {
  return db
    .selectDistinctOn([fetchQueue.playerId], {
      playerId: fetchQueue.playerId,
      eventId: fetchQueue.eventId,
      status: fetchQueue.status,
      error: fetchQueue.error,
      errorCode: fetchQueue.errorCode,
    })
    .from(fetchQueue)
    .where(eventId === undefined ? undefined : eq(fetchQueue.eventId, eventId))
    .orderBy(fetchQueue.playerId, desc(fetchQueue.id));
}

export async function queueTotals(
  db: Db,
): Promise<{ queued: number; fetching: number; failed: number }> {
  const open = await db
    .select({ status: fetchQueue.status, n: count() })
    .from(fetchQueue)
    .where(inArray(fetchQueue.status, ['queued', 'fetching']))
    .groupBy(fetchQueue.status);
  const newest = await newestRowPerPlayer(db);
  const of = (status: FetchQueueStatus) => open.find((row) => row.status === status)?.n ?? 0;
  return {
    queued: of('queued'),
    fetching: of('fetching'),
    failed: newest.filter((row) => isRetryableFailure(row)).length,
  };
}

/** Queued rows in the order the worker will claim them. */
export async function queuedInOrder(
  db: Db,
): Promise<{ id: number; eventId: string; playerId: string }[]> {
  return db
    .select({ id: fetchQueue.id, eventId: fetchQueue.eventId, playerId: fetchQueue.playerId })
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
  const rows = await newestRowPerPlayer(db, eventId);
  return new Map(
    rows.map((row) => [
      row.playerId,
      { status: row.status, error: row.error, errorCode: row.errorCode },
    ]),
  );
}
