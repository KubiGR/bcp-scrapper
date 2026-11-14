import type { GameUpdatesResponse, UpdateCommit } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createSession } from '../auth/sessions';
import type { Db } from '../db/client';
import { bsdataCommits, users } from '../db/schema';
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
    auth,
  });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  // BSData's history as stored before its takedown.
  await db.insert(bsdataCommits).values(history);
});

const send = (
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
  it('lists BSData’s updates, newest first, and edits one', async () => {
    const app = appWith();
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
    expect((await patch(app, 'b', { start: '2026-06-01' })).status).toBe(400);
    expect((await patch(app, 'nope', { name: 'x' })).status).toBe(404);
    expect((await patch(app, 'a', { start: 'soon' })).status).toBe(400);
  });

  it('adds an update by hand, refuses one clashing with another’s start, and deletes it', async () => {
    const app = appWith();
    const added = await send(app, 'POST', '/api/updates', {
      name: 'Balance Dataslate',
      start: '2026-09-15',
    });
    expect(added.status).toBe(200);
    const [first] = ((await added.json()) as GameUpdatesResponse).updates;
    expect(first).toMatchObject({ name: 'Balance Dataslate', added: true });
    expect(
      (await send(app, 'POST', '/api/updates', { name: 'Clash', start: '2026-07-22' })).status,
    ).toBe(400);
    expect(
      (await send(app, 'POST', '/api/updates', { name: '', start: '2026-10-01' })).status,
    ).toBe(400);
    expect((await send(app, 'DELETE', '/api/updates/a')).status).toBe(404);
    const deleted = await send(app, 'DELETE', `/api/updates/${first?.id ?? ''}`);
    expect(((await deleted.json()) as GameUpdatesResponse).updates.map((u) => u.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('with logins on, only admins can change them', async () => {
    const secret = 's'.repeat(32);
    const app = appWith({ required: true, secret });
    const [member] = await db
      .insert(users)
      .values({ username: 'ana', passwordHash: 'x', role: 'member' })
      .returning();
    if (member === undefined) throw new Error('seed');
    const { token } = await createSession(db, secret, member.id, new Date());
    const headers = {
      cookie: `bcp_session=${token}`,
      host: 'localhost',
      origin: 'http://localhost',
    };
    expect((await patch(app, 'a', { name: 'x' }, headers)).status).toBe(403);
    const body = { name: 'x', start: '2026-10-01' };
    expect((await send(app, 'POST', '/api/updates', body, headers)).status).toBe(403);
    expect((await send(app, 'DELETE', '/api/updates/a', undefined, headers)).status).toBe(403);
  });
});
