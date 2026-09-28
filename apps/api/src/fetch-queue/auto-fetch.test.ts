import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import { events, fetchQueue } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { setAutoFetchEnabled } from '../repo/app-settings';
import { upsertEventSummaries } from '../repo/events';
import { markJobFailed } from '../repo/fetch-queue';
import { syncEvent } from '../sync/jobs';
import { syncRoundPairings } from '../sync/round-pairings';
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

  describe('rounds fetched while the event ran (EVTTEAM0001: Mar 28–29, 2 rounds)', () => {
    const doneRounds = (finishedAt: Date) =>
      db.insert(fetchQueue).values(
        [1, 2].map((round) => ({
          kind: 'pairings-round' as const,
          eventId: 'EVTTEAM0001',
          round,
          status: 'done' as const,
          finishedAt,
          priority: -10,
          origin: 'auto' as const,
        })),
      );
    const synced = async () =>
      (await db.select().from(events).where(eq(events.id, 'EVTTEAM0001')))[0]?.pairingsSyncedAt;

    beforeEach(async () => {
      await syncEvent({ db, source }, 'EVTTEAM0001');
      await db
        .update(events)
        .set({ ended: false, roundCount: 2 })
        .where(eq(events.id, 'EVTTEAM0001'));
    });

    it('fetches an empty round again once the event is over, then marks it complete', async () => {
      await doneRounds(new Date('2026-03-28T15:00:00Z'));
      await planner().planOnce();
      const again = (await jobs()).filter(
        (j) => j.kind === 'pairings-round' && j.status === 'queued',
      );
      expect(again.map((j) => j.round)).toEqual([1, 2]);

      // Fetched after the event, still empty: BCP has nothing; leave it and call it complete.
      await db.delete(fetchQueue).where(eq(fetchQueue.status, 'queued'));
      await doneRounds(now);
      await planner().planOnce();
      expect((await jobs()).some((j) => j.kind === 'pairings-round' && j.status === 'queued')).toBe(
        false,
      );
      expect(await synced()).toBeInstanceOf(Date);
    });

    it('marks an event complete whose rounds are all stored, without fetching them again', async () => {
      for (const round of [1, 2]) {
        await syncRoundPairings(
          { db, source, logger: silentLogger },
          { id: 'EVTTEAM0001', isTeamEvent: true },
          round,
        );
      }
      await doneRounds(new Date('2026-03-28T15:00:00Z'));
      await planner().planOnce();
      expect((await jobs()).some((j) => j.kind === 'pairings-round' && j.status === 'queued')).toBe(
        false,
      );
      expect(await synced()).toBeInstanceOf(Date);
    });
  });

  it('skips the catalogue refresh while BCP rejects the login (the queue is paused for it)', async () => {
    const runner = new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS });
    const start = vi.spyOn(runner, 'start');
    const auto = new AutoFetchPlanner({
      db,
      runner,
      logger: silentLogger,
      eventRule: ALL_EVENTS,
      days: 60,
      intervalMs: 600_000,
      catalogIntervalMs: 21_600_000,
      now: () => now,
      loginRejected: () => Promise.resolve(true),
    });
    await auto.refreshCatalogue();
    expect(start).not.toHaveBeenCalled();
  });

  it('does nothing while switched off', async () => {
    await setAutoFetchEnabled(db, false);
    expect(await planner(BIG).planOnce()).toEqual({ events: 0, jobs: 0 });
    expect(await jobs()).toEqual([]);
  });

  it('leaves out events outside the window, and small ones', async () => {
    now = new Date('2026-09-27T12:00:00Z');
    expect((await planner().planOnce()).jobs).toBe(0);

    now = new Date('2026-04-12T15:00:00Z'); // EVTSMALL001 is on today, but small
    await planner(BIG).planOnce();
    expect((await jobs()).some((j) => j.eventId === 'EVTSMALL001')).toBe(false);

    await db.delete(fetchQueue);
    now = new Date('2026-04-20T12:00:00Z');
    await planner(ALL_EVENTS, 5).planOnce(); // only events of the last 5 days: none
    expect((await jobs()).some((j) => j.eventId === 'EVTSINGLE01')).toBe(false);
  });

  describe('a running event (EVTTEAM0001 runs 28–29 Mar)', () => {
    const running = new Date('2026-03-28T15:00:00Z');
    const team = async () => (await jobs()).filter((j) => j.eventId === 'EVTTEAM0001');
    const loadedAt = (at: Date) =>
      db.update(events).set({ lastSyncedAt: at, ended: false }).where(eq(events.id, 'EVTTEAM0001'));

    beforeEach(async () => {
      now = running;
      // The sample marks it ended; this one hasn't yet.
      await db.update(events).set({ ended: false }).where(eq(events.id, 'EVTTEAM0001'));
    });

    it('is loaded without its pairings (rounds keep coming until it ends)', async () => {
      await planner().planOnce();
      const queued = await team();
      expect(queued.map((j) => [j.kind, j.followUp])).toEqual([['event', null]]);
    });

    it('gets its missing lists queued once loaded, but no pairings', async () => {
      await syncEvent({ db, source }, 'EVTTEAM0001');
      await loadedAt(new Date('2026-03-28T14:30:00Z'));
      await planner().planOnce();
      const queued = await team();
      expect(queued.filter((j) => j.kind === 'list')).toHaveLength(7);
      expect(queued.some((j) => j.kind !== 'list')).toBe(false);
    });

    it('is loaded again once its last load is an hour old, for lists added since', async () => {
      await syncEvent({ db, source }, 'EVTTEAM0001');
      await loadedAt(new Date('2026-03-28T13:30:00Z'));
      await planner().planOnce();
      const loads = (await team()).filter((j) => j.kind === 'event');
      expect(loads.map((j) => j.followUp)).toEqual([null]);
    });
  });

  it('plans newest events first', async () => {
    await syncEvent({ db, source }, 'EVTTEAM0001');
    await planner().planOnce();
    const order = [...new Set((await jobs()).map((j) => j.eventId))];
    expect(order.indexOf('EVTSINGLE01')).toBeLessThan(order.indexOf('EVTTEAM0001'));
  });
});
