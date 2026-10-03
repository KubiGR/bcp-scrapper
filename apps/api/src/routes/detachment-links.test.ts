import type { DetachmentNamesResponse } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createSession } from '../auth/sessions';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';
import { gwList, storeList } from '../test/lists';

let db: Db;
let close: () => Promise<void>;
const source = sampleSource();
const deps = (auth?: { required: boolean; secret: string }) => ({
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
  auth,
});

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await syncEvent({ db, source }, 'EVTTEAM0001');
  await storeList(db, 'PL-ADA', gwList('Chaos Daemons', 'Hellrider Cavalcade'));
  await storeList(db, 'PL-BEN', gwList('Chaos Daemons', 'Shadow Legion'), 'Shadow Legion');
});

const post = (
  app: ReturnType<typeof createApp>,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  app.request('/api/detachments/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('/api/detachments', () => {
  it('lists unsure names and links one', async () => {
    const app = createApp(deps());
    const before = (await (
      await app.request('/api/detachments')
    ).json()) as DetachmentNamesResponse;
    expect(before.unsure.map((u) => u.name)).toEqual(['Hellrider Cavalcade']);
    const response = await post(app, { name: 'Hellrider Cavalcade', target: 'Shadow Legion' });
    expect(response.status).toBe(200);
    const after = (await response.json()) as DetachmentNamesResponse;
    expect(after.unsure).toEqual([]);
    const undo = await app.request(
      `/api/detachments/links/${encodeURIComponent('Hellrider Cavalcade')}`,
      { method: 'DELETE' },
    );
    expect(((await undo.json()) as DetachmentNamesResponse).unsure.map((u) => u.name)).toEqual([
      'Hellrider Cavalcade',
    ]);
  });

  it('marks a name as not English', async () => {
    const app = createApp(deps());
    const response = await post(app, { name: 'Hellrider Cavalcade', target: null, foreign: true });
    expect(response.status).toBe(200);
    const after = (await response.json()) as DetachmentNamesResponse;
    expect(after.unsure).toEqual([]);
    expect(after.foreign.map((f) => [f.name, f.marked])).toEqual([['Hellrider Cavalcade', true]]);
  });

  it('keeps a detachment for a faction anyway, and undoes it', async () => {
    const app = createApp(deps());
    const keep = (method: string, body: unknown) =>
      app.request('/api/detachments/keeps', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const kept = await keep('POST', { faction: 'Chaos Daemons', name: 'Hellrider Cavalcade' });
    expect(kept.status).toBe(200);
    expect(((await kept.json()) as DetachmentNamesResponse).kept).toEqual([
      { faction: 'Chaos Daemons', name: 'Hellrider Cavalcade' },
    ]);
    const undone = await keep('DELETE', { faction: 'Chaos Daemons', name: 'Hellrider Cavalcade' });
    expect(((await undone.json()) as DetachmentNamesResponse).kept).toEqual([]);
    expect((await keep('POST', { faction: '', name: 'X' })).status).toBe(400);
  });

  it('validates the request', async () => {
    const app = createApp(deps());
    expect((await post(app, { name: '', target: null })).status).toBe(400);
    expect((await post(app, { name: 'X' })).status).toBe(400);
    // A name that isn't English is left as it is: it can't also mean another detachment.
    expect((await post(app, { name: 'X', target: 'Y', foreign: true })).status).toBe(400);
  });

  it('with logins on, only admins can link', async () => {
    const secret = 's'.repeat(32);
    const app = createApp(deps({ required: true, secret }));
    const [member] = await db
      .insert(users)
      .values({ username: 'ana', passwordHash: 'x', role: 'member' })
      .returning();
    if (member === undefined) throw new Error('seed');
    const { token } = await createSession(db, secret, member.id, new Date());
    const response = await post(
      app,
      { name: 'Hellrider Cavalcade', target: null },
      { cookie: `bcp_session=${token}`, host: 'localhost', origin: 'http://localhost' },
    );
    expect(response.status).toBe(403);
  });
});
