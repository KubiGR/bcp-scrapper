import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BcpSource } from '../bcp/source';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { BcpAuthError, BcpRateLimitedError, BcpUnavailableError } from '../errors';
import { upsertEventDetail } from '../repo/events';
import * as listQueueRepo from '../repo/list-queue';
import {
  claimNextList,
  enqueueLists,
  latestQueueRowsByPlayer,
  NO_LIST_CODE,
  queueTotals,
  SINGLE_LIST_PRIORITY,
} from '../repo/list-queue';
import { findPlayerList } from '../repo/lists';
import { upsertPlayers } from '../repo/participants';
import { sampleSource, silentLogger } from '../test/helpers';
import { ListQueueWorker } from './worker';

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

/** The sample source, with getList replaced. */
function withGetList(getList: BcpSource['getList']): BcpSource {
  // The worker only calls getList, so the other (private-field) methods are never reached.
  return Object.assign(Object.create(source) as BcpSource, { getList });
}

function worker(src: BcpSource = source, now = () => new Date()) {
  return new ListQueueWorker({ db, source: src, logger: silentLogger, intervalMs: 5000, now });
}

const ada = { playerId: 'PL-ADA', listId: 'LS-ADA' };
const ben = { playerId: 'PL-BEN', listId: 'LS-BEN' };

describe('ListQueueWorker', () => {
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
    expect(await queueTotals(db)).toEqual({ queued: 0, fetching: 0, failed: 0 });
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
    expect(await queueTotals(db)).toEqual({ queued: 0, fetching: 0, failed: 1 });
  });

  it('pauses on a rejected login, keeps the row queued, and sends nothing more', async () => {
    const getList = vi.fn(() => Promise.reject(new BcpAuthError('Session expired')));
    const w = worker(withGetList(getList));
    await enqueueLists(db, EVENT, [ada, ben], 0);

    expect(await w.tick()).toBe('paused');
    expect(await w.tick()).toBe('paused');
    expect(getList).toHaveBeenCalledTimes(1);
    expect(await queueTotals(db)).toEqual({ queued: 2, fetching: 0, failed: 0 });
    expect(await w.state()).toMatchObject({ paused: true, pausedReason: 'login-rejected' });

    w.resume();
    expect((await w.state()).paused).toBe(false);
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
      }).then((list) => list as Awaited<ReturnType<BcpSource['getList']>>),
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

  it('puts rows interrupted by a restart back in the queue on start', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    // A previous process claimed the row, then stopped before finishing it.
    await claimNextList(db, new Date(Date.now() + 1000));
    expect((await queueTotals(db)).fetching).toBe(1);

    const restarted = worker();
    await restarted.start();
    restarted.stop();
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
      .spyOn(listQueueRepo, 'claimNextList')
      .mockRejectedValueOnce(new Error('boom'));
    const w = new ListQueueWorker({ db, source, logger: silentLogger, intervalMs: 20 });
    try {
      await w.start();
      // The interval fires, the claim rejects, and start()'s setInterval callback must not let
      // that rejection go unhandled (it would otherwise crash the process on Node >= 15).
      await vi.waitFor(() => {
        expect(claimSpy).toHaveBeenCalled();
      });
      // #ticking was reset despite the failure, so the next tick (using the real claimNextList)
      // goes on to fetch the row normally.
      await vi.waitFor(async () => {
        expect(await findPlayerList(db, 'PL-ADA')).not.toBeNull();
      });
    } finally {
      w.stop();
      claimSpy.mockRestore();
    }
  });
});
