import { describe, expect, it } from 'vitest';
import { sampleBundle, sampleTables } from '../test/rules-sample';
import { extractUnits, readRulesBundle, RulesShapeError } from './extract';

describe('extractUnits', () => {
  const data = extractUnits(sampleTables());
  const sheet = (name: string) => data.datasheets.find((d) => d.name === name);

  it('names factions as the app does, chapters with their parent', () => {
    expect(data.factions).toEqual([
      { name: 'Adeptus Astartes', faction: 'Space Marines (Astartes)', parent: null },
      { name: 'Blood Angels', faction: 'Blood Angels', parent: 'Space Marines (Astartes)' },
      { name: 'Orks', faction: 'Orks', parent: null },
    ]);
  });

  it('leaves out Combat Patrol datasheets', () => {
    expect(data.datasheets.map((d) => d.name)).toEqual([
      'Intercessor Squad',
      'Captain',
      'Boyz',
      'Warboss',
    ]);
  });

  it('reads a squad: models (a hidden sergeant too), sizes smallest first, default loadout', () => {
    const squad = sheet('Intercessor Squad');
    expect(squad?.models).toEqual([
      { id: 'm-int', name: 'Intercessor', toughness: 4, save: 3, invuln: null, wounds: 2 },
      { id: 'm-sgt', name: 'Intercessor Sergeant', toughness: 4, save: 3, invuln: null, wounds: 2 },
    ]);
    expect(squad?.sizes).toEqual([
      {
        points: 80,
        models: [
          { modelId: 'm-int', count: 4 },
          { modelId: 'm-sgt', count: 1 },
        ],
      },
      {
        points: 160,
        models: [
          { modelId: 'm-sgt', count: 1 },
          { modelId: 'm-int', count: 9 },
        ],
      },
    ]);
    expect(squad?.loadout).toEqual([
      { modelId: 'm-int', weaponId: 'wi-br', count: 1 },
      { modelId: 'm-sgt', weaponId: 'wi-br', count: 1 },
    ]);
    expect(squad?.keywords.sort()).toEqual(['INFANTRY', 'TACTICUS']);
    expect(squad?.abilities).toEqual([
      { name: 'Bolter Discipline', text: 'Re-roll a hit roll of 1.' },
    ]);
  });

  it('reads weapons with every profile and its keyword names, without other wargear', () => {
    expect(sheet('Intercessor Squad')?.weapons).toEqual([
      {
        id: 'wi-br',
        name: 'Bolt rifle',
        profiles: [
          {
            name: 'Bolt rifle',
            melee: false,
            range: '24"',
            attacks: '2',
            skill: 3,
            strength: 4,
            ap: -1,
            damage: '1',
            keywords: ['Rapid Fire 1'],
          },
        ],
      },
      {
        id: 'wi-pi',
        name: 'Plasma incinerator',
        profiles: [
          {
            name: 'Standard',
            melee: false,
            range: '24"',
            attacks: '2',
            skill: 3,
            strength: 7,
            ap: -2,
            damage: '1',
            keywords: [],
          },
          {
            name: 'Supercharge',
            melee: false,
            range: '24"',
            attacks: '2',
            skill: 3,
            strength: 8,
            ap: -3,
            damage: '2',
            keywords: ['Hazardous'],
          },
        ],
      },
    ]);
    expect(sheet('Captain')?.weapons.map((w) => w.name)).toEqual(['Bolt rifle']);
  });

  it('reads invulnerable saves (for the unit or one model), Feel No Pain, Stealth and Damaged', () => {
    expect(sheet('Captain')?.models[0]?.invuln).toBe(4);
    expect(sheet('Warboss')).toMatchObject({ fnp: 6, damaged: 3, stealth: false });
    expect(sheet('Warboss')?.models[0]?.invuln).toBe(5);
    expect(sheet('Boyz')).toMatchObject({ stealth: true, fnp: null, damaged: null });
  });

  it('knows which units a character can lead, by name or by keyword', () => {
    expect(sheet('Captain')?.leads).toEqual(['ds-int']);
    expect(sheet('Warboss')?.leads).toEqual(['ds-boyz']);
    expect(sheet('Intercessor Squad')?.leads).toEqual([]);
  });

  it('names a missing table', () => {
    const tables = sampleTables();
    delete tables.unit_composition;
    expect(() => extractUnits(tables)).toThrow('39k.pro data has no unit_composition');
  });
});

describe('readRulesBundle', () => {
  it('finds the data in the script and its version', () => {
    const { dataVersion, data } = readRulesBundle(sampleBundle());
    expect(dataVersion).toBe(972);
    expect(data.datasheets).toHaveLength(4);
  });

  it('says when the data isn’t there', () => {
    expect(() => readRulesBundle('console.log(1)')).toThrow(RulesShapeError);
    expect(() => readRulesBundle('console.log(1)')).toThrow(/No rules data/);
  });

  it('refuses code where data should be', () => {
    expect(() => readRulesBundle('const a={publication:load()}')).toThrow(/couldn’t be read/);
  });
});
