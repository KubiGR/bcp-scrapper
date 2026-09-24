import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { events, fetchQueue } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { sampleSource } from '../test/helpers';
import { upsertEventDetail, upsertEventSummaries } from './events';
import {
  cancelQueuedLists,
  claimNextJob,
  enqueueEventPairings,
  enqueueLists,
  eventPairingsJobs,
  latestQueueRowsByPlayer,
  markJobDone,
  markJobFailed,
  markPairingsSyncedIfComplete,
  NO_LIST_CODE,
  queuedInOrder,
  queueTotals,
  requeueInterrupted,
  retryFailedJobs,
  SINGLE_LIST_PRIORITY,
  USER_WAITING_PRIORITY,
} from './fetch-queue';
import { replaceEventPlayers, upsertPlayers } from './participants';

const EVENT = 'EVTTEAM0001';
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const source = sampleSource();
  await upsertEventDetail(db, await source.getEvent(EVENT));
  await upsertPlayers(db, await source.getPlayers(EVENT));
});

const ada = { playerId: 'PL-ADA', listId: 'LS-ADA' };
const ben = { playerId: 'PL-BEN', listId: 'LS-BEN' };
const cara = { playerId: 'PL-CARA', listId: 'LS-CARA' };
// A generous buffer over "now" for claimNextJob: computed fresh per call so it stays valid
// even when the full suite (not just this file) is slow to reach a given assertion.
const soon = () => new Date(Date.now() + 60_000);

