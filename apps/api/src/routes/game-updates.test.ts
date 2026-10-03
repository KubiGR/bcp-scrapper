import type { GameUpdatesResponse, UpdateCommit } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createSession } from '../auth/sessions';
import type { BsdataClient } from '../bsdata/client';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';

let db: Db;
let close: () => Promise<void>;
const source = sampleSource();
const history: UpdateCommit[] = [
  { sha: 'b', day: '2026-07-22', message: 'Faction Pack changes' },
  { sha: 'a', day: '2026-06-09', message: 'MFM' },
];
const bsdata: BsdataClient = {
  commits: () => Promise.resolve(history),
  tree: () => Promise.resolve({ commit: 'c', files: [] }),
  file: () => Promise.resolve({}),
};
const appWith = (auth?: { required: boolean; secret: string }) =>
  createApp({
    db,
    runner: new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS }),
    fetchQueue: testFetchQueue(db, source),
    bcpStatus: () =>
      Promise.resolve({
        source: 'fixtures' as const,
        state: 'fixtures' as const,
        accessTokenExpiresAt: null,
        lastRefreshAt: null,
      }),
    logger: silentLogger,
    eventRule: ALL_EVENTS,
    now: () => new Date('2026-10-03T10:00:00Z'),
    bsdata,
    auth,
  });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
});

const patch = (
  app: ReturnType<typeof createApp>,
  id: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  app.request(`/api/updates/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('/api/updates', () => {
  it('lists the updates read with BSData, newest first, and edits one', async () => {
    const app = appWith();
    await app.request('/api/bsdata/refresh', { method: 'POST' });
    const listed = (await (await app.request('/api/updates')).json()) as GameUpdatesResponse;
    expect(listed.updates.map((u) => [u.id, u.name])).toEqual([
      ['b', 'Summer 2026 Faction Packs'],
      ['a', 'Edition launch'],
    ]);
    expect(listed.updates[0]?.suggestions).toContain('Update 2 · Jul 2026');
    const renamed = await patch(app, 'a', { name: 'Edition launch' });
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as GameUpdatesResponse).updates[1]?.name).toBe('Edition launch');
  });

  it('refuses a start out of order, an unknown update and a bad body', async () => {
    const app = appWith();
    await app.request('/api/bsdata/refresh', { method: 'POST' });
    expect((await patch(app, 'b', { start: '2026-06-01' })).status).toBe(400);
    expect((await patch(app, 'nope', { name: 'x' })).status).toBe(404);
    expect((await patch(app, 'a', { start: 'soon' })).status).toBe(400);
  });

  it('with logins on, only admins can edit', async () => {
    const secret = 's'.repeat(32);
    const app = appWith({ required: true, secret });
    const [member] = await db
      .insert(users)
      .values({ username: 'ana', passwordHash: 'x', role: 'member' })
      .returning();
    if (member === undefined) throw new Error('seed');
    const { token } = await createSession(db, secret, member.id, new Date());
    const response = await patch(
      app,
      'a',
      { name: 'x' },
      { cookie: `bcp_session=${token}`, host: 'localhost', origin: 'http://localhost' },
    );
    expect(response.status).toBe(403);
  });
});
