import type { SyncKind, SyncRequest, SyncRun } from '@bcp/shared';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { syncRuns } from '../db/schema';

type SyncRunRow = typeof syncRuns.$inferSelect;
const ACTIVE = ['queued', 'running'] as const;

export function eventIdOf(request: SyncRequest): string | null {
  return request.kind === 'catalog' ? null : request.eventId;
}

const CatalogParamsSchema = z.object({ from: z.iso.date(), to: z.iso.date() });

/** A catalogue run's requested range, read back from its stored params. */
function rangeOf(row: SyncRunRow): { from: string; to: string } | null {
  if (row.kind !== 'catalog') return null;
  const parsed = CatalogParamsSchema.safeParse(row.params);
  return parsed.success ? parsed.data : null;
}

function toSyncRun(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    kind: row.kind,
    eventId: row.eventId,
    status: row.status,
    total: row.total,
    done: row.done,
    failed: row.failed,
    error: row.error,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    range: rangeOf(row),
  };
}

/** Creates a queued run, or returns null if an equivalent run is already active. */
export async function createSyncRun(db: Db, request: SyncRequest): Promise<SyncRun | null> {
  const [row] = await db
    .insert(syncRuns)
    .values({ kind: request.kind, eventId: eventIdOf(request), params: request, status: 'queued' })
    .onConflictDoNothing()
    .returning();
  return row ? toSyncRun(row) : null;
}

export async function findActiveSyncRun(
  db: Db,
  kind: SyncKind,
  eventId: string | null,
): Promise<SyncRun | null> {
  const [row] = await db
    .select()
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.kind, kind),
        eventId === null ? isNull(syncRuns.eventId) : eq(syncRuns.eventId, eventId),
        inArray(syncRuns.status, [...ACTIVE]),
      ),
    );
  return row ? toSyncRun(row) : null;
}

export async function getSyncRun(db: Db, id: number): Promise<SyncRun | null> {
  const [row] = await db.select().from(syncRuns).where(eq(syncRuns.id, id));
  return row ? toSyncRun(row) : null;
}

export async function markSyncRunRunning(db: Db, id: number): Promise<void> {
  await db.update(syncRuns).set({ status: 'running' }).where(eq(syncRuns.id, id));
}

export async function setSyncRunTotal(db: Db, id: number, total: number): Promise<void> {
  await db.update(syncRuns).set({ total }).where(eq(syncRuns.id, id));
}

/** Atomic `done += by` / `failed += by`, safe with concurrent workers. */
export async function incrementSyncRun(
  db: Db,
  id: number,
  field: 'done' | 'failed',
  by = 1,
): Promise<void> {
  const column = syncRuns[field];
  await db
    .update(syncRuns)
    .set({ [field]: sql`${column} + ${by}` })
    .where(eq(syncRuns.id, id));
}

export async function finishSyncRun(
  db: Db,
  id: number,
  outcome: { status: 'succeeded' } | { status: 'failed'; error: string },
): Promise<void> {
  await db
    .update(syncRuns)
    .set({
      status: outcome.status,
      error: outcome.status === 'failed' ? outcome.error : null,
      finishedAt: new Date(),
    })
    .where(eq(syncRuns.id, id));
}

/** Runs are in-process; any still active at startup were cut off by a restart. */
export async function failInterruptedSyncRuns(db: Db): Promise<number> {
  const rows = await db
    .update(syncRuns)
    .set({ status: 'failed', error: 'Interrupted by a server restart', finishedAt: new Date() })
    .where(inArray(syncRuns.status, [...ACTIVE]))
    .returning({ id: syncRuns.id });
  return rows.length;
}
