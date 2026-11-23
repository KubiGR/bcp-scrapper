import type { MathhammerList, UnitDatasheet } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import {
  attackerRows,
  attackerRowsFromList,
  defenderFrom,
  defenderFromList,
  pickableUnits,
} from './datasheet-form';
import {
  defaultForm,
  defenderChanges,
  groupChanges,
  newWeapon,
  originalText,
  resetWeapon,
  toCalculation,
  weaponChanges,
} from './form-state';
import { CAPTAIN, INTERCESSORS, KNIGHT } from './unit-fixtures';

describe('attackerRows', () => {
  it('counts every model carrying each weapon of the default loadout', () => {
    const rows = attackerRows(INTERCESSORS, 0, []);
    expect(rows.map((r) => [r.name, r.models, r.profile])).toEqual([
      ['Bolt rifle', 5, 0],
      ['Plasma gun', 1, 'best'],
    ]);
    expect(rows[0]).toMatchObject({
      attacks: '2',
      skill: 3,
      strength: 4,
      ap: -1,
      keywordNames: ['Rapid Fire 1'],
    });
    expect(attackerRows(INTERCESSORS, 1, [])[0]?.models).toBe(10);
  });

  it('adds attached characters’ weapons, named after them', () => {
    const rows = attackerRows(INTERCESSORS, 0, [CAPTAIN]);
    expect(rows.at(-1)).toMatchObject({
      name: 'Captain: Master-crafted power weapon',
      models: 1,
      melee: true,
    });
  });
});

describe('attackerRows, several melee weapons on one model', () => {
  it('makes them one row to choose from (Best), Extra Attacks apart', () => {
    const rows = attackerRows(KNIGHT, 0, []);
    expect(rows.map((r) => [r.name, r.models, r.profile, r.profiles.map((p) => p.name)])).toEqual([
      [
        'Reaper chainsword / Thunderstrike gauntlet',
        1,
        'best',
        ['Reaper chainsword: Strike', 'Reaper chainsword: Sweep', 'Thunderstrike gauntlet'],
      ],
      ['Titanic feet', 1, 0, ['Titanic feet']],
    ]);
  });

  it('marks each row with the unit it belongs to', () => {
    expect(attackerRows(INTERCESSORS, 0, [CAPTAIN]).map((r) => r.owner)).toEqual([
      'Intercessor Squad',
      'Intercessor Squad',
      'Captain',
    ]);
  });
});

describe('defenderFrom', () => {
  it('makes one row per profile, a Character row per leader, and keeps the switches', () => {
    const previous = { ...defaultForm().defender, hitModifier: -1, damageReduction: 1 };
    const defender = defenderFrom(INTERCESSORS, 0, [CAPTAIN], previous);
    expect(defender.groups.map((g) => [g.name, g.models, g.invuln, g.fnp, g.character])).toEqual([
      ['Intercessor / Intercessor Sergeant', 5, null, null, false],
      ['Captain', 1, 4, 6, true],
    ]);
    expect(defender).toMatchObject({
      source: 'Intercessor Squad + Captain',
      attached: true,
      keywords: 'INFANTRY, CHARACTER',
      hitModifier: -1,
      // The datasheets have no damage reduction: the old value goes.
      damageReduction: 0,
      damageNote: null,
    });
  });

  it('gives Feel No Pain against psychic attacks to the models it covers', () => {
    const psychicOf = (unit: UnitDatasheet, leader: UnitDatasheet) =>
      defenderFrom(unit, 0, [leader], defaultForm().defender).groups.map((g) => [
        g.name,
        g.fnpPsychic,
      ]);
    // A leader's "models in that unit": all of them.
    const hooded = { ...CAPTAIN, fnpPsychic: { value: 4, wholeUnit: true } };
    expect(psychicOf(INTERCESSORS, hooded)).toEqual([
      ['Intercessor / Intercessor Sergeant', 4],
      ['Captain', 4],
    ]);
    // "This model has": the leader alone.
    const helm = { ...CAPTAIN, fnpPsychic: { value: 3, wholeUnit: false } };
    expect(psychicOf(INTERCESSORS, helm)).toEqual([
      ['Intercessor / Intercessor Sergeant', null],
      ['Captain', 3],
    ]);
    // The bodyguard's own covers the leader too; the better of the two counts.
    const squad = { ...INTERCESSORS, fnpPsychic: { value: 5, wholeUnit: true } };
    expect(psychicOf(squad, hooded)).toEqual([
      ['Intercessor / Intercessor Sergeant', 4],
      ['Captain', 4],
    ]);
  });

  it('ticks the unit’s own damage reduction and says which ability it is', () => {
    const ctan = {
      ...KNIGHT,
      damageReduction: { ability: 'Necrodermis', minus: 1, halve: false },
    };
    expect(defenderFrom(ctan, 0, [], defaultForm().defender)).toMatchObject({
      damageReduction: 1,
      halveDamage: false,
      damageNote: 'Damage −1: Necrodermis',
    });
  });

  it('only names an attached character’s damage reduction (it protects that model alone)', () => {
    const captain = {
      ...CAPTAIN,
      damageReduction: { ability: 'Formidably Resilient', minus: 0, halve: true },
    };
    expect(defenderFrom(INTERCESSORS, 0, [captain], defaultForm().defender)).toMatchObject({
      halveDamage: false,
      damageReduction: 0,
      damageNote: 'Captain only: Formidably Resilient (halve Damage), not ticked',
    });
  });
});

