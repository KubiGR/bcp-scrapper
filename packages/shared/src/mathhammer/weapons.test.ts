import { describe, expect, it } from 'vitest';
import { DEFAULT_MODS } from './types';
import { buildWeapon, NO_KEYWORDS, parseAnti, type WeaponProfile } from './weapons';

const profile: WeaponProfile = {
  name: 'Bolt rifle',
  models: 5,
  melee: false,
  attacks: '2',
  skill: 3,
  strength: 4,
  ap: -1,
  damage: '1',
};

describe('buildWeapon', () => {
  it('keeps the profile and the unit’s switches', () => {
    const weapon = buildWeapon(profile, NO_KEYWORDS, { ...DEFAULT_MODS, hitModifier: 1 });
    expect(weapon).toMatchObject({ name: 'Bolt rifle', models: 5, attacks: '2', ap: -1 });
    expect(weapon.mods.hitModifier).toBe(1);
  });

  it('switches on what the weapon’s keywords give, never off', () => {
    const keywords = {
      ...NO_KEYWORDS,
      lethalHits: true,
      sustainedHits: '2',
      twinLinked: true,
      blast: 1,
    };
    const weapon = buildWeapon(profile, keywords, { ...DEFAULT_MODS, devastatingWounds: true });
    expect(weapon.mods).toMatchObject({
      lethalHits: true,
      sustainedHits: '2',
      devastatingWounds: true,
      woundReroll: 'failures',
    });
    expect(weapon.blast).toBe(1);
    expect(
      buildWeapon(
        profile,
        { ...NO_KEYWORDS, twinLinked: true },
        { ...DEFAULT_MODS, woundReroll: 'fish' },
      ).mods.woundReroll,
    ).toBe('fish');
  });
});

describe('parseAnti', () => {
  it('reads keyword and value pairs', () => {
    expect(parseAnti('INFANTRY 4+, vehicle 3+')).toEqual([
      { keyword: 'INFANTRY', value: 4 },
      { keyword: 'VEHICLE', value: 3 },
    ]);
    expect(parseAnti('Anti-monster 2+')).toEqual([{ keyword: 'MONSTER', value: 2 }]);
    expect(parseAnti('')).toEqual([]);
    expect(parseAnti('infantry')).toBeNull();
  });
});
