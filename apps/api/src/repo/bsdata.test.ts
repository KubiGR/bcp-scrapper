import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BsdataClient } from '../bsdata/client';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { bsdataByFaction, bsdataDue, bsdataStatus, syncBsdata } from './bsdata';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
});

const NOW = new Date('2026-10-03T10:00:00Z');
const entry = (name: string) => ({ name, id: `e-${name}` });
/** A catalogue whose root link goes entry → group → detachments (as Orks does). */
const catalogue = (id: string, name: string, detachments: string[]) => ({
  catalogue: {
    id,
    name,
    library: false,
    entryLinks: [{ name: 'Detachment', type: 'selectionEntry', targetId: `${id}-entry` }],
    sharedSelectionEntries: [
      {
        id: `${id}-entry`,
        name: 'Detachment',
        entryLinks: [{ name: 'Detachment', type: 'selectionEntryGroup', targetId: `${id}-group` }],
      },
    ],
    sharedSelectionEntryGroups: [
      { id: `${id}-group`, name: 'Detachment', selectionEntries: detachments.map(entry) },
    ],
  },
});
const necrons = (...names: string[]) => catalogue('nec', 'Xenos - Necrons', names);
const orks = catalogue('ork', 'Xenos - Orks', ['War Horde']);

const fakeClient = (files: Record<string, { sha: string; body: unknown }>) => {
  const fetched: string[] = [];
  const client: BsdataClient = {
    commits: () => Promise.resolve([]),
    tree: () =>
      Promise.resolve({
        commit: 'c1',
        files: Object.entries(files).map(([path, { sha }]) => ({ path, sha })),
      }),
    file: (_commit, path) => {
      fetched.push(path);
      const body = files[path]?.body;
      if (body === undefined) return Promise.reject(new Error('404'));
      return body instanceof Error ? Promise.reject(body) : Promise.resolve(body);
    },
  };
  return { client, fetched };
};

describe('syncBsdata', () => {
  it('stores each faction’s detachments and the status', async () => {
    const { client } = fakeClient({
      'Necrons.json': { sha: 'a', body: necrons('Canoptek Court', 'Awakened Dynasty') },
    });
    const status = await syncBsdata(db, client, NOW);
    expect((await bsdataByFaction(db)).get('Necrons')).toEqual([
      'Awakened Dynasty',
      'Canoptek Court',
    ]);
    expect(status).toEqual({
      checkedAt: NOW.toISOString(),
      factions: [{ faction: 'Necrons', detachments: 2 }],
      errors: [],
    });
    expect(await bsdataStatus(db)).toEqual(status);
  });

  it('downloads only when a file changed', async () => {
    const files = {
      'Necrons.json': { sha: 'a', body: necrons('Awakened Dynasty') },
      'Orks.json': { sha: 'b', body: orks },
    };
    const first = fakeClient(files);
    await syncBsdata(db, first.client, NOW);
    expect(first.fetched).toHaveLength(2);
    const again = fakeClient(files);
    await syncBsdata(db, again.client, NOW);
    expect(again.fetched).toEqual([]);
    expect((await bsdataByFaction(db)).get('Orks')).toEqual(['War Horde']);
    // One changed file: every file is read again, since catalogues link to each other.
    const changed = fakeClient({ ...files, 'Orks.json': { sha: 'c', body: orks } });
    await syncBsdata(db, changed.client, NOW);
    expect(changed.fetched.sort()).toEqual(['Necrons.json', 'Orks.json']);
  });

  it('keeps old data when a file fails', async () => {
    await syncBsdata(
      db,
      fakeClient({ 'Necrons.json': { sha: 'a', body: necrons('Awakened Dynasty') } }).client,
      NOW,
    );
    const status = await syncBsdata(
      db,
      fakeClient({ 'Necrons.json': { sha: 'b', body: new Error('404') } }).client,
      NOW,
    );
    expect((await bsdataByFaction(db)).get('Necrons')).toEqual(['Awakened Dynasty']);
    expect(status.errors).toEqual([{ path: 'Necrons.json', error: '404' }]);
  });

  it('changes nothing while any file fails, since factions read across files', async () => {
    const files = {
      'Necrons.json': { sha: 'a', body: necrons('Awakened Dynasty') },
      'Orks.json': { sha: 'b', body: orks },
    };
    await syncBsdata(db, fakeClient(files).client, NOW);
    const status = await syncBsdata(
      db,
      fakeClient({
        'Necrons.json': { sha: 'a2', body: necrons('Annihilation Legion') },
        'Orks.json': { sha: 'b', body: new Error('GitHub answered 500') },
      }).client,
      NOW,
    );
    expect((await bsdataByFaction(db)).get('Necrons')).toEqual(['Awakened Dynasty']);
    expect(status.errors).toEqual([{ path: 'Orks.json', error: 'GitHub answered 500' }]);
    // Read again next time: Necrons' new version wasn't taken in.
    const retry = fakeClient({
      'Necrons.json': { sha: 'a2', body: necrons('Annihilation Legion') },
      'Orks.json': { sha: 'b', body: orks },
    });
    await syncBsdata(db, retry.client, NOW);
    expect((await bsdataByFaction(db)).get('Necrons')).toEqual(['Annihilation Legion']);
    expect((await bsdataStatus(db)).errors).toEqual([]);
  });

  it('replaces a faction’s detachments with the new parse', async () => {
    await syncBsdata(
      db,
      fakeClient({
        'Necrons.json': { sha: 'a', body: necrons('Awakened Dynasty', 'Canoptek Court') },
      }).client,
      NOW,
    );
    await syncBsdata(
      db,
      fakeClient({
        'Necrons.json': { sha: 'b', body: necrons('Awakened Dynasty', 'Canoptek Conclave') },
      }).client,
      NOW,
    );
    expect((await bsdataByFaction(db)).get('Necrons')).toEqual([
      'Awakened Dynasty',
      'Canoptek Conclave',
    ]);
  });

  it('keeps the old list when a file parses to nothing', async () => {
    await syncBsdata(
      db,
      fakeClient({ 'Necrons.json': { sha: 'a', body: necrons('Awakened Dynasty') } }).client,
      NOW,
    );
    const status = await syncBsdata(
      db,
      fakeClient({ 'Necrons.json': { sha: 'b', body: necrons() } }).client,
      NOW,
    );
    expect((await bsdataByFaction(db)).get('Necrons')).toEqual(['Awakened Dynasty']);
    expect(status.errors).toEqual([{ path: 'Necrons.json', error: 'no detachments found' }]);
  });

  it('is due after 24 hours', async () => {
    expect(await bsdataDue(db, NOW)).toBe(true);
    await syncBsdata(db, fakeClient({}).client, NOW);
    expect(await bsdataDue(db, new Date(NOW.getTime() + 23 * 3_600_000))).toBe(false);
    expect(await bsdataDue(db, new Date(NOW.getTime() + 24 * 3_600_000))).toBe(true);
  });
});
