import { PARSER_VERSION } from '@bcp/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { armyLists } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { gwList, storeList } from '../test/lists';
import { sampleSource, silentLogger } from '../test/helpers';
import { upsertEventDetail } from './events';
import { knownDetachments, reparseLists, tidyDetachments } from './lists';
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
    const known = await knownDetachments(db);
    expect(known.has('Kult of Speed') && known.has('Wreckas')).toBe(true);
    expect(known.has('Kult of Speed and Wreckas')).toBe(false);
    await reparseLists(db, silentLogger);
    expect((await rowOf('PL-ADA')).detachments).toEqual(['Kult of Speed', 'Wreckas']);

    // Saved after both are known: split straight away.
    await storeList(db, 'PL-DAN', gwList('Orks', 'Wreckas and Kult of Speed'));
    expect((await rowOf('PL-DAN')).detachments).toEqual(['Wreckas', 'Kult of Speed']);
  });

  it('keeps a joined name when no part is known', async () => {
    await storeList(db, 'PL-ADA', gwList('Orks', 'Blood and Iron'));
    await reparseLists(db, silentLogger);
    expect((await rowOf('PL-ADA')).detachments).toEqual(['Blood and Iron']);
  });

  it('splits "and" lines once a comma list has named their detachments', async () => {
    await storeList(
      db,
      'PL-ADA',
      gwList('Adeptus Custodes', 'Shield Host and Tharanatoi Hammerblow'),
    );
    await storeList(
      db,
      'PL-BEN',
      gwList('Adeptus Custodes', 'Might of the Moritoi and Shield Host'),
    );
    await storeList(
      db,
      'PL-CARA',
      gwList('Adeptus Custodes', 'Shield Host, Tharanatoi Hammerblow'),
    );
    await tidyDetachments(db);
    expect((await rowOf('PL-ADA')).detachments).toEqual(['Shield Host', 'Tharanatoi Hammerblow']);
    expect((await rowOf('PL-BEN')).detachments).toEqual(['Might of the Moritoi', 'Shield Host']);
  });

  it('does not learn a word inside a name as a detachment', async () => {
    await storeList(db, 'PL-ADA', gwList('Space Wolves', 'Legends of Saga and Song'));
    await storeList(db, 'PL-BEN', gwList('Space Wolves', 'Saga of the Great Wolf'));
    await storeList(
      db,
      'PL-CARA',
      gwList('Space Wolves', 'Legends of Saga and Song and Saga of the Great Wolf'),
    );
    await tidyDetachments(db);
    expect((await rowOf('PL-ADA')).detachments).toEqual(['Legends of Saga and Song']);
    expect((await rowOf('PL-CARA')).detachments).toEqual([
      'Legends of Saga and Song',
      'Saga of the Great Wolf',
    ]);
  });

  it('merges spellings that differ in spaces or capitals into the most common one', async () => {
    await storeList(db, 'PL-ADA', gwList('Adeptus Custodes', 'Lions of the Emperor'));
    await storeList(db, 'PL-BEN', gwList('Adeptus Custodes', 'Lions of the Emperor'));
    await storeList(db, 'PL-CARA', gwList('Adeptus Custodes', 'Lions of The Emperor'));
    await storeList(db, 'PL-DAN', gwList('Adeptus Custodes', 'Lions\u00a0of the Emperor'));
    await tidyDetachments(db);
    for (const id of ['PL-ADA', 'PL-BEN', 'PL-CARA', 'PL-DAN']) {
      expect((await rowOf(id)).detachments, id).toEqual(['Lions of the Emperor']);
    }
  });

  it('translates known detachment names, also inside joined lines', async () => {
    await storeList(
      db,
      'PL-ADA',
      gwList('Adeptus Custodes', 'Might of the Moritoi and Shield Host'),
    );
    await storeList(
      db,
      'PL-BEN',
      gwList('Adeptus Custodes', 'Die Macht der Moritoi und Shield Host'),
    );
    await storeList(
      db,
      'PL-CARA',
      gwList('Adeptus Custodes', 'Shield Host, Tharanatoi Hammerblow'),
    );
    await storeList(db, 'PL-DAN', gwList('Drukhari', 'Exhibición y matanza'));
    await tidyDetachments(db);
    expect((await rowOf('PL-BEN')).detachments).toEqual(['Might of the Moritoi', 'Shield Host']);
    expect((await rowOf('PL-ADA')).detachments).toEqual(['Might of the Moritoi', 'Shield Host']);
    expect((await rowOf('PL-DAN')).detachments).toEqual(['Exhibition of Slaughter']);
  });

  describe('learning from the detachment picked on BCP', () => {
    it('learns a translation seen twice, and applies it everywhere', async () => {
      await storeList(
        db,
        'PL-ADA',
        gwList('Tyranids', 'Klauen der Nornkönigin'),
        'Talons of the Norn Queen',
      );
      await storeList(
        db,
        'PL-BEN',
        gwList('Tyranids', 'Klauen der Nornkönigin'),
        'Talons of the Norn Queen',
      );
      await storeList(
        db,
        'PL-CARA',
        gwList('Tyranids', 'Klauen der Nornkönigin und Synaptic Nexus'),
        'Synaptic Nexus',
      );
      await tidyDetachments(db);
      expect((await rowOf('PL-ADA')).detachments).toEqual(['Talons of the Norn Queen']);
      expect((await rowOf('PL-CARA')).detachments).toEqual([
        'Talons of the Norn Queen',
        'Synaptic Nexus',
      ]);
    });

    it('does not learn from a single list, or from conflicting ones', async () => {
      await storeList(db, 'PL-ADA', gwList('Tyranids', 'Unbekannter Trupp'), 'Crusher Stampede');
      await storeList(db, 'PL-BEN', gwList('Tyranids', 'Zweideutig'), 'Assimilation Swarm');
      await storeList(db, 'PL-CARA', gwList('Tyranids', 'Zweideutig'), 'Assimilation Swarm');
      await storeList(db, 'PL-DAN', gwList('Tyranids', 'Zweideutig'), 'Vanguard Onslaught');
      await storeList(db, 'PL-EVE', gwList('Tyranids', 'Zweideutig'), 'Vanguard Onslaught');
      await tidyDetachments(db);
      expect((await rowOf('PL-ADA')).detachments).toEqual(['Unbekannter Trupp']);
      expect((await rowOf('PL-BEN')).detachments).toEqual(['Zweideutig']);
    });

    it('never learns an English-looking name: it’s likely a detachment BCP doesn’t list yet', async () => {
      // BCP lacks it, so players pick the nearest one on BCP; that's no translation.
      for (const id of ['PL-ADA', 'PL-BEN', 'PL-CARA']) {
        await storeList(
          db,
          id,
          gwList('Genestealer Cult', 'Xenocult Masses'),
          'Biosanctic Broodsurge',
        );
      }
      await tidyDetachments(db);
      expect((await rowOf('PL-ADA')).detachments).toEqual(['Xenocult Masses']);
    });

    it('uses BCP’s detachment when the list itself can’t be read', async () => {
      await storeList(db, 'PL-ADA', 'Just some units\nCaptain (80 pts)', 'Blood Legion');
      expect((await rowOf('PL-ADA')).detachments).toEqual(['Blood Legion']);
    });

    it('knows BCP’s names as detachments, so joined lines split around them', async () => {
      // The name is known only from BCP's field (this list names another detachment).
      await storeList(
        db,
        'PL-ADA',
        gwList('Space Wolves', 'Champions of Fenris'),
        'Saga of the Great Wolf',
      );
      await storeList(
        db,
        'PL-BEN',
        gwList('Space Wolves', 'Legends of Saga and Song and Saga of the Great Wolf'),
      );
      await tidyDetachments(db);
      expect((await rowOf('PL-BEN')).detachments).toEqual([
        'Legends of Saga and Song',
        'Saga of the Great Wolf',
      ]);
    });
  });
});
