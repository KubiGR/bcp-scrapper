import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { events, fetchQueue, games } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { BcpAuthError, BcpRateLimitedError, BcpUnavailableError } from '../errors';
import { upsertEventDetail, upsertEventSummaries } from '../repo/events';
import * as fetchQueueRepo from '../repo/fetch-queue';
import {
  claimNextJob,
  enqueueEventPairings,
  enqueueLists,
  latestQueueRowsByPlayer,
  NO_LIST_CODE,
  queueTotals,
  SINGLE_LIST_PRIORITY,
  USER_WAITING_PRIORITY,
} from '../repo/fetch-queue';
import { findPlayerList } from '../repo/lists';
import { storedPairingsSummary } from '../repo/pairings';
import { upsertPlayers } from '../repo/participants';
import { drainQueue, sampleSource, silentLogger } from '../test/helpers';
import { FetchQueueWorker } from './worker';

const EVENT = 'EVTTEAM0001';
let db: Db;
let close: () => Promise<void>;
const source = sampleSource();

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await upsertEventDetail(db, await source.getEvent(EVENT));
  await upsertPlayers(db, await source.getPlayers(EVENT));
});

/** A plain source forwarding every method to `inner`, so tests can replace some. */
function delegate(inner: TournamentSource): TournamentSource {
  return {
    listEvents: (range, cursor) => inner.listEvents(range, cursor),
    getEvent: (id) => inner.getEvent(id),
    getPlayers: (id) => inner.getPlayers(id),
    getTeams: (id) => inner.getTeams(id),
    getTeamMatchups: (id, round) => inner.getTeamMatchups(id, round),
    getGames: (id, round) => inner.getGames(id, round),
    getEventGames: (id, round) => inner.getEventGames(id, round),
    getList: (listId) => inner.getList(listId),
  };
}

/** The sample source, with getList replaced. */
function withGetList(getList: TournamentSource['getList']): TournamentSource {
  return { ...delegate(source), getList };
}

function worker(
  src: TournamentSource = source,
  now = () => new Date(),
  loginRejected?: () => Promise<boolean>,
) {
  return new FetchQueueWorker({
    db,
    source: src,
    logger: silentLogger,
    intervalMs: 5000,
    now,
    loginRejected,
  });
}

const ada = { playerId: 'PL-ADA', listId: 'LS-ADA' };
const ben = { playerId: 'PL-BEN', listId: 'LS-BEN' };

