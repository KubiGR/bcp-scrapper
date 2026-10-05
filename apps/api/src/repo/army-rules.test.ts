import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { bsdataDetachments } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { armyRules } from './detachment-links';
import { keepDetachment, linkDetachment } from './detachment-links';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const bsdata = (faction: string, ...names: string[]) => names.map((name) => ({ faction, name }));
  await db
    .insert(bsdataDetachments)
    .values([
      ...bsdata('World Eaters', 'Berzerker Warband'),
      ...bsdata('Chaos Knights', 'Iconoclast Fiefdom'),
      ...bsdata('Space Marines (Astartes)', 'Gladius Task Force'),
      ...bsdata('Blood Angels', 'Gladius Task Force', 'Liberator Assault Group'),
    ]);
});

describe('armyRules', () => {
  it('takes the list’s army over BCP’s', async () => {
    const rules = await armyRules(db);
    expect(rules.army('Chaos Knights', 'World Eaters', ['Berzerker Warband'])).toEqual({
      faction: 'World Eaters',
      factionGuessed: true,
    });
  });

  it('takes the one BSData army a detachment belongs to when the list names no army', async () => {
    const rules = await armyRules(db);
    expect(rules.army('Chaos Knights', null, ['Berzerker Warband'])).toEqual({
      faction: 'World Eaters',
      factionGuessed: true,
    });
  });

  it('keeps BCP’s army when it has the detachment, or several armies do, or none', async () => {
    const rules = await armyRules(db);
    expect(rules.army('Blood Angels', null, ['Gladius Task Force']).faction).toBe('Blood Angels');
    expect(rules.army('Chaos Knights', null, ['Gladius Task Force']).faction).toBe('Chaos Knights');
    expect(rules.army('Chaos Knights', null, ['Made Up Host']).faction).toBe('Chaos Knights');
    expect(rules.army('Chaos Knights', null, []).faction).toBe('Chaos Knights');
  });

  it('counts a detachment outside the army’s BSData list as unknown, unless kept', async () => {
    let rules = await armyRules(db);
    expect(rules.detachments('Chaos Knights', ['Berzerker Warband'])).toEqual([]);
    expect(rules.detachments('World Eaters', ['Berzerker Warband'])).toEqual(['Berzerker Warband']);
    await keepDetachment(db, 'Chaos Knights', 'Berzerker Warband');
    rules = await armyRules(db);
    expect(rules.detachments('Chaos Knights', ['Berzerker Warband'])).toEqual([
      'Berzerker Warband',
    ]);
  });

  it('counts a detachment that isn’t English as unknown', async () => {
    await linkDetachment(db, 'Arrazadorez', null, true);
    const rules = await armyRules(db);
    expect(rules.detachments('World Eaters', ['Arrazadorez'])).toEqual([]);
  });
});
