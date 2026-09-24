import { and, count, desc, eq, gt, inArray, isNull, ne, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { listQueue } from '../db/schema';

/** Priority of a single list someone is waiting for; normal requests are 0. */
export const SINGLE_LIST_PRIORITY = 10;
/** `error_code` of a list BCP says doesn't exist; never retried. */
export const NO_LIST_CODE = 'NO_LIST';

export type ListQueueStatus = (typeof listQueue.$inferSelect)['status'];

export interface ClaimedList {
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
    .insert(listQueue)
    .values(items.map((item) => ({ eventId, ...item, priority })))
    .onConflictDoNothing()
    .returning({ id: listQueue.id });
  if (priority === SINGLE_LIST_PRIORITY) {
    await db
      .update(listQueue)
      .set({ priority })
      .where(
        and(
          inArray(
            listQueue.playerId,
            items.map((item) => item.playerId),
          ),
          eq(listQueue.status, 'queued'),
        ),
      );
  }
  return inserted.length;
}

/** Atomically takes the next due row (highest priority, then oldest) and marks it fetching. */
export async function claimNextList(db: Db, now: Date): Promise<ClaimedList | null> {
  const next = sql`(
    select ${listQueue.id} from ${listQueue}
    where ${listQueue.status} = 'queued' and ${listQueue.notBefore} <= ${now.toISOString()}::timestamptz
    order by ${listQueue.priority} desc, ${listQueue.queuedAt}, ${listQueue.id}
    limit 1
    for update skip locked
  )`;
  const [row] = await db
    .update(listQueue)
    .set({ status: 'fetching', attempts: sql`${listQueue.attempts} + 1` })
    .where(eq(listQueue.id, next))
    .returning({
      id: listQueue.id,
      eventId: listQueue.eventId,
      playerId: listQueue.playerId,
      listId: listQueue.listId,
      attempts: listQueue.attempts,
    });
  return row ?? null;
}

export async function markListDone(db: Db, id: number): Promise<void> {
  await db
    .update(listQueue)
    .set({ status: 'done', error: null, errorCode: null, finishedAt: new Date() })
    .where(eq(listQueue.id, id));
}

export async function markListFailed(
  db: Db,
  id: number,
  error: string,
  code: string,
): Promise<void> {
  await db
    .update(listQueue)
    .set({ status: 'failed', error, errorCode: code, finishedAt: new Date() })
    .where(eq(listQueue.id, id));
}

/** Back to the queue after a transient failure, not before `notBefore`. */
export async function retryListLater(
  db: Db,
  id: number,
  notBefore: Date,
  error: string,
): Promise<void> {
  await db
    .update(listQueue)
    .set({ status: 'queued', notBefore, error })
    .where(eq(listQueue.id, id));
}

/** Back to the queue without counting the attempt (the worker paused; the list wasn't at fault). */
export async function releaseList(db: Db, id: number): Promise<void> {
  await db
    .update(listQueue)
    .set({ status: 'queued', attempts: sql`greatest(${listQueue.attempts} - 1, 0)` })
    .where(eq(listQueue.id, id));
}

/** Rows left fetching by a process that stopped go back to the queue. */
export async function requeueInterrupted(db: Db): Promise<number> {
  const rows = await db
    .update(listQueue)
    .set({ status: 'queued' })
    .where(eq(listQueue.status, 'fetching'))
    .returning({ id: listQueue.id });
  return rows.length;
}

export async function cancelQueuedLists(db: Db, eventId: string): Promise<number> {
  const rows = await db
    .delete(listQueue)
    .where(and(eq(listQueue.eventId, eventId), eq(listQueue.status, 'queued')))
    .returning({ id: listQueue.id });
  return rows.length;
}

/**
 * Failed rows (except "no list on BCP") go back to the queue with a fresh attempt count. Only a
 * player's newest row is retried: a failure superseded by a newer request (open or done) stays
 * as history, so retrying never collides with an open row or refetches an older list.
 */
export async function retryFailedLists(db: Db, eventId?: string): Promise<number> {
  const newer = alias(listQueue, 'newer');
  const rows = await db
    .update(listQueue)
    .set({ status: 'queued', attempts: 0, notBefore: new Date(), error: null, errorCode: null })
    .where(
      and(
        eq(listQueue.status, 'failed'),
        or(isNull(listQueue.errorCode), ne(listQueue.errorCode, NO_LIST_CODE)),
        eventId === undefined ? undefined : eq(listQueue.eventId, eventId),
        notExists(
          db
            .select({ id: newer.id })
            .from(newer)
            .where(and(eq(newer.playerId, listQueue.playerId), gt(newer.id, listQueue.id))),
        ),
      ),
    )
    .returning({ id: listQueue.id });
  return rows.length;
}

/**
 * The newest row per player. A player's queue state is their newest request; older failures
 * that were retried or superseded don't count.
 */
function newestRowPerPlayer(db: Db, eventId?: string) {
  return db
    .selectDistinctOn([listQueue.playerId], {
      playerId: listQueue.playerId,
      eventId: listQueue.eventId,
      status: listQueue.status,
      error: listQueue.error,
      errorCode: listQueue.errorCode,
    })
    .from(listQueue)
    .where(eventId === undefined ? undefined : eq(listQueue.eventId, eventId))
    .orderBy(listQueue.playerId, desc(listQueue.id));
}

export async function queueTotals(
  db: Db,
): Promise<{ queued: number; fetching: number; failed: number }> {
  const open = await db
    .select({ status: listQueue.status, n: count() })
    .from(listQueue)
    .where(inArray(listQueue.status, ['queued', 'fetching']))
    .groupBy(listQueue.status);
  const newest = await newestRowPerPlayer(db);
  const of = (status: ListQueueStatus) => open.find((row) => row.status === status)?.n ?? 0;
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
    .select({ id: listQueue.id, eventId: listQueue.eventId, playerId: listQueue.playerId })
    .from(listQueue)
    .where(eq(listQueue.status, 'queued'))
    .orderBy(desc(listQueue.priority), listQueue.queuedAt, listQueue.id);
}

export interface LatestQueueRow {
  status: ListQueueStatus;
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
