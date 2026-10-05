import type { MathhammerUnits, RulesStatus } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import type { RulesClient } from '../rules/client';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';
import { SAMPLE_HOME, sampleBundle } from '../test/rules-sample';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
});

const client: RulesClient = {
  homePage: () => Promise.resolve(SAMPLE_HOME),
  bundle: () => Promise.resolve(sampleBundle()),
};

const appWith = (rules?: RulesClient) => {
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
    now: () => new Date('2026-10-04T10:00:00Z'),
    ...(rules === undefined ? {} : { rules }),
  });
};

describe('rules routes', () => {
  it('answers the status, and reads 39k.pro on Refresh', async () => {
    const app = appWith(client);
    expect(await (await app.request('/api/rules')).json()).toMatchObject({
      readAt: null,
      counts: null,
    });
    const response = await app.request('/api/rules/refresh', { method: 'POST' });
    expect(response.status).toBe(200);
    const status = (await response.json()) as RulesStatus;
    expect(status.counts).toEqual({ factions: 3, datasheets: 4, weapons: 6 });
  });

  it('says when 39k.pro reading isn’t set up', async () => {
    expect((await appWith().request('/api/rules/refresh', { method: 'POST' })).status).toBe(404);
  });

  it('answers factions and a faction’s units once the data is read', async () => {
    const app = appWith(client);
    expect((await app.request('/api/mathhammer/factions')).status).toBe(404);
    await app.request('/api/rules/refresh', { method: 'POST' });
    expect(await (await app.request('/api/mathhammer/factions')).json()).toEqual({
      factions: [
        { faction: 'Orks', units: 2 },
        { faction: 'Space Marines (Astartes)', units: 2 },
      ],
    });
    const units = (await (
      await app.request('/api/mathhammer/units?faction=Orks')
    ).json()) as MathhammerUnits;
    expect(units.datasheets.map((d) => d.name)).toEqual(['Boyz', 'Warboss']);
    expect((await app.request('/api/mathhammer/units?faction=Nobody')).status).toBe(404);
  });
});
