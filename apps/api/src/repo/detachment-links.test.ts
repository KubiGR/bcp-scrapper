import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { armyLists, bsdataDetachments, players } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { sampleSource } from '../test/helpers';
import { gwList, storeList } from '../test/lists';
import { upsertEventDetail } from './events';
import {
  detachmentNames,
  foreignDetachmentCheck,
  keepDetachment,
  linkDetachment,
  unkeepDetachment,
  unlinkDetachment,
  wrongPairCheck,
} from './detachment-links';
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
  await db.update(players).set({ faction: 'Chaos Daemons' }).where(eq(players.eventId, EVENT));
  await storeList(db, 'PL-ADA', gwList('Chaos Daemons', 'Cabalgata del Caos'));
  await storeList(db, 'PL-BEN', gwList('Chaos Daemons', 'Cabalgata del Caos'));
  await storeList(db, 'PL-CARA', gwList('Chaos Daemons', 'Blood Legion'), 'Blood Legion');
  await storeList(db, 'PL-DAN', gwList('Chaos Daemons', 'Shadow Legion'), 'Shadow Legion');
});

const detachmentsOf = async (playerId: string) =>
  (await db.select().from(armyLists).where(eq(armyLists.playerId, playerId)))[0]?.detachments;

describe('detachments outside an army’s BSData list', () => {
  beforeEach(async () => {
    await db.insert(bsdataDetachments).values([
      { faction: 'World Eaters', name: 'Berzerker Warband' },
      { faction: 'Chaos Daemons', name: 'Blood Legion' },
      { faction: 'Chaos Daemons', name: 'Shadow Legion' },
    ]);
    await db.update(players).set({ faction: 'World Eaters' }).where(eq(players.id, 'PL-EVE'));
  });

  it('lists them with the factions BSData has them for, until kept', async () => {
    await storeList(db, 'PL-EVE', gwList('World Eaters', 'Blood Legion'));
    const names = await detachmentNames(db);
    expect(names.bsdataFactions).toEqual(['Chaos Daemons', 'World Eaters']);
    expect(names.wrong).toEqual([
      {
        faction: 'World Eaters',
        name: 'Blood Legion',
        lists: 1,
        bsdataFactions: ['Chaos Daemons'],
      },
    ]);
    expect(names.targets.find((t) => t.name === 'Berzerker Warband')).toEqual({
      name: 'Berzerker Warband',
      factions: ['World Eaters'],
      bsdata: true,
    });
    await keepDetachment(db, 'World Eaters', 'Blood Legion');
    const kept = await detachmentNames(db);
    expect(kept.wrong).toEqual([]);
    expect(kept.kept).toEqual([{ faction: 'World Eaters', name: 'Blood Legion' }]);
    await unkeepDetachment(db, 'World Eaters', 'Blood Legion');
    expect((await detachmentNames(db)).wrong).toHaveLength(1);
  });

  it('leaves names nobody knows to Not linked yet, not here', async () => {
    await storeList(db, 'PL-EVE', gwList('World Eaters', 'Rompecraneos Sagrados'));
    const names = await detachmentNames(db);
    expect(names.unsure.map((u) => u.name)).toContain('Rompecraneos Sagrados');
    expect(names.wrong).toEqual([]);
  });

  it('never flags a name marked as its own detachment (one BSData doesn’t have yet)', async () => {
    await storeList(db, 'PL-EVE', gwList('World Eaters', 'Gore Tide'));
    await linkDetachment(db, 'Gore Tide', null);
    expect((await detachmentNames(db)).wrong).toEqual([]);
    expect((await wrongPairCheck(db))('World Eaters', 'Gore Tide')).toBe(false);
  });

  it('compares names loosely: case, accents and punctuation don’t make a wrong pair', async () => {
    // An older link to BCP's spelling of a BSData detachment.
    await linkDetachment(db, 'Gore Band', 'berzerker-warband');
    await storeList(db, 'PL-EVE', gwList('World Eaters', 'Gore Band'));
    expect((await detachmentNames(db)).wrong).toEqual([]);
    expect((await wrongPairCheck(db))('World Eaters', 'Berzérker Warband')).toBe(false);
  });

  it('counts a linked name as its target', async () => {
    await linkDetachment(db, 'Gore Band', 'Berzerker Warband');
    await storeList(db, 'PL-EVE', gwList('World Eaters', 'Gore Band'));
    expect((await detachmentNames(db)).wrong).toEqual([]);
  });

  it('never flags without an army, or for an army BSData doesn’t cover', async () => {
    const wrong = await wrongPairCheck(db);
    expect(wrong(null, 'Anything')).toBe(false);
    expect(wrong('Necrons', 'Anything')).toBe(false);
    expect(wrong('World Eaters', 'Blood Legion')).toBe(true);
    expect(wrong('World Eaters', 'berzerker warband')).toBe(false);
  });
});

