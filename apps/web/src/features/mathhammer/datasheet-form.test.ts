import { describe, expect, it } from 'vitest';
import { attackerRows, defenderFrom } from './datasheet-form';
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
