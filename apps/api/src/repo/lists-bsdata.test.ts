import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { armyLists, factionDetachments, players } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { sampleSource } from '../test/helpers';
import { gwList, storeList } from '../test/lists';
import { linkDetachment } from './detachment-links';
import { upsertEventDetail } from './events';
import { tidyDetachments } from './lists';
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

const detachmentsOf = async (playerId: string) =>
  (await db.select().from(armyLists).where(eq(armyLists.playerId, playerId)))[0]?.detachments;
const bsdata = (faction: string, ...names: string[]) =>
  db.insert(factionDetachments).values(names.map((name) => ({ faction, name })));

describe('lists and BSData', () => {
  it('stores BSData’s spelling of a list’s detachment', async () => {
    await bsdata('Orks', 'War Horde');
    await storeList(db, 'PL-ADA', gwList('Orks', 'War-horde'));
    expect(await detachmentsOf('PL-ADA')).toEqual(['War Horde']);
  });

  it('lets a hand link win over BSData', async () => {
    await bsdata('Orks', 'War Horde', 'Kult of Speed');
    await linkDetachment(db, 'War-horde', 'Kult of Speed');
    await storeList(db, 'PL-ADA', gwList('Orks', 'War-horde'));
    expect(await detachmentsOf('PL-ADA')).toEqual(['Kult of Speed']);
  });

  it('matches against every faction’s detachments for an army BSData doesn’t cover', async () => {
    await bsdata('Necrons', 'Awakened Dynasty');
    await storeList(db, 'PL-ADA', gwList('Tyranids', 'awakened dynasty'));
    expect(await detachmentsOf('PL-ADA')).toEqual(['Awakened Dynasty']);
  });

  it('never guesses across factions: only exact or loose matches there', async () => {
    await bsdata('Necrons', 'Awakened Dynasty');
    // 2 letters off a Necrons detachment, in a Tyranids list (BSData has no Tyranids here).
    await storeList(db, 'PL-ADA', gwList('Tyranids', 'Awakened Dynosty'));
    expect(await detachmentsOf('PL-ADA')).toEqual(['Awakened Dynosty']);
  });

  it('goes by the BCP faction when the list names no army', async () => {
    await bsdata('Orks', 'Kult of Speed');
    // Searching every faction, the two spellings would tie: no match.
    await bsdata('Necrons', 'KULT OF SPEED');
    await db.update(players).set({ faction: 'Orks' }).where(eq(players.id, 'PL-ADA'));
    await storeList(db, 'PL-ADA', 'Factions used: Not an army\nDetachment: kult of speed');
    expect(await detachmentsOf('PL-ADA')).toEqual(['Kult of Speed']);
  });

  it('re-tidies stored lists after BSData changes', async () => {
    await storeList(db, 'PL-ADA', gwList('Orks', 'War-horde'));
    expect(await detachmentsOf('PL-ADA')).toEqual(['War-horde']);
    await bsdata('Orks', 'War Horde');
    await tidyDetachments(db);
    expect(await detachmentsOf('PL-ADA')).toEqual(['War Horde']);
  });
});