describe('list units', () => {
  const list: MathhammerList = {
    army: 'Space Marines (Astartes)',
    datasheets: [INTERCESSORS, CAPTAIN],
    units: [
      {
        label: 'Captain',
        name: 'Captain',
        datasheetId: CAPTAIN.id,
        attachedTo: 1,
        unread: [],
        groups: [
          {
            modelId: CAPTAIN.models[0]?.id ?? null,
            models: 1,
            weapons: [{ weaponId: CAPTAIN.weapons[0]?.id ?? '', count: 1 }],
          },
        ],
      },
      {
        label: 'Intercessor Squad ×5',
        name: 'Intercessor Squad',
        datasheetId: INTERCESSORS.id,
        attachedTo: null,
        unread: ['Twin dakkagun'],
        groups: INTERCESSORS.models.map((m, i) => ({
          modelId: m.id,
          models: i === 0 ? 1 : 4,
          weapons: [{ weaponId: INTERCESSORS.weapons[0]?.id ?? '', count: i === 0 ? 1 : 4 }],
        })),
      },
    ],
  };

  it('offers units, not the characters attached to them', () => {
    expect(pickableUnits(list)).toEqual([{ index: 1, label: 'Intercessor Squad ×5 + Captain' }]);
  });

  it('makes one weapon row per weapon with the list’s total, plus the attached character’s', () => {
    const rows = attackerRowsFromList(list, 1);
    expect(rows.map((r) => [r.name, r.models])).toEqual([
      [INTERCESSORS.weapons[0]?.name, 5],
      [`Captain: ${CAPTAIN.weapons[0]?.name ?? ''}`, 1],
    ]);
  });

  it('makes defender rows from the list’s model counts, the character as a CHARACTER row', () => {
    const defender = defenderFromList(list, 1, defaultForm().defender);
    expect(defender.groups.map((g) => [g.models, g.character])).toEqual([
      [5, false],
      [1, true],
    ]);
    expect(defender.source).toBe('Intercessor Squad + Captain');
    expect(defender.attached).toBe(true);
  });
});

describe('list melee weapons', () => {
  const knights = (groups: MathhammerList['units'][number]['groups']): MathhammerList => ({
    army: null,
    datasheets: [KNIGHT],
    units: [
      {
        label: 'Knights',
        name: 'Knights',
        datasheetId: KNIGHT.id,
        attachedTo: null,
        unread: [],
        groups,
      },
    ],
  });

  it('keeps each melee weapon’s own row when the list gives them to different models', () => {
    const rows = attackerRowsFromList(
      knights([
        {
          modelId: 'm-knight',
          models: 3,
          weapons: [
            { weaponId: 'wi-chain', count: 2 },
            { weaponId: 'wi-gaunt', count: 1 },
          ],
        },
      ]),
      0,
    );
    expect(rows.map((r) => [r.name, r.models])).toEqual([
      ['Reaper chainsword', 2],
      ['Thunderstrike gauntlet', 1],
    ]);
  });

  it('makes one Best row when every model carries several melee weapons', () => {
    const rows = attackerRowsFromList(
      knights([
        {
          modelId: 'm-knight',
          models: 1,
          weapons: [
            { weaponId: 'wi-chain', count: 1 },
            { weaponId: 'wi-gaunt', count: 1 },
          ],
        },
      ]),
      0,
    );
    expect(rows.map((r) => [r.name, r.models, r.profile])).toEqual([
      ['Reaper chainsword / Thunderstrike gauntlet', 1, 'best'],
    ]);
  });
});