describe('detachment names', () => {
  it('lists the names BCP doesn’t use, most used first, with their factions', async () => {
    await storeList(db, 'PL-EVE', gwList('Chaos Daemons', 'Wreckas'));
    const names = await detachmentNames(db);
    expect(names.unsure).toEqual([{ name: 'Wreckas', lists: 1, factions: ['Chaos Daemons'] }]);
    expect(names.targets).toEqual([
      { name: 'Blood Legion', factions: ['Chaos Daemons'], bsdata: false },
      { name: 'Shadow Legion', factions: ['Chaos Daemons'], bsdata: false },
    ]);
    expect(names.links).toEqual([]);
  });

  it('groups names by the real army, never an allegiance like "Forces of the Hive Mind"', async () => {
    await db
      .update(players)
      .set({ faction: 'Forces of the Hive Mind' })
      .where(eq(players.id, 'PL-EVE'));
    await storeList(db, 'PL-EVE', gwList('Genestealer Cults', 'Xenocult Masses'));
    const names = await detachmentNames(db);
    // As BCP names the army.
    expect(names.unsure.find((u) => u.name === 'Xenocult Masses')?.factions).toEqual([
      'Genestealer Cult',
    ]);
  });

  it('leaves out a faction with one stray list where another uses the detachment in 3+', async () => {
    for (const id of ['PL-EVE', 'PL-FINN']) {
      await storeList(db, id, gwList('Chaos Daemons', 'Blood Legion'), 'Blood Legion');
    }
    await db.update(players).set({ faction: 'World Eaters' }).where(eq(players.id, 'PL-GIA'));
    await storeList(db, 'PL-GIA', gwList('World Eaters', 'Blood Legion'), 'Blood Legion');
    const names = await detachmentNames(db);
    expect(names.targets.find((t) => t.name === 'Blood Legion')?.factions).toEqual([
      'Chaos Daemons',
    ]);
    // With fewer lists to go by, a second faction still counts.
    expect(names.targets.find((t) => t.name === 'Shadow Legion')?.factions).toEqual([
      'Chaos Daemons',
    ]);
  });

  it('groups a name by the list’s own army when BCP names another faction', async () => {
    // Registered as Necrons on BCP, but the list is Space Wolves.
    await db.update(players).set({ faction: 'Necrons' }).where(eq(players.id, 'PL-EVE'));
    await storeList(db, 'PL-EVE', gwList('Space Wolves', 'Legends of Saga and Song'));
    // A chapter's list names the army as Space Marines: BCP's chapter is the more exact one.
    await db.update(players).set({ faction: 'Dark Angels' }).where(eq(players.id, 'PL-FINN'));
    await storeList(db, 'PL-FINN', gwList('Space Marines', 'Unforgiven Task Force'));
    const names = await detachmentNames(db);
    expect(names.unsure.find((u) => u.name === 'Legends of Saga and Song')?.factions).toEqual([
      'Space Wolves',
    ]);
    expect(names.unsure.find((u) => u.name === 'Unforgiven Task Force')?.factions).toEqual([
      'Dark Angels',
    ]);
  });

  it('sets apart the names that look foreign', async () => {
    expect((await detachmentNames(db)).foreign).toEqual([
      { name: 'Cabalgata del Caos', lists: 2, factions: ['Chaos Daemons'], marked: false },
    ]);
  });

  it('marks a name as not English by hand, and can undo it', async () => {
    await storeList(db, 'PL-EVE', gwList('Chaos Daemons', 'Arrazadorez'));
    await linkDetachment(db, 'Arrazadorez', null, true);
    const marked = await detachmentNames(db);
    expect(marked.unsure).toEqual([]);
    expect(marked.foreign.map((f) => [f.name, f.marked])).toEqual([
      ['Cabalgata del Caos', false],
      ['Arrazadorez', true],
    ]);
    expect(marked.links).toEqual([]);
    expect(await detachmentsOf('PL-EVE')).toEqual(['Arrazadorez']);

    await unlinkDetachment(db, 'Arrazadorez');
    expect((await detachmentNames(db)).unsure.map((u) => u.name)).toEqual(['Arrazadorez']);
  });

  it('ignores a junk name: out of the lists to sort, out of Meta, listed apart, undoable', async () => {
    const junk = 'See my notes below';
    await storeList(db, 'PL-EVE', gwList('Chaos Daemons', junk));
    expect((await detachmentNames(db)).unsure.map((u) => u.name)).toContain(junk);
    await linkDetachment(db, junk, null, false, true);
    const after = await detachmentNames(db);
    expect(after.unsure.map((u) => u.name)).not.toContain(junk);
    expect(after.foreign.map((f) => f.name)).not.toContain(junk);
    expect(after.links).toEqual([]);
    expect(after.ignored).toEqual([{ name: junk, lists: 1, factions: ['Chaos Daemons'] }]);
    // Meta counts it as an unknown detachment, like a name that isn't English.
    expect((await foreignDetachmentCheck(db))(junk)).toBe(true);
    await unlinkDetachment(db, junk);
    const undone = await detachmentNames(db);
    expect(undone.unsure.map((u) => u.name)).toContain(junk);
    expect(undone.ignored).toEqual([]);
  });

  it('tells Meta which names are foreign: detected or marked, unless BCP uses them or they’re own', async () => {
    await linkDetachment(db, 'Arrazadorez', null, true);
    await linkDetachment(db, 'Del Rio Raiders', null);
    const foreign = await foreignDetachmentCheck(db);
    expect(foreign('Cabalgata del Caos')).toBe(true);
    expect(foreign('arrazadorez')).toBe(true);
    expect(foreign('Del Rio Raiders')).toBe(false);
    expect(foreign('Blood Legion')).toBe(false);
    expect(foreign('Wreckas')).toBe(false);
  });

  it('links a name to a detachment everywhere, and can undo it', async () => {
    await linkDetachment(db, 'Cabalgata del Caos', 'Shadow Legion');
    expect(await detachmentsOf('PL-ADA')).toEqual(['Shadow Legion']);
    const linked = await detachmentNames(db);
    expect(linked.foreign).toEqual([]);
    expect(linked.links).toEqual([
      { name: 'Cabalgata del Caos', target: 'Shadow Legion', factions: ['Chaos Daemons'] },
    ]);

    await unlinkDetachment(db, 'cabalgata del caos');
    expect(await detachmentsOf('PL-ADA')).toEqual(['Cabalgata del Caos']);
    expect((await detachmentNames(db)).foreign.map((u) => u.name)).toEqual(['Cabalgata del Caos']);
  });

  it('marks a name as its own detachment', async () => {
    await linkDetachment(db, 'Cabalgata del Caos', null);
    expect(await detachmentsOf('PL-ADA')).toEqual(['Cabalgata del Caos']);
    const names = await detachmentNames(db);
    expect(names.unsure).toEqual([]);
    expect(names.foreign).toEqual([]);
    expect(names.links).toEqual([
      { name: 'Cabalgata del Caos', target: null, factions: ['Chaos Daemons'] },
    ]);
    // A known detachment of its factions from then on, and one to link other names to.
    expect(names.targets).toContainEqual({
      name: 'Cabalgata del Caos',
      factions: ['Chaos Daemons'],
      bsdata: false,
    });
  });

  it('lists the translations learned from BCP, until one is linked by hand', async () => {
    await storeList(db, 'PL-EVE', gwList('Chaos Daemons', 'Legión Sangrienta'), 'Blood Legion');
    await storeList(db, 'PL-FINN', gwList('Chaos Daemons', 'Legión Sangrienta'), 'Blood Legion');
    expect((await detachmentNames(db)).learned).toEqual([
      { name: 'Legión Sangrienta', target: 'Blood Legion', factions: ['Chaos Daemons'] },
    ]);
    // "Not the same": its own detachment, which wins over what was learned.
    await linkDetachment(db, 'Legión Sangrienta', null);
    expect((await detachmentNames(db)).learned).toEqual([]);
  });

  it('wins over a translation learned from BCP', async () => {
    await storeList(db, 'PL-EVE', gwList('Chaos Daemons', 'Klauen des Zweifels'), 'Blood Legion');
    await storeList(db, 'PL-FINN', gwList('Chaos Daemons', 'Klauen des Zweifels'), 'Blood Legion');
    await linkDetachment(db, 'Klauen des Zweifels', 'Shadow Legion');
    expect(await detachmentsOf('PL-EVE')).toEqual(['Shadow Legion']);
  });
});
