import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { syncRuns } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import {
  createSyncRun,
  failInterruptedSyncRuns,
  findActiveSyncRun,
  finishSyncRun,
  getSyncRun,
  incrementSyncRun,
  latestEventSyncRuns,
  markSyncRunRunning,
  setSyncRunTotal,
} from './sync-runs';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

describe('sync runs', () => {
  it('tracks a run from queued to succeeded', async () => {
    const run = await createSyncRun(db, { kind: 'event', eventId: 'E1' });
    expect(run).toMatchObject({
      kind: 'event',
      eventId: 'E1',
      status: 'queued',
      done: 0,
      total: null,
    });
    if (!run) throw new Error('not created');

    await markSyncRunRunning(db, run.id);
    await setSyncRunTotal(db, run.id, 3);
    await incrementSyncRun(db, run.id, 'done');
    await incrementSyncRun(db, run.id, 'done');
    await incrementSyncRun(db, run.id, 'failed');
    await finishSyncRun(db, run.id, { status: 'succeeded' });

    const finished = await getSyncRun(db, run.id);
    expect(finished).toMatchObject({
      status: 'succeeded',
      total: 3,
      done: 2,
      failed: 1,
      error: null,
    });
    expect(finished?.finishedAt).toEqual(expect.any(String));
  });

  it('refuses a second active run for the same kind and event', async () => {
    const first = await createSyncRun(db, { kind: 'event', eventId: 'E1' });
    expect(await createSyncRun(db, { kind: 'event', eventId: 'E1' })).toBeNull();
    expect(await findActiveSyncRun(db, 'event', 'E1')).toEqual(first);
    expect(await createSyncRun(db, { kind: 'event', eventId: 'E2' })).not.toBeNull();
    expect(
      await createSyncRun(db, { kind: 'catalog', from: '2026-01-01', to: '2026-01-31' }),
    ).not.toBeNull();
    expect(await findActiveSyncRun(db, 'catalog', null)).not.toBeNull();
  });

  it('marks runs left running by a crashed process as failed', async () => {
    const run = await createSyncRun(db, { kind: 'event', eventId: 'E1' });
    if (!run) throw new Error('not created');
    await markSyncRunRunning(db, run.id);

    expect(await failInterruptedSyncRuns(db)).toBe(1);
    expect(await getSyncRun(db, run.id)).toMatchObject({
      status: 'failed',
      error: 'Interrupted by a server restart',
    });
  });

  it('exposes the date range of catalogue runs only', async () => {
    const catalog = await createSyncRun(db, {
      kind: 'catalog',
      from: '2026-01-01',
      to: '2026-01-31',
    });
    const event = await createSyncRun(db, { kind: 'event', eventId: 'E1' });
    expect(catalog?.range).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(event?.range).toBeNull();
  });

  it('reports an event’s latest event run, ignoring retired pairings runs', async () => {
    const older = await createSyncRun(db, { kind: 'event', eventId: 'E1' });
    if (!older) throw new Error('not created');
    await finishSyncRun(db, older.id, { status: 'succeeded' });
    const newer = await createSyncRun(db, { kind: 'event', eventId: 'E1' });
    // History from before pairings moved to the fetch queue.
    await db
      .insert(syncRuns)
      .values({ kind: 'pairings', eventId: 'E1', params: {}, status: 'succeeded' });
    expect(await latestEventSyncRuns(db, 'E1')).toEqual({ event: newer });
    expect(await latestEventSyncRuns(db, 'E2')).toEqual({ event: null });
  });
});