describe('FetchQueueWorker', () => {
  it('keeps an automatic event load’s rounds automatic, at its priority', async () => {
    await fetchQueueRepo.enqueueEventPairings(db, EVENT, {
      rounds: null,
      priority: fetchQueueRepo.AUTO_PRIORITY,
      origin: 'auto',
    });
    expect(await worker().tick()).toBe('fetched');
    const rounds = (await db.select().from(fetchQueue)).filter((j) => j.kind === 'pairings-round');
    expect(rounds.length).toBeGreaterThan(0);
    expect(rounds.every((j) => j.origin === 'auto' && j.priority === -10)).toBe(true);
  });

  it('fetches one list per tick, priority first, and stores it', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    await enqueueLists(db, EVENT, [ben], SINGLE_LIST_PRIORITY);
    const w = worker();

    expect(await w.tick()).toBe('fetched');
    expect(await findPlayerList(db, 'PL-BEN')).not.toBeNull();
    expect(await findPlayerList(db, 'PL-ADA')).toBeNull();
    expect(await w.tick()).toBe('fetched');
    expect(await w.tick()).toBe('idle');
  });

  it('marks a list BCP does not have as failed, without retrying', async () => {
    await enqueueLists(db, EVENT, [{ playerId: 'PL-HAL', listId: 'LS-NONE' }], 0);
    expect(await worker().tick()).toBe('failed');
    // Final, so it isn't counted among the failures waiting for a retry.
    expect(await queueTotals(db)).toMatchObject({ queued: 0, fetching: 0, failed: 0 });
    expect((await latestQueueRowsByPlayer(db, EVENT)).get('PL-HAL')).toMatchObject({
      status: 'failed',
      errorCode: NO_LIST_CODE,
    });
  });

  it('retries transient failures with backoff, then gives up after 3 attempts', async () => {
    let clock = new Date('2030-01-01T00:00:00Z');
    const failing = withGetList(() => Promise.reject(new BcpUnavailableError('BCP down')));
    const w = worker(failing, () => clock);
    await enqueueLists(db, EVENT, [ada], 0);

    // notBefore defaults to the real now, well before the fake 2030 clock.
    expect(await w.tick()).toBe('retry');
    expect(await w.tick()).toBe('idle'); // backoff: 1 minute
    clock = new Date(clock.getTime() + 61_000);
    expect(await w.tick()).toBe('retry');
    clock = new Date(clock.getTime() + 5 * 60_000 + 1000);
    expect(await w.tick()).toBe('failed');
    expect(await queueTotals(db)).toMatchObject({ queued: 0, fetching: 0, failed: 1 });
  });

  it('pauses on a rejected login, keeps the row queued, and sends nothing more', async () => {
    const getList = vi.fn(() => Promise.reject(new BcpAuthError('Session expired')));
    const w = worker(withGetList(getList));
    await enqueueLists(db, EVENT, [ada, ben], 0);

    expect(await w.tick()).toBe('paused');
    expect(await w.tick()).toBe('paused');
    expect(getList).toHaveBeenCalledTimes(1);
    expect(await queueTotals(db)).toMatchObject({ queued: 2, fetching: 0, failed: 0 });
    expect(await w.state()).toMatchObject({ paused: true, pausedReason: 'login-rejected' });

    w.resume();
    expect((await w.state()).paused).toBe(false);
  });

  it('pauses on an auth error when the login check says the login is rejected', async () => {
    const getList = vi.fn(() => Promise.reject(new BcpAuthError('Session expired')));
    const loginRejected = vi.fn(() => Promise.resolve(true));
    const w = worker(withGetList(getList), undefined, loginRejected);
    await enqueueLists(db, EVENT, [ada, ben], 0);

    expect(await w.tick()).toBe('paused');
    expect(loginRejected).toHaveBeenCalledTimes(1);
    expect(await queueTotals(db)).toMatchObject({ queued: 2, fetching: 0, failed: 0 });
    expect(await w.state()).toMatchObject({ paused: true, pausedReason: 'login-rejected' });
  });

  it('backs off one list BCP refuses while the login works, and goes on with the next', async () => {
    let clock = new Date('2030-01-01T00:00:00Z');
    const getList = vi.fn((listId: string) =>
      listId === 'LS-ADA' ? Promise.reject(new BcpAuthError('Forbidden')) : source.getList(listId),
    );
    const w = worker(
      withGetList(getList),
      () => clock,
      () => Promise.resolve(false),
    );
    await enqueueLists(db, EVENT, [ada, ben], 0);

    expect(await w.tick()).toBe('retry');
    expect((await w.state()).paused).toBe(false);
    expect(await w.tick()).toBe('fetched');
    expect(await findPlayerList(db, 'PL-BEN')).not.toBeNull();

    clock = new Date(clock.getTime() + 61_000);
    expect(await w.tick()).toBe('retry');
    clock = new Date(clock.getTime() + 5 * 60_000 + 1000);
    expect(await w.tick()).toBe('failed');
    expect((await latestQueueRowsByPlayer(db, EVENT)).get('PL-ADA')).toMatchObject({
      status: 'failed',
      errorCode: 'BCP_AUTH',
    });
  });

  it('pauses until a BCP rate limit has passed, then resumes by itself', async () => {
    let clock = new Date('2030-01-01T00:00:00Z');
    let limited = true;
    const src = withGetList((listId) =>
      limited ? Promise.reject(new BcpRateLimitedError(30)) : source.getList(listId),
    );
    const w = worker(src, () => clock);
    await enqueueLists(db, EVENT, [ada], 0);

    expect(await w.tick()).toBe('paused');
    expect(await w.state()).toMatchObject({
      pausedReason: 'rate-limited',
      pausedUntil: '2030-01-01T00:00:30.000Z',
    });
    limited = false;
    clock = new Date(clock.getTime() + 31_000);
    expect(await w.tick()).toBe('fetched');
  });

  it('skips a tick while the previous one is still running', async () => {
    let release: (() => void) | undefined = undefined;
    const slow = withGetList((listId) =>
      new Promise((resolve) => {
        release = () => {
          resolve(source.getList(listId));
        };
      }).then((list) => list as Awaited<ReturnType<TournamentSource['getList']>>),
    );
    const w = worker(slow);
    await enqueueLists(db, EVENT, [ada, ben], 0);

    const first = w.tick();
    await vi.waitFor(() => {
      expect(release).not.toBe(undefined);
    });
    expect(await w.tick()).toBe('busy');
    // Cast through the declared type: TS narrows `release` (reassigned inside the Promise
    // executor) to `never` here otherwise -- a known control-flow-analysis limitation.
    (release as (() => void) | undefined)?.();
    expect(await first).toBe('fetched');
  });

  it('stops only once the tick in flight has finished', async () => {
    let release: (() => void) | undefined = undefined;
    const slow = withGetList((listId) =>
      new Promise((resolve) => {
        release = () => {
          resolve(source.getList(listId));
        };
      }).then((list) => list as Awaited<ReturnType<TournamentSource['getList']>>),
    );
    const w = worker(slow);
    await enqueueLists(db, EVENT, [ada], 0);

    const tick = w.tick();
    await vi.waitFor(() => {
      expect(release).not.toBe(undefined);
    });
    let stopped = false;
    const stopping = w.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stopped).toBe(false);

    (release as (() => void) | undefined)?.();
    await stopping;
    expect(await tick).toBe('fetched');
    expect(await findPlayerList(db, 'PL-ADA')).not.toBeNull();
    // Nothing in flight: stopping resolves right away.
    await w.stop();
  });

  it('puts rows interrupted by a restart back in the queue on start', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    // A previous process claimed the row, then stopped before finishing it.
    await claimNextJob(db, new Date(Date.now() + 1000));
    expect((await queueTotals(db)).fetching).toBe(1);

    const restarted = worker();
    await restarted.start();
    await restarted.stop();
    expect(await queueTotals(db)).toMatchObject({ queued: 1, fetching: 0 });
  });

  it('estimates the time until a queue or an event’s lists are done', async () => {
    await enqueueLists(db, EVENT, [ada, ben], 0);
    const w = worker();
    expect(await w.estimateSecondsFor()).toBe(10);
    expect(await w.estimateSecondsFor(EVENT)).toBe(10);
    expect(await w.estimateSecondsFor('OTHER')).toBeNull();
  });

  it('recovers from a tick that throws inside the interval, instead of an unhandled rejection', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    const claimSpy = vi
      .spyOn(fetchQueueRepo, 'claimNextJob')
      .mockRejectedValueOnce(new Error('boom'));
    const w = new FetchQueueWorker({ db, source, logger: silentLogger, intervalMs: 20 });
    try {
      await w.start();
      // The interval fires, the claim rejects, and start()'s setInterval callback must not let
      // that rejection go unhandled (it would otherwise crash the process on Node >= 15).
      await vi.waitFor(() => {
        expect(claimSpy).toHaveBeenCalled();
      });
      // The in-flight tick was cleared despite the failure, so the next tick (using the real claimNextJob)
      // goes on to fetch the row normally.
      await vi.waitFor(async () => {
        expect(await findPlayerList(db, 'PL-ADA')).not.toBeNull();
      });
    } finally {
      await w.stop();
      claimSpy.mockRestore();
    }
  });
});

