import type { MathhammerList } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import {
  attackerRows,
  attackerRowsFromList,
  defenderFrom,
  defenderFromList,
  pickableUnits,
} from './datasheet-form';
import { defaultForm } from './form-state';
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
    const previous = { ...defaultForm().defender, damageReduction: 1 };
    const defender = defenderFrom(INTERCESSORS, 0, [CAPTAIN], previous);
    expect(defender.groups.map((g) => [g.name, g.models, g.invuln, g.fnp, g.character])).toEqual([
      ['Intercessor / Intercessor Sergeant', 5, null, null, false],
      ['Captain', 1, 4, 6, true],
    ]);
    expect(defender).toMatchObject({
      source: 'Intercessor Squad + Captain',
      attached: true,
      keywords: 'INFANTRY, CHARACTER',
      damageReduction: 1,
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
