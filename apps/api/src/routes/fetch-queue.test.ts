import type {
  BcpStatus,
  EventDetail,
  EventPlayersResponse,
  FetchQueueState,
  QueueListsResult,
  QueuePairingsResult,
} from '@bcp/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { players } from '../db/schema';
import { upsertEventSummaries } from '../repo/events';
import { claimNextJob, markJobFailed } from '../repo/fetch-queue';
import { createTestDb, resetDb } from '../db/test-db';
import type { FetchQueueWorker } from '../fetch-queue/worker';
import { SyncRunner } from '../sync/runner';
import {
  ALL_EVENTS,
  drainQueue,
  sampleSource,
  silentLogger,
  testFetchQueue,
} from '../test/helpers';

const EVENT = 'EVTTEAM0001';
let db: Db;
let close: () => Promise<void>;
let status: BcpStatus;
let fetchQueue: FetchQueueWorker;
let app: ReturnType<typeof createApp>;

function build(source: TournamentSource = sampleSource()) {
  fetchQueue = testFetchQueue(db, source);
  app = createApp({
    db,
    runner: new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS }),
    fetchQueue,
    bcpStatus: () => Promise.resolve(status),
    logger: silentLogger,
    eventRule: ALL_EVENTS,
  });
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  status = {
    source: 'fixtures',
    state: 'fixtures',
    accessTokenExpiresAt: null,
    lastRefreshAt: null,
  };
  build();
});

const send = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async <T>(response: Response) => (await response.json()) as T;
const queue = async (body: object) =>
  json<QueueListsResult>(await send('POST', `/api/events/${EVENT}/lists/queue`, body));
const playersOf = async () =>
  (await json<EventPlayersResponse>(await app.request(`/api/events/${EVENT}/players`))).items;

describe('fetch queue routes', () => {
  it('queues every missing list, loading the event first; queueing again is a no-op', async () => {
    expect(await queue({})).toEqual({
      queued: 7,
      alreadyQueued: 0,
      alreadyFetched: 0,
      noListOnBcp: 1,
      notQualifying: 0,
      estimatedSeconds: 35,
    });
    expect(await queue({})).toMatchObject({ queued: 0, alreadyQueued: 7 });

    const detail = await json<EventDetail>(await app.request(`/api/events/${EVENT}`));
    expect(detail).toMatchObject({
      counts: { listsQueued: 7, listsFailed: 0 },
      queueSeconds: 35,
    });
    expect((await playersOf()).find((p) => p.bcpId === 'PL-ADA')).toMatchObject({
      listStatus: 'queued',
      listError: null,
    });
  });

  it('queues only players within a loss limit (draws are not losses)', async () => {
    // Round results: Finn 2-0-0, Ada 2-0-0, Dan 0-0-2 qualify for X-0; Cara, Gia, Ben, Eve don't.
    expect(await queue({ maxLosses: 0 })).toMatchObject({ queued: 3, notQualifying: 4 });
    expect(await queue({ maxLosses: 1 })).toMatchObject({ queued: 3, alreadyQueued: 3 });
  });

  it('queues a single list ahead of the rest, and it arrives when the worker runs', async () => {
    await queue({});
    expect(await queue({ playerIds: ['PL-EVE'] })).toMatchObject({ queued: 0, alreadyQueued: 1 });
    await fetchQueue.tick();
    expect((await playersOf()).find((p) => p.bcpId === 'PL-EVE')?.listStatus).toBe('fetched');
  });

  it('validates the request', async () => {
    expect(
      (await send('POST', `/api/events/${EVENT}/lists/queue`, { playerIds: ['NOPE'] })).status,
    ).toBe(400);
    expect(
      (
        await send('POST', `/api/events/${EVENT}/lists/queue`, {
          maxLosses: 1,
          playerIds: ['PL-ADA'],
        })
      ).status,
    ).toBe(400);
    expect((await send('POST', '/api/events/NOPE/lists/queue', {})).status).toBe(404);
    expect((await send('POST', '/api/sync', { kind: 'lists', eventId: EVENT })).status).toBe(400);
  });

  it('shows a list BCP replaced after it was stored as available again', async () => {
    await queue({ playerIds: ['PL-ADA'] });
    await drainQueue(fetchQueue);
    await db.update(players).set({ listId: 'LS-ADA-2' }).where(eq(players.id, 'PL-ADA'));

    expect((await playersOf()).find((p) => p.bcpId === 'PL-ADA')?.listStatus).toBe('available');
    const detail = await json<EventDetail>(await app.request(`/api/events/${EVENT}`));
    expect(detail.counts.listsMissing).toBe(7);
  });

  it('treats "no list on BCP" as final: shown as failed, not counted, not requeued', async () => {
    const source = sampleSource();
    // Everything as the fixtures, except Eve's list is gone from BCP.
    const noEveList: TournamentSource = {
      listEvents: (range, cursor) => source.listEvents(range, cursor),
      getEvent: (id) => source.getEvent(id),
      getPlayers: (id) => source.getPlayers(id),
      getTeams: (id) => source.getTeams(id),
      getTeamMatchups: (id, round) => source.getTeamMatchups(id, round),
      getGames: (id, round) => source.getGames(id, round),
      getEventGames: (id, round) => source.getEventGames(id, round),
      getList: (listId) => (listId === 'LS-EVE' ? Promise.resolve(null) : source.getList(listId)),
    };
    build(noEveList);
    await queue({ playerIds: ['PL-EVE'] });
    await drainQueue(fetchQueue);

    expect((await playersOf()).find((p) => p.bcpId === 'PL-EVE')).toMatchObject({
      listStatus: 'failed',
      listError: 'No list on BCP',
      listErrorCode: 'NO_LIST',
    });
    expect(
      (await json<EventDetail>(await app.request(`/api/events/${EVENT}`))).counts.listsFailed,
    ).toBe(0);
    expect((await json<FetchQueueState>(await app.request('/api/fetch-queue'))).totals.failed).toBe(
      0,
    );
    // Retry-failed leaves it alone, and so does queueing the event's missing lists again...
    expect(
      await json(await send('POST', '/api/fetch-queue/retry-failed', { eventId: EVENT })),
    ).toEqual({ requeued: 0 });
    expect(await queue({})).toMatchObject({ queued: 6, noListOnBcp: 2 });
    expect((await playersOf()).find((p) => p.bcpId === 'PL-EVE')?.listStatus).toBe('failed');
    // ...but asking for that one list again does queue it.
    expect(await queue({ playerIds: ['PL-EVE'] })).toMatchObject({ queued: 1 });
  });

  it('retries a retryable failure on request, and the worker then fetches it', async () => {
    await queue({ playerIds: ['PL-ADA'] });
    const claimed = await claimNextJob(db, new Date(Date.now() + 60_000));
    if (!claimed) throw new Error('nothing claimed');
    await markJobFailed(db, claimed.id, 'BCP is unavailable', 'BCP_UNAVAILABLE');
    expect((await playersOf()).find((p) => p.bcpId === 'PL-ADA')).toMatchObject({
      listStatus: 'failed',
      listErrorCode: 'BCP_UNAVAILABLE',
    });
    expect(
      (await json<EventDetail>(await app.request(`/api/events/${EVENT}`))).counts.listsFailed,
    ).toBe(1);
    expect((await json<FetchQueueState>(await app.request('/api/fetch-queue'))).totals.failed).toBe(
      1,
    );

    expect(
      await json(await send('POST', '/api/fetch-queue/retry-failed', { eventId: EVENT })),
    ).toEqual({ requeued: 1 });
    expect((await playersOf()).find((p) => p.bcpId === 'PL-ADA')?.listStatus).toBe('queued');
    await drainQueue(fetchQueue);
    expect((await playersOf()).find((p) => p.bcpId === 'PL-ADA')?.listStatus).toBe('fetched');
  });

  it('cancels an event’s queued lists', async () => {
    await queue({});
    expect(await json(await send('DELETE', `/api/events/${EVENT}/lists/queue`))).toEqual({
      removed: 7,
    });
    expect((await json<FetchQueueState>(await app.request('/api/fetch-queue'))).totals.queued).toBe(
      0,
    );
  });

  it('pauses and resumes, but refuses to resume while BCP rejects the login', async () => {
    expect(
      await json<FetchQueueState>(await send('POST', '/api/fetch-queue/pause', {})),
    ).toMatchObject({
      paused: true,
      pausedReason: 'user',
    });
    expect(
      (await json<FetchQueueState>(await send('POST', '/api/fetch-queue/resume', {}))).paused,
    ).toBe(false);

    fetchQueue.pause('login-rejected');
    status = { ...status, source: 'bcp', state: 'rejected' };
    const refused = await send('POST', '/api/fetch-queue/resume', {});
    expect(refused.status).toBe(502);
    expect(await refused.json()).toMatchObject({ error: { code: 'BCP_AUTH' } });

    status = { ...status, state: 'connected' };
    expect(
      (await json<FetchQueueState>(await send('POST', '/api/fetch-queue/resume', {}))).paused,
    ).toBe(false);
  });
});