describe('list units without weapons', () => {
  it('fall back to the datasheet’s default loadout for the listed models', () => {
    const list: MathhammerList = {
      army: null,
      datasheets: [INTERCESSORS],
      units: [
        {
          label: 'Intercessor Squad ×10',
          name: 'Intercessor Squad',
          datasheetId: INTERCESSORS.id,
          attachedTo: null,
          unread: [],
          groups: [
            { modelId: 'm-sgt', models: 1, weapons: [] },
            { modelId: 'm-int', models: 9, weapons: [] },
          ],
        },
      ],
    };
    const rows = attackerRowsFromList(list, 0);
    expect(rows.find((r) => r.name === 'Bolt rifle')?.models).toBe(10);
  });
});

describe('changes from the datasheet', () => {
  it('keeps what the datasheet filled in, and says which fields differ from it', () => {
    const [rifle] = attackerRows(INTERCESSORS, 0, []);
    if (rifle === undefined) throw new Error('no rifle');
    expect(weaponChanges(rifle)).toEqual([]);
    const edited = { ...rifle, attacks: '3', heavy: true };
    expect(weaponChanges(edited)).toEqual(['attacks', 'heavy']);
    expect(originalText(edited, 'attacks')).toBe('2');
    expect(originalText(edited, 'heavy')).toBe('off');
    // Typed back to the datasheet's value: no longer a change.
    expect(weaponChanges({ ...edited, attacks: '2', heavy: false })).toEqual([]);
  });

  it('marks rows added by hand, and puts a row back to the datasheet', () => {
    expect(newWeapon().original).toBeNull();
    const [rifle] = attackerRows(INTERCESSORS, 0, []);
    if (rifle === undefined) throw new Error('no rifle');
    expect(resetWeapon({ ...rifle, attacks: '9', models: 1 })).toMatchObject({
      attacks: rifle.attacks,
      models: rifle.models,
    });
  });

  it('keeps the datasheet’s model rows and defender switches too', () => {
    const defender = defenderFrom(INTERCESSORS, 0, [], defaultForm().defender);
    const [row] = defender.groups;
    if (row === undefined) throw new Error('no row');
    expect(groupChanges({ ...row, save: 2 })).toEqual(['save']);
    expect(defenderChanges({ ...defender, stealth: true })).toEqual(['stealth']);
  });

  it('starts the page with nothing marked as changed', () => {
    const form = defaultForm();
    expect(form.weapons.flatMap(weaponChanges)).toEqual([]);
    expect(form.defender.groups.flatMap(groupChanges)).toEqual([]);
    expect(defenderChanges(form.defender)).toEqual([]);
  });
});

describe('datasheet keywords in the weapon’s boxes', () => {
  it('fills a weapon’s boxes from its datasheet keywords', () => {
    const [rifle] = attackerRows(INTERCESSORS, 0, []);
    expect(rifle?.rapidFire).toBe('1');
  });

  it('lets an unticked datasheet keyword stop counting', () => {
    const [rifle] = attackerRows(INTERCESSORS, 0, []);
    if (rifle === undefined) throw new Error('no rifle');
    const form = {
      ...defaultForm(),
      weapons: [{ ...rifle, keywordNames: ['Twin-linked'], twinLinked: false }],
    };
    const read = toCalculation(form);
    if (!('calculation' in read)) throw new Error(read.error);
    expect(read.calculation.weapons[0]?.mods.woundReroll).toBe('none');
    const ticked = toCalculation({
      ...form,
      weapons: [{ ...rifle, keywordNames: ['Twin-linked'], twinLinked: true }],
    });
    if (!('calculation' in ticked)) throw new Error(ticked.error);
    expect(ticked.calculation.weapons[0]?.mods.woundReroll).toBe('failures');
  });
});

describe('wargear options', () => {
  const withOption = {
    ...INTERCESSORS,
    weapons: [
      ...INTERCESSORS.weapons,
      {
        id: 'wi-ab',
        name: 'Auto bolt rifle',
        profiles: [
          { ...(INTERCESSORS.weapons[0]?.profiles[0] ?? ({} as never)), name: 'Auto bolt rifle' },
        ],
      },
    ],
  };

  it('adds every weapon the datasheet can take, the options not counted until chosen', () => {
    const rows = attackerRows(withOption, 0, []);
    expect(rows.map((r) => [r.name, r.models, r.option])).toEqual([
      ['Bolt rifle', 5, false],
      ['Plasma gun', 1, false],
      ['Auto bolt rifle', 0, true],
    ]);
  });

  it('adds an attached character’s options too, under its name', () => {
    const rows = attackerRows(INTERCESSORS, 0, [
      { ...CAPTAIN, weapons: [...CAPTAIN.weapons, ...withOption.weapons.slice(-1)] },
    ]);
    expect(rows.at(-1)).toMatchObject({
      name: 'Captain: Auto bolt rifle',
      models: 0,
      option: true,
    });
  });
});
