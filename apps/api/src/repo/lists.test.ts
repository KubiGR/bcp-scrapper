import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb } from '../db/test-db';
import { sampleSource } from '../test/helpers';
import { upsertEventDetail } from './events';
import { findPlayersMissingLists, saveArmyList } from './lists';
import { upsertPlayers, upsertTeams } from './participants';

let db: Db;
let close: () => Promise<void>;
const source = sampleSource();
const EVENT = 'EVTTEAM0001';

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await upsertEventDetail(db, await source.getEvent(EVENT));
  await upsertTeams(db, await source.getTeams(EVENT));
  await upsertPlayers(db, await source.getPlayers(EVENT));
});
afterAll(() => close());

describe('army lists', () => {
  it('finds players that have a BCP list we have not stored yet', async () => {
    const missing = await findPlayersMissingLists(db, EVENT);
    expect(missing).toHaveLength(7); // PL-HAL has no list at all
    expect(missing).toContainEqual({ playerId: 'PL-ADA', listId: 'LS-ADA' });

    const list = await source.getList('LS-ADA');
    if (!list) throw new Error('fixture missing');
    await saveArmyList(db, 'PL-ADA', list);

    expect(await findPlayersMissingLists(db, EVENT)).not.toContainEqual(
      expect.objectContaining({ playerId: 'PL-ADA' }),
    );
  });

  it('re-saving a list replaces it', async () => {
    const list = await source.getList('LS-BEN');
    if (!list) throw new Error('fixture missing');
    await saveArmyList(db, 'PL-BEN', list);
    await saveArmyList(db, 'PL-BEN', { ...list, text: 'updated' });
    expect(await findPlayersMissingLists(db, EVENT)).toHaveLength(5);
  });
});