describe('fetch queue repository', () => {
  it('queues each player at most once while open', async () => {
    expect(await enqueueLists(db, EVENT, [ada, ben], 0)).toBe(2);
    expect(await enqueueLists(db, EVENT, [ada, cara], 0)).toBe(1);
    expect(await queueTotals(db)).toMatchObject({ queued: 3, fetching: 0, failed: 0 });
  });

  it('claims higher priority first, then oldest, one row at a time', async () => {
    await enqueueLists(db, EVENT, [ada, ben], 0);
    await enqueueLists(db, EVENT, [cara], SINGLE_LIST_PRIORITY);

    const first = await claimNextJob(db, soon());
    expect(first).toMatchObject({ playerId: 'PL-CARA', listId: 'LS-CARA', attempts: 1 });
    expect((await claimNextJob(db, soon()))?.playerId).toBe('PL-ADA');
    expect(await queueTotals(db)).toMatchObject({ queued: 1, fetching: 2, failed: 0 });
  });

  it('bumps an already-queued normal request when the same list is asked for directly', async () => {
    await enqueueLists(db, EVENT, [ada, ben], 0);
    expect(await enqueueLists(db, EVENT, [ben], SINGLE_LIST_PRIORITY)).toBe(0);
    expect((await claimNextJob(db, soon()))?.playerId).toBe('PL-BEN');
  });

  it('skips rows whose backoff has not passed', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    await db.update(fetchQueue).set({ notBefore: new Date(Date.now() + 3_600_000) });
    expect(await claimNextJob(db, soon())).toBeNull();
  });

  it('puts rows cut off by a restart back in the queue', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    await claimNextJob(db, soon());
    expect(await requeueInterrupted(db)).toBe(1);
    expect(await queueTotals(db)).toMatchObject({ queued: 1, fetching: 0, failed: 0 });
  });

  it('cancels an event’s queued rows and retries failed ones except "no list"', async () => {
    await enqueueLists(db, EVENT, [ada, ben, cara], 0);
    const claimed = await claimNextJob(db, soon());
    if (!claimed) throw new Error('nothing claimed');
    await markJobFailed(db, claimed.id, 'BCP hiccup', 'BCP_UNAVAILABLE');
    const second = await claimNextJob(db, soon());
    if (!second) throw new Error('nothing claimed');
    await markJobFailed(db, second.id, 'No list on BCP', NO_LIST_CODE);

    expect(await cancelQueuedLists(db, EVENT)).toBe(1);
    expect(await retryFailedJobs(db, EVENT)).toBe(1);
    // "No list on BCP" is final: it isn't counted as a failure waiting for a retry.
    expect(await queueTotals(db)).toMatchObject({ queued: 1, fetching: 0, failed: 0 });
  });

  it('reports queue order and each player’s newest row', async () => {
    await enqueueLists(db, EVENT, [ada, ben], 0);
    expect((await queuedInOrder(db)).map((row) => row.playerId)).toEqual(['PL-ADA', 'PL-BEN']);
    const claimed = await claimNextJob(db, soon());
    if (!claimed) throw new Error('nothing claimed');
    await markJobFailed(db, claimed.id, 'BCP hiccup', 'BCP_UNAVAILABLE');

    const latest = await latestQueueRowsByPlayer(db, EVENT);
    expect(latest.get('PL-ADA')).toEqual({
      status: 'failed',
      error: 'BCP hiccup',
      errorCode: 'BCP_UNAVAILABLE',
    });
    expect(latest.get('PL-BEN')).toEqual({ status: 'queued', error: null, errorCode: null });
    expect(await queueTotals(db)).toMatchObject({ failed: 1 });
    const [row] = await db.select().from(fetchQueue).where(eq(fetchQueue.playerId, 'PL-ADA'));
    expect(row?.finishedAt).toBeInstanceOf(Date);
  });

  describe('retryFailedJobs', () => {
    /** Queues the players, then claims every queued row and marks it failed with `code`. */
    async function failAll(eventId: string, items: (typeof ada)[], code = 'BCP_UNAVAILABLE') {
      await enqueueLists(db, eventId, items, 0);
      let claimed = await claimNextJob(db, soon());
      while (claimed) {
        await markJobFailed(db, claimed.id, 'BCP hiccup', code);
        claimed = await claimNextJob(db, soon());
      }
    }
    const rowsOf = (playerId: string) =>
      db.select().from(fetchQueue).where(eq(fetchQueue.playerId, playerId)).orderBy(fetchQueue.id);

    it('requeues a retryable failure with a fresh attempt count', async () => {
      await failAll(EVENT, [ada]);
      expect(await retryFailedJobs(db, EVENT)).toBe(1);
      const [row] = await rowsOf('PL-ADA');
      expect(row).toMatchObject({ status: 'queued', attempts: 0, error: null, errorCode: null });
    });

    it('leaves a failure alone when the player has a newer open row', async () => {
      await failAll(EVENT, [ada]);
      await enqueueLists(db, EVENT, [ada], 0);
      expect(await retryFailedJobs(db, EVENT)).toBe(0);
      expect((await rowsOf('PL-ADA')).map((row) => row.status)).toEqual(['failed', 'queued']);
    });

    it('leaves a failure alone when the player has a newer done row', async () => {
      await failAll(EVENT, [ada]);
      await enqueueLists(db, EVENT, [ada], 0);
      const claimed = await claimNextJob(db, soon());
      if (!claimed) throw new Error('nothing claimed');
      await markJobDone(db, claimed.id);
      expect(await retryFailedJobs(db)).toBe(0);
      expect((await rowsOf('PL-ADA')).map((row) => row.status)).toEqual(['failed', 'done']);
    });

    it('resets failures across events without an eventId, but not "no list"', async () => {
      const other = 'EVTSINGLE01';
      await upsertEventSummaries(
        db,
        (await sampleSource().listEvents({ from: '2026-01-01', to: '2026-12-31' }, null)).items,
      );
      const [first] = await sampleSource().getPlayers(EVENT);
      if (!first) throw new Error('fixture missing');
      await replaceEventPlayers(db, other, [{ ...first, bcpId: 'PL-OTHER', eventBcpId: other }]);
      await failAll(EVENT, [ada]);
      await failAll(other, [{ playerId: 'PL-OTHER', listId: 'LS-OTHER' }]);
      await failAll(EVENT, [ben], NO_LIST_CODE);

      expect(await retryFailedJobs(db)).toBe(2);
      expect(await queueTotals(db)).toMatchObject({ queued: 2 });
    });
  });
});

