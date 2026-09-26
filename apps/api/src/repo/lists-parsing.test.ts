import { PARSER_VERSION } from '@bcp/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { armyLists } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { gwList, storeList } from '../test/lists';
import { sampleSource, silentLogger } from '../test/helpers';
import { upsertEventDetail } from './events';
import { knownDetachments, reparseLists } from './lists';
import { replaceEventPlayers, replaceEventTeams } from './participants';

let db: Db;
let close: () => Promise<void>;
const source = sampleSource();
const EVENT = 'EVTTEAM0001';

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await upsertEventDetail(db, await source.getEvent(EVENT));
  await replaceEventTeams(db, EVENT, await source.getTeams(EVENT));
  await replaceEventPlayers(db, EVENT, await source.getPlayers(EVENT));
});

const rowOf = async (playerId: string) => {
  const [row] = await db.select().from(armyLists).where(eq(armyLists.playerId, playerId));
  if (row === undefined) throw new Error(`no list for ${playerId}`);
  return row;
};

describe('parsed lists', () => {
  it('reads army, detachments and disposition when a list is saved', async () => {
    await storeList(db, 'PL-ADA', gwList('Thousand Sons', 'Grand Coven', 'Priority Assets'));
    expect(await rowOf('PL-ADA')).toMatchObject({
      parsedArmy: 'Thousand Sons',
      detachments: ['Grand Coven'],
      parsedDisposition: 'Priority Assets',
      parserVersion: PARSER_VERSION,
    });
  });

  it('stores nothing parsed for free text', async () => {
    await storeList(db, 'PL-ADA', 'Just some units\nCaptain (80 pts)');
    expect(await rowOf('PL-ADA')).toMatchObject({ parsedArmy: null, detachments: [] });
  });

  it('re-reads lists from an older parser version, and only those', async () => {
    await storeList(db, 'PL-ADA', gwList('Orks', 'War Horde'));
    await storeList(db, 'PL-BEN', gwList('Necrons', 'Awakened Dynasty'));
    await db
      .update(armyLists)
      .set({ parserVersion: 0, parsedArmy: null, detachments: [] })
      .where(eq(armyLists.playerId, 'PL-ADA'));
    await db
      .update(armyLists)
      .set({ parsedArmy: 'untouched' })
      .where(eq(armyLists.playerId, 'PL-BEN'));

    expect(await reparseLists(db, silentLogger)).toBe(1);
    expect(await rowOf('PL-ADA')).toMatchObject({ parsedArmy: 'Orks', detachments: ['War Horde'] });
    expect((await rowOf('PL-BEN')).parsedArmy).toBe('untouched');
  });

  it('splits joined detachments only once each part has been seen alone', async () => {
    await storeList(db, 'PL-ADA', gwList('Orks', 'Kult of Speed and Wreckas'));
    expect((await rowOf('PL-ADA')).detachments).toEqual(['Kult of Speed and Wreckas']);

    await storeList(db, 'PL-BEN', gwList('Orks', 'Kult of Speed'));
    await storeList(db, 'PL-CARA', gwList('Orks', 'Wreckas'));
    expect(await knownDetachments(db)).toEqual(new Set(['Kult of Speed', 'Wreckas']));
    await reparseLists(db, silentLogger);
    expect((await rowOf('PL-ADA')).detachments).toEqual(['Kult of Speed', 'Wreckas']);

    // Saved after both are known: split straight away.
    await storeList(db, 'PL-DAN', gwList('Orks', 'Wreckas and Kult of Speed'));
    expect((await rowOf('PL-DAN')).detachments).toEqual(['Wreckas', 'Kult of Speed']);
  });

  it('keeps a joined name when a part was never seen alone', async () => {
    await storeList(db, 'PL-ADA', gwList('Orks', 'Blood and Iron'));
    await storeList(db, 'PL-BEN', gwList('Orks', 'Iron'));
    await reparseLists(db, silentLogger);
    expect((await rowOf('PL-ADA')).detachments).toEqual(['Blood and Iron']);
  });
});
