import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { fetchQueue } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { upsertEventSummaries } from '../repo/events';
import { enqueueLists } from '../repo/fetch-queue';
import { syncEvent } from '../sync/jobs';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';
import { AutoFetchPlanner } from '../fetch-queue/auto-fetch';
import { createSession } from '../auth/sessions';
import { users } from '../db/schema';

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof createApp>;
const source = sampleSource();
const now = () => new Date('2026-04-20T12:00:00Z');

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
  await syncEvent({ db, source }, 'EVTTEAM0001');
  const runner = new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS });
  app = createApp({
    db,
    runner,
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
    autoFetch: new AutoFetchPlanner({
      db,
      runner,
      logger: silentLogger,
      eventRule: ALL_EVENTS,
      days: 60,
      intervalMs: 600_000,
      catalogIntervalMs: 21_600_000,
      now,
    }),
  });
});

const post = (enabled: unknown) =>
  app.request('/api/auto-fetch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });

describe('/api/auto-fetch', () => {
  it('is on by default', async () => {
    const response = await app.request('/api/auto-fetch');
    expect(await response.json()).toEqual({ enabled: true, lastPlannedAt: null, eventsPending: 0 });
  });

  it('switching off drops queued automatic jobs but keeps the user’s', async () => {
    await enqueueLists(db, 'EVTTEAM0001', [{ playerId: 'PL-ADA', listId: 'LS-ADA' }], -10, 'auto');
    await enqueueLists(db, 'EVTTEAM0001', [{ playerId: 'PL-BEN', listId: 'LS-BEN' }], 0);
    const response = await post(false);
    expect(await response.json()).toMatchObject({ enabled: false, eventsPending: 0 });
    expect((await db.select().from(fetchQueue)).map((j) => j.playerId)).toEqual(['PL-BEN']);
  });

  it('switching on plans straight away', async () => {
    await post(false);
    const response = await post(true);
    expect(response.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const state = (await (await app.request('/api/auto-fetch')).json()) as {
      eventsPending: number;
    };
    expect(state.eventsPending).toBeGreaterThan(0);
  });

  it('validates its input', async () => {
    expect((await post('yes')).status).toBe(400);
  });

  it('shows automatic work apart from the user’s in the queue state', async () => {
    await enqueueLists(db, 'EVTTEAM0001', [{ playerId: 'PL-ADA', listId: 'LS-ADA' }], -10, 'auto');
    const state = (await (await app.request('/api/fetch-queue')).json()) as {
      totals: { queued: number };
      auto: { jobs: number; events: number; enabled: boolean };
    };
    expect(state.totals.queued).toBe(0);
    expect(state.auto).toEqual({ jobs: 1, events: 1, enabled: true });
  });

  it('with logins on, only admins can switch it', async () => {
    const secret = 's'.repeat(32);
    const withAuth = createApp({
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
      auth: { required: true, secret },
    });
    const [member, admin] = await db
      .insert(users)
      .values([
        { username: 'ana', passwordHash: 'x', role: 'member' },
        { username: 'kubi', passwordHash: 'x', role: 'admin' },
      ])
      .returning();
    if (member === undefined || admin === undefined) throw new Error('seed');
    const as = async (userId: number) => {
      const { token } = await createSession(db, secret, userId, now());
      return withAuth.request('/api/auto-fetch', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `bcp_session=${token}`,
          host: 'localhost',
          origin: 'http://localhost',
        },
        body: JSON.stringify({ enabled: false }),
      });
    };
    expect((await as(member.id)).status).toBe(403);
    expect((await as(admin.id)).status).toBe(200);
  });
});
