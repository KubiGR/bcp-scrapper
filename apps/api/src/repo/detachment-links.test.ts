import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { armyLists, players } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { sampleSource } from '../test/helpers';
import { gwList, storeList } from '../test/lists';
import { upsertEventDetail } from './events';
import { detachmentNames, linkDetachment, unlinkDetachment } from './detachment-links';
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

describe('detachment names', () => {
  it('lists the names BCP doesn’t use, most used first, with their factions', async () => {
    const names = await detachmentNames(db);
    expect(names.unsure).toEqual([
      { name: 'Cabalgata del Caos', lists: 2, factions: ['Chaos Daemons'] },
    ]);
    expect(names.targets).toEqual([
      { name: 'Blood Legion', factions: ['Chaos Daemons'] },
      { name: 'Shadow Legion', factions: ['Chaos Daemons'] },
    ]);
    expect(names.links).toEqual([]);
  });

  it('links a name to a detachment everywhere, and can undo it', async () => {
    await linkDetachment(db, 'Cabalgata del Caos', 'Shadow Legion');
    expect(await detachmentsOf('PL-ADA')).toEqual(['Shadow Legion']);
    const linked = await detachmentNames(db);
    expect(linked.unsure).toEqual([]);
    expect(linked.links).toEqual([
      { name: 'Cabalgata del Caos', target: 'Shadow Legion', factions: ['Chaos Daemons'] },
    ]);

    await unlinkDetachment(db, 'cabalgata del caos');
    expect(await detachmentsOf('PL-ADA')).toEqual(['Cabalgata del Caos']);
    expect((await detachmentNames(db)).unsure.map((u) => u.name)).toEqual(['Cabalgata del Caos']);
  });

  it('marks a name as its own detachment', async () => {
    await linkDetachment(db, 'Cabalgata del Caos', null);
    expect(await detachmentsOf('PL-ADA')).toEqual(['Cabalgata del Caos']);
    const names = await detachmentNames(db);
    expect(names.unsure).toEqual([]);
    expect(names.links).toEqual([
      { name: 'Cabalgata del Caos', target: null, factions: ['Chaos Daemons'] },
    ]);
  });

  it('wins over a translation learned from BCP', async () => {
    await storeList(db, 'PL-EVE', gwList('Chaos Daemons', 'Zweideutig'), 'Blood Legion');
    await storeList(db, 'PL-FINN', gwList('Chaos Daemons', 'Zweideutig'), 'Blood Legion');
    await linkDetachment(db, 'Zweideutig', 'Shadow Legion');
    expect(await detachmentsOf('PL-EVE')).toEqual(['Shadow Legion']);
  });
});
