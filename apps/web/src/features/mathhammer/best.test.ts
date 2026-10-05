import type { UnitProfile } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { calculateForm } from './best';
import { defaultForm, newGroup, newWeapon, toCalculation, type MathhammerForm } from './form-state';

const profile = (p: Partial<UnitProfile> & Pick<UnitProfile, 'name'>): UnitProfile => ({
  melee: false,
  range: '24"',
  attacks: '1',
  skill: 3,
  strength: 4,
  ap: 0,
  damage: '1',
  keywords: [],
  ...p,
});

/** A weapon with a many-shot and a single big-shot profile, set to Best, into `groups`. */
function setup(models: number, wounds: number, save: number): MathhammerForm {
  const form = defaultForm();
  return {
    ...form,
    weapons: [
      {
        ...newWeapon(),
        name: 'Gun',
        profile: 'best',
        profiles: [
          profile({ name: 'Rapid', attacks: '3' }),
          profile({ name: 'Heavy shot', strength: 8, ap: -3, damage: '3' }),
        ],
      },
    ],
    defender: { ...form.defender, keywords: '', groups: [{ ...newGroup(), models, wounds, save }] },
  };
}

describe('calculateForm', () => {
  it('picks the profile that slays most against this target', () => {
    const weak = setup(10, 1, 7);
    const strong = setup(1, 3, 2);
    const weakResult = calculateForm(weak);
    const strongResult = calculateForm(strong);
    const key = weak.weapons[0]?.key ?? '';
    expect('best' in weakResult && weakResult.best[key]).toBe('Rapid');
    expect('best' in strongResult && strongResult.best[strong.weapons[0]?.key ?? '']).toBe(
      'Heavy shot',
    );
  });
});

describe('toCalculation with datasheet weapons', () => {
  it('reads the weapon’s ability names against the target', () => {
    const form = defaultForm();
    const gun = {
      ...newWeapon(),
      keywordNames: ['LETHAL HITS: non-MONSTER/VEHICLE'],
      profiles: [profile({ name: 'Gun' })],
    };
    const infantry = toCalculation({ ...form, weapons: [gun] });
    const tank = toCalculation({
      ...form,
      weapons: [gun],
      defender: { ...form.defender, keywords: 'VEHICLE' },
    });
    expect('calculation' in infantry && infantry.calculation.weapons[0]?.mods.lethalHits).toBe(
      true,
    );
    expect('calculation' in tank && tank.calculation.weapons[0]?.mods.lethalHits).toBe(false);
  });

  it('uses a weapon’s own switches instead of the unit’s', () => {
    const form = defaultForm();
    const own = { ...newWeapon(), own: { ...form.unit, hitModifier: 1 } };
    const read = toCalculation({ ...form, weapons: [own, newWeapon()] });
    if (!('calculation' in read)) throw new Error(read.error);
    expect(read.calculation.weapons.map((w) => w.mods.hitModifier)).toEqual([1, 0]);
  });
});
