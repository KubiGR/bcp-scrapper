import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createSession } from '../auth/sessions';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { findEvent, upsertEventSummaries } from '../repo/events';
import { claimNextJob, enqueueLists, markJobFailed, queueTotals } from '../repo/fetch-queue';
import { syncEvent } from '../sync/jobs';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';

const EVENT = 'EVTTEAM0001';
let db: Db;
let close: () => Promise<void>;
const source = sampleSource();
const now = () => new Date('2026-04-20T12:00:00Z');

const makeApp = (auth?: { required: true; secret: string }) =>
  createApp({
    db,
    runner: new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS }),
    fetchQueue: testFetchQueue(db, source),
    bcpStatus: () =>
      Promise.resolve({
        source: 'fixtures',
        state: 'fixtures',
        accessTokenExpiresAt: null,
        lastRefreshAt: null,
      }),
    logger: silentLogger,
    eventRule: ALL_EVENTS,
    now,
    ...(auth ? { auth } : {}),
  });

const JSON_HEADERS = { 'content-type': 'application/json' };
const block = (app: ReturnType<typeof createApp>, id = EVENT) =>
  app.request(`/api/events/${id}/block`, { method: 'POST', headers: JSON_HEADERS, body: '{}' });
const unblock = (app: ReturnType<typeof createApp>, id = EVENT) =>
  app.request(`/api/events/${id}/block`, { method: 'DELETE' });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await upsertEventSummaries(
    db,
    (await source.listEvents({ from: '2026-01-01', to: '2026-12-31' }, null)).items,
  );
  await syncEvent({ db, source }, EVENT);
});

describe('blocking an event', () => {
  it('marks it blocked, drops its queued work and hides its failures', async () => {
    const app = makeApp();
    await enqueueLists(db, EVENT, [{ playerId: 'PL-ADA', listId: 'LS-ADA' }], 0);
    const claimed = await claimNextJob(db, new Date(Date.now() + 60_000));
    if (!claimed) throw new Error('nothing claimed');
    await markJobFailed(db, claimed.id, 'BCP down', 'BCP_UNAVAILABLE');
    await enqueueLists(db, EVENT, [{ playerId: 'PL-BEN', listId: 'LS-BEN' }], 0);

    const response = await block(app);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ blockedAt: now().toISOString(), cancelled: 1 });
    expect(await queueTotals(db)).toMatchObject({ queued: 0, failed: 0 });

    const detail = await (await app.request(`/api/events/${EVENT}`)).json();
    expect(detail).toMatchObject({
      blockedAt: now().toISOString(),
      stale: false,
      counts: { listsFailed: 0 },
      pairings: { failed: 0, failedRounds: [], loadFailed: false },
    });
  });

  it('refuses to queue its lists or pairings by hand, saying it is blocked', async () => {
    const app = makeApp();
    await block(app);
    for (const path of ['lists/queue', 'pairings/queue']) {
      const response = await app.request(`/api/events/${EVENT}/${path}`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: '{}',
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: 'EVENT_BLOCKED' } });
    }
  });

  it('skips it in the cross-event pairings queueing', async () => {
    const app = makeApp();
    await block(app);
    const response = await app.request('/api/pairings-queue', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ eventIds: [EVENT] }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ events: 0, queuedRounds: 0 });
  });

  it('stays blocked through a catalogue sync; unblocking makes it fetchable again', async () => {
    const app = makeApp();
    await block(app);
    await upsertEventSummaries(
      db,
      (await source.listEvents({ from: '2026-01-01', to: '2026-12-31' }, null)).items,
    );
    expect((await findEvent(db, EVENT))?.blockedAt).toBeInstanceOf(Date);

    const response = await unblock(app);
    expect(response.status).toBe(200);
    expect((await findEvent(db, EVENT))?.blockedAt).toBeNull();
    const queued = await app.request(`/api/events/${EVENT}/pairings/queue`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: '{}',
    });
    expect(queued.status).toBe(200);
  });

  it('answers 404 for an event not in the catalogue', async () => {
    expect((await block(makeApp(), 'NOPE')).status).toBe(404);
  });

  it('with logins on, only admins can block or unblock', async () => {
    const secret = 's'.repeat(32);
    const app = makeApp({ required: true, secret });
    const [member, admin] = await db
      .insert(users)
      .values([
        { username: 'ana', passwordHash: 'x', role: 'member' },
        { username: 'kubi', passwordHash: 'x', role: 'admin' },
      ])
      .returning();
    if (member === undefined || admin === undefined) throw new Error('seed');
    const as = async (userId: number, method: 'POST' | 'DELETE') => {
      const { token } = await createSession(db, secret, userId, now());
      return app.request(`/api/events/${EVENT}/block`, {
        method,
        headers: {
          ...JSON_HEADERS,
          cookie: `bcp_session=${token}`,
          host: 'localhost',
          origin: 'http://localhost',
        },
        ...(method === 'POST' ? { body: '{}' } : {}),
      });
    };
    expect((await as(member.id, 'POST')).status).toBe(403);
    expect((await as(admin.id, 'POST')).status).toBe(200);
    expect((await as(member.id, 'DELETE')).status).toBe(403);
    expect((await as(admin.id, 'DELETE')).status).toBe(200);
  });
});
