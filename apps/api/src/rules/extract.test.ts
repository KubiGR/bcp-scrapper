import { describe, expect, it } from 'vitest';
import { sampleBundle, sampleTables } from '../test/rules-sample';
import { extractDetachments, extractUnits, readRulesBundle, RulesShapeError } from './extract';

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
      'Gretchin',
    ]);
  });

  it('reads a squad: models (a hidden sergeant too), sizes smallest first, default loadout', () => {
    const squad = sheet('Intercessor Squad');
    expect(squad?.models).toEqual([
      {
        id: 'm-int',
        name: 'Intercessor',
        toughness: 4,
        save: 3,
        invuln: null,
        invulnAgainst: 'all',
        wounds: 2,
      },
      {
        id: 'm-sgt',
        name: 'Intercessor Sergeant',
        toughness: 4,
        save: 3,
        invuln: null,
        invulnAgainst: 'all',
        wounds: 2,
      },
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

  it('reads invulnerable saves that only work against ranged or melee attacks', () => {
    const invulnOf = (row: Record<string, unknown>) => {
      const tables = sampleTables();
      tables.invulnerable_save = [
        { datasheetId: 'ds-cap', miniatureId: null, rangedSave: null, meleeSave: null, ...row },
      ];
      const model = extractUnits(tables).datasheets.find((d) => d.name === 'Captain')?.models[0];
      return { invuln: model?.invuln, invulnAgainst: model?.invulnAgainst };
    };
    const note = (rules: string) => ({ localisations: { en: { rules } } });
    expect(invulnOf({ save: '4+' })).toEqual({ invuln: 4, invulnAgainst: 'all' });
    expect(invulnOf({ save: '5+', ...note('*Against ranged attacks only.*') })).toEqual({
      invuln: 5,
      invulnAgainst: 'ranged',
    });
    expect(
      invulnOf({ save: null, meleeSave: '4+', ...note('*Against melee attacks only*') }),
    ).toEqual({ invuln: 4, invulnAgainst: 'melee' });
    // Different against each: the better one, against all attacks.
    expect(invulnOf({ save: '5+', ...note('*4+ against melee attacks only*') })).toEqual({
      invuln: 4,
      invulnAgainst: 'all',
    });
    expect(invulnOf({ save: null, rangedSave: '6+', meleeSave: '4+' })).toEqual({
      invuln: 4,
      invulnAgainst: 'all',
    });
  });

  it('reads abilities that reduce or halve the Damage of attacks against the model', () => {
    expect(sheet('Warboss')?.damageReduction).toEqual({
      ability: 'Necrodermis',
      minus: 1,
      halve: false,
    });
    expect(sheet('Captain')?.damageReduction).toEqual({
      ability: 'Formidably Resilient',
      minus: 0,
      halve: true,
    });
    expect(sheet('Intercessor Squad')?.damageReduction).toBeNull();
  });

  it('keeps the names of wargear that isn’t a weapon', () => {
    expect(sheet('Captain')?.wargear).toEqual(['Relic Shield']);
    expect(sheet('Intercessor Squad')?.wargear).toEqual([]);
  });

  it('knows which units a character can lead, by name or by keyword', () => {
    expect(sheet('Captain')?.leads).toEqual(['ds-int']);
    expect(sheet('Warboss')?.leads).toEqual(['ds-boyz']);
    expect(sheet('Intercessor Squad')?.leads).toEqual([]);
  });

  it('fields the most models a size’s points pay for', () => {
    expect(sheet('Boyz')?.sizes[0]?.models).toEqual([
      { modelId: 'm-boy', count: 19 },
      { modelId: 'm-nob', count: 1 },
    ]);
  });

  it('leads by keyword only units with all of the keywords', () => {
    expect(sheet('Warboss')?.leads).toEqual(['ds-boyz']);
  });

  it('names a missing table', () => {
    const tables = sampleTables();
    delete tables.unit_composition;
    expect(() => extractUnits(tables)).toThrow('39k.pro data has no unit_composition');
  });
});

describe('extractDetachments', () => {
  it('lists each faction’s detachments as the GW app allows them, without Combat Patrol ones', () => {
    expect(extractDetachments(sampleTables())).toEqual(
      new Map([
        ['Blood Angels', ['Gladius Task Force', 'Liberator Assault Group']],
        ['Orks', ['War Horde']],
        ['Space Marines (Astartes)', ['Gladius Task Force']],
      ]),
    );
  });

  it('is empty when the site has no detachment tables', () => {
    expect(extractDetachments({ ...sampleTables(), detachment: [] }).size).toBe(0);
  });
});

describe('readRulesBundle', () => {
  it('finds the data in the script and its version', () => {
    const { dataVersion, data } = readRulesBundle(sampleBundle());
    expect(dataVersion).toBe(972);
    expect(data.datasheets).toHaveLength(5);
  });

  it('says when the data isn’t there', () => {
    expect(() => readRulesBundle('console.log(1)')).toThrow(RulesShapeError);
    expect(() => readRulesBundle('console.log(1)')).toThrow(/No rules data/);
  });

  it('refuses code where data should be', () => {
    expect(() => readRulesBundle('const a={publication:load()}')).toThrow(/couldn’t be read/);
  });
});
