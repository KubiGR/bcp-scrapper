import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { fetchQueue } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { setAutoFetchEnabled } from '../repo/app-settings';
import { upsertEventSummaries } from '../repo/events';
import { markJobFailed } from '../repo/fetch-queue';
import { syncEvent } from '../sync/jobs';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger } from '../test/helpers';
import { AutoFetchPlanner } from './auto-fetch';

let db: Db;
let close: () => Promise<void>;
let now: Date;
const source = sampleSource();
const BIG = { minRounds: 4, minPlayers: 20 };

function planner(eventRule = ALL_EVENTS, days = 60) {
  return new AutoFetchPlanner({
    db,
    runner: new SyncRunner({ db, source, logger: silentLogger, eventRule }),
    logger: silentLogger,
    eventRule,
    days,
    intervalMs: 600_000,
    catalogIntervalMs: 21_600_000,
    now: () => now,
  });
}

const jobs = () => db.select().from(fetchQueue).orderBy(fetchQueue.id);

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  now = new Date('2026-04-20T12:00:00Z');
  // EVTSINGLE01 (Apr 10, big, never synced), EVTTEAM0001 (Mar 28, small), EVTSMALL001 (Apr 12).
  await upsertEventSummaries(
    db,
    (await source.listEvents({ from: '2026-01-01', to: '2026-12-31' }, null)).items,
  );
});

describe('AutoFetchPlanner', () => {
  it('queues an event job (pairings to follow) for a big finished event never synced', async () => {
    const result = await planner(BIG).planOnce();
    expect(result).toEqual({ events: 1, jobs: 1 });
    expect(await jobs()).toMatchObject([
      {
        eventId: 'EVTSINGLE01',
        kind: 'event',
        followUp: 'pairings',
        priority: -10,
        origin: 'auto',
      },
    ]);
  });

  it('queues the rounds and every missing list of a synced event, once', async () => {
    await syncEvent({ db, source }, 'EVTTEAM0001');
    const auto = planner();
    await auto.planOnce();
    const team = (await jobs()).filter((j) => j.eventId === 'EVTTEAM0001');
    expect(team.filter((j) => j.kind === 'pairings-round').map((j) => j.round)).toEqual([1, 2]);
    expect(team.filter((j) => j.kind === 'list')).toHaveLength(7);
    expect(team.every((j) => j.priority === -10 && j.origin === 'auto')).toBe(true);

    const before = (await jobs()).length;
    expect((await auto.planOnce()).jobs).toBe(0);
    expect(await jobs()).toHaveLength(before);
  });

  it('does not queue again what failed; failures wait for the user’s Retry', async () => {
    await syncEvent({ db, source }, 'EVTTEAM0001');
    const auto = planner();
    await auto.planOnce();
    for (const job of await jobs()) {
      if (job.eventId === 'EVTTEAM0001' && (job.playerId === 'PL-ADA' || job.round === 1)) {
        await markJobFailed(db, job.id, 'boom', 'BCP_UNAVAILABLE');
      } else {
        await db.delete(fetchQueue).where(eq(fetchQueue.id, job.id));
      }
    }
    await auto.planOnce();
    const requeued = (await jobs()).filter(
      (j) => j.status === 'queued' && j.eventId === 'EVTTEAM0001',
    );
    expect(requeued.some((j) => j.playerId === 'PL-ADA')).toBe(false);
    expect(requeued.some((j) => j.kind === 'pairings-round')).toBe(false);
    expect(requeued.filter((j) => j.kind === 'list')).toHaveLength(6);
  });

  it('does nothing while switched off', async () => {
    await setAutoFetchEnabled(db, false);
    expect(await planner(BIG).planOnce()).toEqual({ events: 0, jobs: 0 });
    expect(await jobs()).toEqual([]);
  });

  it('leaves out events outside the window, and running ones', async () => {
    now = new Date('2026-09-27T12:00:00Z');
    expect((await planner().planOnce()).jobs).toBe(0);

    now = new Date('2026-04-12T15:00:00Z'); // EVTSMALL001 is on today
    await planner().planOnce();
    expect((await jobs()).some((j) => j.eventId === 'EVTSMALL001')).toBe(false);

    await db.delete(fetchQueue);
    now = new Date('2026-04-20T12:00:00Z');
    await planner(ALL_EVENTS, 5).planOnce(); // only events of the last 5 days: none
    expect((await jobs()).some((j) => j.eventId === 'EVTSINGLE01')).toBe(false);
  });

  it('plans newest events first', async () => {
    await syncEvent({ db, source }, 'EVTTEAM0001');
    await planner().planOnce();
    const order = [...new Set((await jobs()).map((j) => j.eventId))];
    expect(order.indexOf('EVTSINGLE01')).toBeLessThan(order.indexOf('EVTTEAM0001'));
  });
});
