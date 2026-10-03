import type { BsdataStatus } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { BsdataClient } from '../bsdata/client';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
});

const necrons = {
  catalogue: {
    id: 'nec',
    name: 'Xenos - Necrons',
    entryLinks: [{ name: 'Detachment', targetId: 'nec-entry' }],
    sharedSelectionEntries: [
      {
        id: 'nec-entry',
        name: 'Detachment',
        selectionEntries: [{ name: 'Awakened Dynasty' }, { name: 'Canoptek Court' }],
      },
    ],
  },
};
const client: BsdataClient = {
  commits: () => Promise.resolve([]),
  tree: () => Promise.resolve({ commit: 'c1', files: [{ path: 'Necrons.json', sha: 'a' }] }),
  file: () => Promise.resolve(necrons),
};

const appWith = (bsdata?: BsdataClient) => {
  const source = sampleSource();
  return createApp({
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
    now: () => new Date('2026-10-03T10:00:00Z'),
    ...(bsdata === undefined ? {} : { bsdata }),
  });
};

describe('BSData routes', () => {
  it('answers the status, and refreshes from BSData', async () => {
    const app = appWith(client);
    expect(await (await app.request('/api/bsdata')).json()).toEqual({
      checkedAt: null,
      factions: [],
      errors: [],
    });
    const response = await app.request('/api/bsdata/refresh', { method: 'POST' });
    expect(response.status).toBe(200);
    const status = (await response.json()) as BsdataStatus;
    expect(status.factions).toEqual([{ faction: 'Necrons', detachments: 2 }]);
  });

  it('says when BSData isn’t set up', async () => {
    expect((await appWith().request('/api/bsdata/refresh', { method: 'POST' })).status).toBe(404);
  });
});