describe('pairings jobs', () => {
  const BRACKET = 'EVTBRACKET01';

  async function catalogueOnly(eventId: string) {
    // In the catalogue but never synced: the round count comes from the event sync.
    await upsertEventSummaries(db, [await source.getEvent(eventId)]);
  }

  it('an event job syncs the event, then queues its rounds, which fetch the games', async () => {
    await catalogueOnly(BRACKET);
    await enqueueEventPairings(db, BRACKET, { rounds: null, priority: USER_WAITING_PRIORITY });
    const w = worker();

    expect(await w.tick()).toBe('fetched'); // the event job
    const rounds = await db
      .select({ round: fetchQueue.round, priority: fetchQueue.priority })
      .from(fetchQueue)
      .where(eq(fetchQueue.kind, 'pairings-round'))
      .orderBy(fetchQueue.id);
    expect(rounds).toEqual([
      { round: 1, priority: 10 },
      { round: 2, priority: 10 },
      { round: 3, priority: 10 },
    ]);

    await drainQueue(w);
    const [event] = await db.select().from(events).where(eq(events.id, BRACKET));
    expect(event?.pairingsSyncedAt).toBeInstanceOf(Date);
    expect(await db.select().from(games).where(eq(games.eventId, BRACKET))).toHaveLength(14);
  });

  it('stores matchups only when neither endpoint has games', async () => {
    await upsertEventDetail(db, await source.getEvent(BRACKET));
    await enqueueEventPairings(db, BRACKET, { rounds: [1], priority: 0 });
    const noGames: TournamentSource = {
      ...delegate(source),
      getEventGames: () => Promise.resolve([]),
    };
    expect(await worker(noGames).tick()).toBe('fetched');
    expect(await storedPairingsSummary(db, BRACKET)).toEqual({ rounds: 1, matchups: 3, games: 0 });
  });

  it('backs off a failing round job like a list', async () => {
    await upsertEventDetail(db, await source.getEvent(BRACKET));
    await enqueueEventPairings(db, BRACKET, { rounds: [1], priority: 0 });
    const failing: TournamentSource = {
      ...delegate(source),
      getTeamMatchups: () => Promise.reject(new BcpUnavailableError('BCP down')),
    };
    expect(await worker(failing).tick()).toBe('retry');
    const [row] = await db.select().from(fetchQueue);
    expect(row).toMatchObject({ status: 'queued', attempts: 1, error: 'BCP down' });
  });

  it('keeps a round job done when marking the event synced fails', async () => {
    await upsertEventDetail(db, await source.getEvent(BRACKET));
    await enqueueEventPairings(db, BRACKET, { rounds: [1], priority: 0 });
    const markSpy = vi
      .spyOn(fetchQueueRepo, 'markPairingsSyncedIfComplete')
      .mockRejectedValue(new Error('db hiccup'));
    try {
      expect(await worker().tick()).toBe('fetched');
    } finally {
      markSpy.mockRestore();
    }
    const [row] = await db.select().from(fetchQueue);
    expect(row).toMatchObject({ status: 'done', attempts: 1 });
  });

  it('queues the rounds before an event job counts as done', async () => {
    await catalogueOnly(BRACKET);
    await enqueueEventPairings(db, BRACKET, { rounds: null, priority: 0 });
    const statusWhenQueueing: string[] = [];
    const enqueueSpy = vi
      .spyOn(fetchQueueRepo, 'enqueueEventPairings')
      .mockImplementation(async () => {
        const [job] = await db.select().from(fetchQueue).where(eq(fetchQueue.kind, 'event'));
        statusWhenQueueing.push(job?.status ?? 'missing');
        throw new BcpUnavailableError('db hiccup');
      });
    try {
      expect(await worker().tick()).toBe('retry');
    } finally {
      enqueueSpy.mockRestore();
    }
    expect(statusWhenQueueing).toEqual(['fetching']);
    const [row] = await db.select().from(fetchQueue);
    expect(row).toMatchObject({ kind: 'event', status: 'queued', attempts: 1, finishedAt: null });
  });
});
