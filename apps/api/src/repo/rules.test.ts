import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import type { RulesClient } from '../rules/client';
import { SAMPLE_HOME, sampleBundle, sampleTables } from '../test/rules-sample';
import { loadUnits, rulesDue, rulesStatus, syncRules } from './rules';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
});

const NOW = new Date('2026-10-04T10:00:00Z');
const LATER = new Date('2026-10-05T10:00:00Z');

/** A fake 39k.pro whose home page names `script`; counts bundle downloads. */
function fakeSite(script = '/assets/index-aaa.js', bundle = sampleBundle()) {
  const downloads: string[] = [];
  const client: RulesClient = {
    homePage: () => Promise.resolve(SAMPLE_HOME.replace('/assets/index-47cf0977.js', script)),
    bundle: (url) => {
      downloads.push(url);
      return Promise.resolve(bundle);
    },
  };
  return { client, downloads };
}

describe('syncRules', () => {
  it('reads the rules, stores them and says what it has', async () => {
    const status = await syncRules(db, fakeSite().client, NOW);
    expect(status).toEqual({
      checkedAt: NOW.toISOString(),
      readAt: NOW.toISOString(),
      bundle: 'https://39k.pro/assets/index-aaa.js',
      dataVersion: 972,
      counts: { factions: 3, datasheets: 5, weapons: 6 },
      error: null,
    });
    const loaded = await loadUnits(db);
    expect(loaded?.readAt.toISOString()).toBe(NOW.toISOString());
    expect(loaded?.data.datasheets.map((d) => d.name)).toEqual([
      'Intercessor Squad',
      'Captain',
      'Boyz',
      'Warboss',
      'Gretchin',
    ]);
  });

  it('skips a script it has already read', async () => {
    const site = fakeSite();
    await syncRules(db, site.client, NOW);
    const status = await syncRules(db, site.client, LATER);
    expect(site.downloads).toHaveLength(1);
    expect(status.readAt).toBe(NOW.toISOString());
    expect(status.checkedAt).toBe(LATER.toISOString());
  });

  it('reads the same script again when the way rules are read changed', async () => {
    const site = fakeSite();
    await syncRules(db, site.client, NOW, 0);
    await syncRules(db, site.client, LATER, 0);
    expect(site.downloads).toHaveLength(1);
    const status = await syncRules(db, site.client, LATER, 1);
    expect(site.downloads).toHaveLength(2);
    expect(status.readAt).toBe(LATER.toISOString());
  });

  it('keeps the old rules when a new script can’t be read, and says why', async () => {
    await syncRules(db, fakeSite().client, NOW);
    const status = await syncRules(
      db,
      fakeSite('/assets/index-bbb.js', 'nothing here').client,
      LATER,
    );
    expect(status.error).toMatch(/No rules data/);
    expect(status.readAt).toBe(NOW.toISOString());
    expect((await loadUnits(db))?.data.datasheets).toHaveLength(5);
  });

  it('records a failed download, and clears the error once a read works', async () => {
    const down: RulesClient = {
      homePage: () => Promise.reject(new Error('39k.pro answered 503')),
      bundle: () => Promise.reject(new Error('unused')),
    };
    expect((await syncRules(db, down, NOW)).error).toBe('39k.pro answered 503');
    expect((await syncRules(db, fakeSite().client, LATER)).error).toBeNull();
  });

  it('picks up a new script with new data', async () => {
    await syncRules(db, fakeSite().client, NOW);
    const tables = sampleTables();
    const datasheets = tables.datasheet ?? [];
    tables.datasheet = datasheets.map((row) =>
      (row as { id: string }).id === 'ds-boss'
        ? { ...(row as object), localisations: { en: { name: 'Big Boss' } } }
        : row,
    );
    await syncRules(db, fakeSite('/assets/index-ccc.js', sampleBundle(tables)).client, LATER);
    expect((await loadUnits(db))?.data.datasheets.map((d) => d.name)).toContain('Big Boss');
  });
});

describe('rulesStatus and rulesDue', () => {
  it('knows nothing before the first read', async () => {
    expect(await rulesStatus(db)).toEqual({
      checkedAt: null,
      readAt: null,
      bundle: null,
      dataVersion: null,
      counts: null,
      error: null,
    });
    expect(await loadUnits(db)).toBeNull();
  });

  it('is due when never checked or checked a day ago', async () => {
    expect(await rulesDue(db, NOW)).toBe(true);
    await syncRules(db, fakeSite().client, NOW);
    expect(await rulesDue(db, new Date('2026-10-05T09:59:00Z'))).toBe(false);
    expect(await rulesDue(db, LATER)).toBe(true);
  });

  it('is due at once when the rules were read the old way', async () => {
    await syncRules(db, fakeSite().client, NOW, 0);
    expect(await rulesDue(db, new Date('2026-10-04T11:00:00Z'))).toBe(true);
  });
});
