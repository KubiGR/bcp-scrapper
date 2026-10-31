import { describe, expect, it } from 'vitest';
import { defaultForm, newWeapon, sitsOut, toCalculation, type MathhammerForm } from './form-state';

const read = (form: MathhammerForm) => toCalculation(form);

describe('toCalculation', () => {
  it('turns the starting setup into a calculation', () => {
    const result = read(defaultForm());
    if (!('calculation' in result)) throw new Error(result.error);
    const { weapons, defender } = result.calculation;
    expect(weapons[0]).toMatchObject({
      name: 'Bolt rifle',
      models: 5,
      attacks: '2',
      ap: -1,
      heavy: true,
    });
    expect(defender.keywords).toEqual(['INFANTRY', 'ORKS']);
    expect(defender.groups[0]).toEqual({
      name: 'Boyz',
      models: 10,
      toughness: 5,
      save: 5,
      invuln: null,
      invulnAgainst: 'all',
      wounds: 1,
      fnp: null,
      character: false,
    });
  });

  it('adds a weapon’s keywords to the unit’s switches', () => {
    const form = defaultForm();
    const weapon = form.weapons[0];
    if (weapon === undefined) throw new Error('no weapon');
    form.weapons = [{ ...weapon, twinLinked: true, sustainedHits: '1', anti: 'infantry 4+' }];
    const result = read(form);
    if (!('calculation' in result)) throw new Error(result.error);
    expect(result.calculation.weapons[0]?.mods).toMatchObject({
      woundReroll: 'failures',
      sustainedHits: '1',
    });
    expect(result.calculation.weapons[0]?.anti).toEqual([{ keyword: 'INFANTRY', value: 4 }]);
  });

  it('says what it can’t read', () => {
    const form = defaultForm();
    const weapon = form.weapons[0];
    if (weapon === undefined) throw new Error('no weapon');
    form.weapons = [{ ...weapon, attacks: '2Q', anti: 'infantry' }];
    const result = read(form);
    expect('error' in result && result.error).toMatch(/Bolt rifle attacks: can’t read “2Q”/);
    expect('error' in result && result.error).toMatch(/can’t read Anti/);
    expect(read({ ...defaultForm(), defender: { ...defaultForm().defender, groups: [] } })).toEqual(
      {
        error: 'Add at least one kind of model to the target',
      },
    );
  });
});

describe('sitsOut', () => {
  const rifle = { ...newWeapon(), name: 'Bolt rifle', models: 5 };
  const pistol = {
    ...newWeapon(),
    name: 'Bolt pistol',
    models: 5,
    keywordNames: ['CLOSE-QUARTERS'],
  };
  const fists = { ...newWeapon(), name: 'Fists', models: 5, melee: true };
  const form: MathhammerForm = { ...defaultForm(), weapons: [rifle, pistol, fists] };

  it('shooting uses guns, pistols only when there are no other guns', () => {
    expect(form.weapons.map((w) => sitsOut(form, w))).toEqual([
      null,
      'Not used: the models fire their other guns',
      'Not used when shooting',
    ]);
    const pistolsOnly = { ...form, weapons: [pistol, fists] };
    expect(sitsOut(pistolsOnly, pistol)).toBeNull();
  });

  it('pistols sit out only for their own unit’s other guns', () => {
    const squadPistol = { ...pistol, owner: 'Assault Intercessors' };
    const captainGun = { ...rifle, owner: 'Captain' };
    const mixed = { ...form, weapons: [squadPistol, captainGun] };
    expect(sitsOut(mixed, squadPistol)).toBeNull();
  });

  it('a weapon with melee and ranged profiles takes part in both phases, with the fitting profile', () => {
    const spear = {
      ...newWeapon(),
      name: 'Guardian spear',
      models: 5,
      profile: 'best' as const,
      profiles: [
        {
          name: 'Melee',
          melee: true,
          range: 'Melee',
          attacks: '5',
          skill: 2,
          strength: 7,
          ap: -2,
          damage: '2',
          keywords: [],
        },
        {
          name: 'Ranged',
          melee: false,
          range: '24"',
          attacks: '2',
          skill: 2,
          strength: 4,
          ap: -1,
          damage: '2',
          keywords: [],
        },
      ],
    };
    const shooting = { ...defaultForm(), weapons: [spear] };
    const fighting = { ...shooting, phase: 'fighting' as const };
    expect(sitsOut(shooting, spear)).toBeNull();
    expect(sitsOut(fighting, spear)).toBeNull();
    const shot = toCalculation(shooting);
    const fought = toCalculation(fighting);
    expect('calculation' in shot && shot.calculation.weapons[0]?.melee).toBe(false);
    expect('calculation' in fought && fought.calculation.weapons[0]?.melee).toBe(true);
  });

  it('fighting uses melee weapons only, and the calculation leaves the rest out', () => {
    const fighting = { ...form, phase: 'fighting' as const };
    expect(fighting.weapons.map((w) => sitsOut(fighting, w))).toEqual([
      'Not used when fighting',
      'Not used when fighting',
      null,
    ]);
    const read = toCalculation(fighting);
    expect('calculation' in read && read.calculation.weapons.map((w) => w.name)).toEqual(['Fists']);
  });
});
