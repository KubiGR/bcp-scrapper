import { DEFAULT_MODS } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { appliedModifiers, defenderSummary, situationLabels, weaponSummary } from './share-summary';
import { defaultForm, NO_SITUATION } from './form-state';

const weapon = {
  name: 'Chainblades',
  models: 3,
  melee: true,
  attacks: '5',
  skill: 3,
  strength: 8,
  ap: -3,
  damage: '2',
  heavy: false,
  lance: false,
  precision: false,
  indirectFire: false,
  anti: [{ keyword: 'MONSTER', value: 3 }],
  rapidFire: null,
  blast: null,
  cleave: null,
  melta: null,
  mods: { ...DEFAULT_MODS, sustainedHits: '1', hitReroll: 'ones' as const, critHitOn: 5 },
};

describe('share summary', () => {
  it('writes a weapon’s profile and what changes its dice', () => {
    expect(weaponSummary(weapon)).toEqual({
      name: '3× Chainblades',
      stats: 'A 5 · WS 3+ · S 8 · AP -3 · D 2',
      tags: ['Anti-MONSTER 3+', 'Re-roll hits: 1s', 'Critical hits 5+', 'Sustained Hits 1'],
    });
  });

  it('writes a weapon without a skill (Torrent) and its own keywords', () => {
    const torrent = {
      ...weapon,
      melee: false,
      skill: null,
      anti: [],
      rapidFire: '1',
      melta: 2,
      mods: { ...DEFAULT_MODS, torrent: true },
    };
    expect(weaponSummary(torrent).stats).toBe('A 5 · BS – · S 8 · AP -3 · D 2');
    expect(weaponSummary(torrent).tags).toEqual(['Rapid Fire 1', 'Melta 2', 'Torrent']);
  });

  it('writes the defender’s models and what protects them', () => {
    const summary = defenderSummary({
      groups: [
        {
          name: 'C’tan',
          models: 1,
          toughness: 11,
          save: 3,
          invuln: 4,
          wounds: 16,
          fnp: 5,
          character: true,
        },
      ],
      keywords: ['MONSTER'],
      attached: false,
      stealth: true,
      hitModifier: -1,
      woundModifier: 0,
      damageReduction: 1,
      halveDamage: false,
      savePenaltiesIgnored: false,
    });
    expect(summary.models).toEqual(['1× C’tan (Character) · T 11 · Sv 3+ · 4++ · W 16 · FNP 5+']);
    expect(summary.tags).toEqual(['Stealth', '-1 to be hit', 'Damage −1', 'MONSTER']);
  });

  it('names the situation’s ticked boxes', () => {
    expect(situationLabels({ ...NO_SITUATION, charged: true, cover: true })).toEqual([
      'Charged',
      'Target in cover',
    ]);
  });

  it('names the characteristic changes', () => {
    const changed = {
      ...weapon,
      anti: [],
      mods: { ...DEFAULT_MODS, attacksModifier: 1, skillModifier: 1, strengthModifier: -1 },
    };
    expect(weaponSummary(changed).tags).toEqual(['Attacks +1', 'BS/WS +1', 'Strength -1']);
  });
});

describe('appliedModifiers', () => {
  it('lists what was set on top of the datasheets and the starting setup', () => {
    const form = defaultForm();
    const [rifle] = form.weapons;
    if (rifle === undefined) throw new Error('no rifle');
    form.unit = { ...DEFAULT_MODS, lethalHits: true, strengthModifier: 1 };
    form.situation = { ...form.situation, cover: false, charged: true };
    form.weapons = [{ ...rifle, attacks: '3' }];
    form.defender = { ...form.defender, stealth: true };
    expect(appliedModifiers(form)).toEqual([
      'Unit: Strength +1 · Lethal Hits',
      'Situation: Half range · Charged',
      'Bolt rifle: Attacks 3 (was 2)',
      'Defender: Stealth on (was off)',
    ]);
  });

  it('lists the situation as it is, even when it’s the starting one', () => {
    expect(appliedModifiers(defaultForm())).toEqual(['Situation: Half range · Target in cover']);
  });
});