describe('pairings queue route', () => {
  const BRACKET = 'EVTBRACKET01';

  it('queues a never-synced event, and the worker fetches all its rounds', async () => {
    await upsertEventSummaries(db, [await sampleSource().getEvent(BRACKET)]);
    const queued = await json<QueuePairingsResult>(
      await send('POST', `/api/events/${BRACKET}/pairings/queue`, {}),
    );
    expect(queued).toEqual({ eventQueued: true, queuedRounds: 0, estimatedSeconds: 5 });

    await drainQueue(fetchQueue);
    const detail = await json<EventDetail>(await app.request(`/api/events/${BRACKET}`));
    expect(detail.pairings).toMatchObject({
      roundCount: 3,
      roundsDone: 3,
      queued: 0,
      failed: 0,
      gamesAvailable: true,
    });
    expect(detail.pairings.syncedAt).not.toBeNull();
  });

  it('queues each round of a synced event once', async () => {
    await send('POST', `/api/events/${EVENT}/lists/queue`, {}); // loads EVENT's players
    const first = await json<QueuePairingsResult>(
      await send('POST', `/api/events/${EVENT}/pairings/queue`, {}),
    );
    expect(first.queuedRounds).toBe(2);
    const again = await json<QueuePairingsResult>(
      await send('POST', `/api/events/${EVENT}/pairings/queue`, {}),
    );
    expect(again.queuedRounds).toBe(0);
    expect(
      (await json<EventDetail>(await app.request(`/api/events/${EVENT}`))).pairings.queued,
    ).toBe(2);
  });

  it('404s an unknown event and rejects the retired pairings sync kind', async () => {
    expect((await send('POST', '/api/events/NOPE/pairings/queue', {})).status).toBe(404);
    expect((await send('POST', '/api/sync', { kind: 'pairings', eventId: EVENT })).status).toBe(
      400,
    );
  });
});
