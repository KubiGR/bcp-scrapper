import { MathhammerListSchema, MathhammerListsSchema } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import type { RulesClient } from '../rules/client';
import { syncEvent } from '../sync/jobs';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';
import { storeList } from '../test/lists';
import { SAMPLE_HOME, sampleBundle } from '../test/rules-sample';

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof createApp>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const source = sampleSource();
  const rules: RulesClient = {
    homePage: () => Promise.resolve(SAMPLE_HOME),
    bundle: () => Promise.resolve(sampleBundle()),
  };
  app = createApp({
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
    now: () => new Date('2026-10-04T10:00:00Z'),
    rules,
  });
  await app.request('/api/rules/refresh', { method: 'POST' });
});

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const LIST = `T (2000 points)

Space Marines
Gladius Task Force (3 Detachment Points)
Take and Hold
Strike Force (2000 points)

Intercessor Squad (80 points)
  • 1x Intercessor Sergeant
    • 1x Bolt rifle
  • 4x Intercessor
    • 4x Bolt rifle
`;

describe('Mathhammer list routes', () => {
  it('reads and matches a pasted list', async () => {
    const response = await post('/api/mathhammer/list', { text: LIST });
    expect(response.status).toBe(200);
    const list = MathhammerListSchema.parse(await response.json());
    expect(list.units[0]).toMatchObject({ label: 'Intercessor Squad ×5', datasheetId: 'ds-int' });
    expect(list.datasheets.map((d) => d.name)).toEqual(['Intercessor Squad']);
  });

  it('searches stored lists and opens one', async () => {
    await syncEvent({ db, source: sampleSource() }, 'EVTTEAM0001');
    await storeList(db, 'PL-ADA', LIST);
    const found = MathhammerListsSchema.parse(
      await (await app.request('/api/mathhammer/lists?search=ada')).json(),
    );
    expect(found.lists.map((l) => l.playerId)).toEqual(['PL-ADA']);
    const opened = await app.request('/api/mathhammer/lists/PL-ADA');
    expect(opened.status).toBe(200);
    expect(MathhammerListSchema.parse(await opened.json()).army).toBe('Space Marines (Astartes)');
    expect((await app.request('/api/mathhammer/lists/NOPE')).status).toBe(404);
  });

  it('refuses an empty or huge pasted list', async () => {
    expect((await post('/api/mathhammer/list', { text: '' })).status).toBe(400);
    expect((await post('/api/mathhammer/list', { text: 'x'.repeat(60_001) })).status).toBe(400);
  });
});