describe('pairings jobs', () => {
  const claim = async () => {
    const job = await claimNextJob(db, soon());
    if (!job) throw new Error('nothing claimed');
    return job;
  };
  const kinds = async () =>
    (await db.select().from(fetchQueue).orderBy(fetchQueue.id)).map((r) => [
      r.kind,
      r.round,
      r.priority,
      r.status,
    ]);

  it('queues each round once while open, alongside list jobs', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    expect(await enqueueEventPairings(db, EVENT, { rounds: [1, 2], priority: 0 })).toEqual({
      eventQueued: false,
      queuedRounds: 2,
    });
    expect(await enqueueEventPairings(db, EVENT, { rounds: [1, 2], priority: 0 })).toEqual({
      eventQueued: false,
      queuedRounds: 0,
    });
    expect(await kinds()).toEqual([
      ['list', null, 0, 'queued'],
      ['pairings-round', 1, 0, 'queued'],
      ['pairings-round', 2, 0, 'queued'],
    ]);
  });

  it('raises an event’s queued jobs when the user asks from the event page', async () => {
    await enqueueEventPairings(db, EVENT, { rounds: [1, 2], priority: 0 });
    await enqueueEventPairings(db, EVENT, { rounds: [1, 2], priority: USER_WAITING_PRIORITY });
    expect((await kinds()).map(([, , priority]) => priority)).toEqual([10, 10]);
  });

  it('queues one event job with a pairings follow-up for a never-synced event', async () => {
    expect(await enqueueEventPairings(db, EVENT, { rounds: null, priority: 0 })).toEqual({
      eventQueued: true,
      queuedRounds: 0,
    });
    expect(
      await enqueueEventPairings(db, EVENT, { rounds: null, priority: USER_WAITING_PRIORITY }),
    ).toEqual({
      eventQueued: true,
      queuedRounds: 0,
    });
    const rows = await db.select().from(fetchQueue);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'event', followUp: 'pairings', priority: 10 });
  });

  it('retries a failed round only when it is that round’s newest job', async () => {
    await enqueueEventPairings(db, EVENT, { rounds: [1], priority: 0 });
    const first = await claim();
    await markJobFailed(db, first.id, 'BCP down', 'BCP_UNAVAILABLE');
    await enqueueEventPairings(db, EVENT, { rounds: [1], priority: 0 });
    expect(await retryFailedJobs(db, EVENT)).toBe(0); // a newer round-1 job is open
    const second = await claim();
    await markJobFailed(db, second.id, 'BCP down', 'BCP_UNAVAILABLE');
    expect(await retryFailedJobs(db, EVENT)).toBe(1);
  });

  it('counts totals by kind and an event’s pairings jobs', async () => {
    await enqueueLists(db, EVENT, [ada, ben], 0);
    await enqueueEventPairings(db, EVENT, { rounds: [1, 2], priority: 0 });
    const firstClaimed = await claim(); // Ada's list: queued first
    await markJobFailed(db, firstClaimed.id, 'x', 'INTERNAL');
    const totals = await queueTotals(db);
    expect(totals.byKind['pairings-round']).toEqual({ queued: 2, fetching: 0, failed: 0 });
    expect(totals.byKind.list).toEqual({ queued: 1, fetching: 0, failed: 1 });
    expect(totals.byKind.event).toEqual({ queued: 0, fetching: 0, failed: 0 });
    expect(totals).toMatchObject({ queued: 3, fetching: 0, failed: 1 });
    expect(await eventPairingsJobs(db, EVENT)).toEqual({ queued: 2, failed: 0 });
  });

  it('cancelling an event’s queued lists leaves its pairings jobs', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    await enqueueEventPairings(db, EVENT, { rounds: [1], priority: 0 });
    expect(await cancelQueuedLists(db, EVENT)).toBe(1);
    expect(await kinds()).toEqual([['pairings-round', 1, 0, 'queued']]);
  });

  it('marks pairings synced once every round’s newest job is done', async () => {
    await enqueueEventPairings(db, EVENT, { rounds: [1, 2], priority: 0 });
    const one = await claim();
    await markJobDone(db, one.id);
    expect(await markPairingsSyncedIfComplete(db, EVENT, 2)).toBe(false);
    const two = await claim();
    await markJobDone(db, two.id);
    expect(await markPairingsSyncedIfComplete(db, EVENT, 2)).toBe(true);
    const [event] = await db.select().from(events).where(eq(events.id, EVENT));
    expect(event?.pairingsSyncedAt).toBeInstanceOf(Date);
  });
});
