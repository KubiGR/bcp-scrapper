import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { sampleSource } from '../test/helpers';
import { gwList, storeList } from '../test/lists';
import { searchStoredLists } from './mathhammer-lists';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await syncEvent({ db, source: sampleSource() }, 'EVTTEAM0001');
  await storeList(db, 'PL-ADA', gwList('Orks', 'War Horde'));
});

describe('searchStoredLists', () => {
  it('finds stored lists by player or event name, any case', async () => {
    const byPlayer = await searchStoredLists(db, 'ada');
    expect(byPlayer).toHaveLength(1);
    expect(byPlayer[0]).toMatchObject({ playerId: 'PL-ADA', faction: 'Orks' });
    const event = byPlayer[0]?.event ?? '';
    expect(await searchStoredLists(db, event.slice(0, 5).toUpperCase())).toHaveLength(1);
    expect(await searchStoredLists(db, 'nobody here')).toEqual([]);
  });

  it('needs at least two characters', async () => {
    expect(await searchStoredLists(db, 'a')).toEqual([]);
  });
});
