import { describe, expect, it } from 'vitest';
import { calculate, DiceError } from './engine';
import { SITUATION, calc, crowd, defender, group, weapon } from './test-helpers';
import type { Situation, Weapon } from './types';

/** Average wounds of a calculation (into `crowd`: hits × wound chance, nothing saved). */
const wounds = (c: Parameters<typeof calc>[0]) =>
  calculate(calc({ defender: crowd, ...c })).averages.woundsDealt;
const at = (s: Partial<Situation>) => ({ ...SITUATION, ...s });

describe('calculate', () => {
  it('matches a hand-worked case: 10 attacks BS3+ S4 AP-1 D1 into T4 Sv3+', () => {
    const result = calculate(
      calc({
        weapons: [weapon({ models: 10, ap: -1 })],
        defender: defender({ groups: [group({ models: 20 })] }),
      }),
    );
    expect(result.averages.woundsDealt).toBeCloseTo(10 * (4 / 6) * (1 / 2) * (1 / 2));
    expect(result.modelsSlain.reduce((s, p) => s + p, 0)).toBeCloseTo(1);
  });

  it('hits: BS, cover and Ignores Cover, plunging fire, Heavy, Damaged, the ±1 cap', () => {
    const six = weapon({ models: 6 });
    expect(wounds({ weapons: [six] })).toBeCloseTo(2);
    expect(wounds({ weapons: [six], situation: at({ cover: true }) })).toBeCloseTo(1.5);
    expect(
      wounds({
        weapons: [weapon({ models: 6, mods: { ignoresCover: true } })],
        situation: at({ cover: true }),
      }),
    ).toBeCloseTo(2);
    expect(wounds({ weapons: [six], defender: { ...crowd, stealth: true } })).toBeCloseTo(1.5);
    expect(wounds({ weapons: [six], situation: at({ plungingFire: true }) })).toBeCloseTo(2.5);
    expect(wounds({ weapons: [weapon({ models: 6, heavy: true })] })).toBeCloseTo(2.5);
    expect(
      wounds({
        weapons: [weapon({ models: 6, heavy: true })],
        situation: at({ movedOver3: true }),
      }),
    ).toBeCloseTo(2);
    expect(
      wounds({ weapons: [weapon({ models: 6, heavy: true, mods: { hitModifier: 1 } })] }),
    ).toBeCloseTo(2.5);
    expect(wounds({ weapons: [six], situation: at({ attackerDamaged: true }) })).toBeCloseTo(1.5);
    expect(
      wounds({
        weapons: [weapon({ models: 6, mods: { hitModifier: -1, hitIgnorePenalties: true } })],
      }),
    ).toBeCloseTo(2);
  });

  it('ignoring penalties drops the -1s and keeps the +1s', () => {
    const heavy = weapon({ models: 6, heavy: true, mods: { hitIgnorePenalties: true } });
    const minusOne = { ...crowd, hitModifier: -1 };
    expect(wounds({ weapons: [heavy], defender: minusOne })).toBeCloseTo(2.5);
    const lance = weapon({ models: 6, lance: true, mods: { woundIgnorePenalties: true } });
    expect(
      wounds({
        weapons: [lance],
        defender: { ...crowd, woundModifier: -1 },
        situation: at({ charged: true }),
      }),
    ).toBeCloseTo(6 * (4 / 6) * (4 / 6));
  });

  it('snap shooting hits only on 6s, without criticals or re-rolls', () => {
    const gun = weapon({ models: 6, mods: { sustainedHits: '1', hitReroll: 'failures' } });
    expect(wounds({ weapons: [gun], situation: at({ snapShooting: true }) })).toBeCloseTo(0.5);
  });

  it('indirect shooting: cover, no re-rolls, 6s only unless stationary and visible', () => {
    const gun = weapon({ models: 6, indirectFire: true, mods: { hitReroll: 'failures' } });
    expect(wounds({ weapons: [gun], situation: at({ indirectShooting: true }) })).toBeCloseTo(0.5);
    expect(
      wounds({
        weapons: [gun],
        situation: at({ indirectShooting: true, indirectStationaryVisible: true }),
      }),
    ).toBeCloseTo(1.5);
  });

  it('Torrent, Lance, Anti-X, Rapid Fire and Blast', () => {
    expect(
      wounds({ weapons: [weapon({ models: 6, skill: null, mods: { torrent: true } })] }),
    ).toBeCloseTo(3);
    expect(
      wounds({ weapons: [weapon({ models: 6, lance: true })], situation: at({ charged: true }) }),
    ).toBeCloseTo(6 * (4 / 6) * (4 / 6));
    const anti = weapon({ models: 6, strength: 3, anti: [{ keyword: 'INFANTRY', value: 4 }] });
    expect(wounds({ weapons: [anti] })).toBeCloseTo(6 * (4 / 6) * (2 / 6));
    expect(wounds({ weapons: [anti], defender: { ...crowd, keywords: ['Infantry'] } })).toBeCloseTo(
      2,
    );
    // '*': an Anti that applies whatever the target (a 'non-' Anti the target qualifies for).
    const anyTarget = weapon({ models: 6, strength: 3, anti: [{ keyword: '*', value: 4 }] });
    expect(wounds({ weapons: [anyTarget] })).toBeCloseTo(2);
    const rapid = weapon({ models: 6, rapidFire: '1' });
    expect(wounds({ weapons: [rapid], situation: at({ halfRange: true }) })).toBeCloseTo(4);
    expect(wounds({ weapons: [rapid] })).toBeCloseTo(2);
    // 1 attack + 1 per 5 of 10 models.
    const blast = calculate(
      calc({
        weapons: [weapon({ blast: 1 })],
        defender: defender({ groups: [group({ models: 10, save: 7 })] }),
      }),
    );
    expect(blast.averages.woundsDealt).toBeCloseTo(3 * (4 / 6) * (1 / 2));
  });

  it('saves: AP, invulnerable saves, Armour of Contempt, worsened saves', () => {
    const target = defender({ groups: [group({ models: 100, save: 4 })] });
    const sure = weapon({ models: 6, skill: null, strength: 8, mods: { torrent: true } });
    const ap1 = { ...sure, ap: -1 };
    const base = 6 * (5 / 6);
    expect(calculate(calc({ weapons: [ap1], defender: target })).averages.woundsDealt).toBeCloseTo(
      base * (4 / 6),
    );
    expect(
      calculate(
        calc({ weapons: [ap1], defender: target, situation: at({ armourOfContempt: true }) }),
      ).averages.woundsDealt,
    ).toBeCloseTo(base * (3 / 6));
    const invuln = defender({ groups: [group({ models: 100, save: 4, invuln: 5 })] });
    expect(
      calculate(calc({ weapons: [{ ...sure, ap: -3 }], defender: invuln })).averages.woundsDealt,
    ).toBeCloseTo(base * (4 / 6));
    const shooting = defender({
      groups: [group({ models: 100, save: 4, invuln: 5, invulnAgainst: 'ranged' })],
    });
    const dealt = (melee: boolean, target = shooting) =>
      calculate(calc({ weapons: [{ ...sure, ap: -3, melee }], defender: target })).averages
        .woundsDealt;
    expect(dealt(false)).toBeCloseTo(base * (4 / 6));
    expect(dealt(true)).toBeCloseTo(base);
    const fighting = defender({
      groups: [group({ models: 100, save: 4, invuln: 5, invulnAgainst: 'melee' })],
    });
    expect(dealt(false, fighting)).toBeCloseTo(base);
    expect(dealt(true, fighting)).toBeCloseTo(base * (4 / 6));
    const worse = { ...sure, mods: { ...sure.mods, saveModifier: 1 } };
    expect(
      calculate(calc({ weapons: [worse], defender: target })).averages.woundsDealt,
    ).toBeCloseTo(base * (4 / 6));
    expect(
      calculate(calc({ weapons: [worse], defender: { ...target, savePenaltiesIgnored: true } }))
        .averages.woundsDealt,
    ).toBeCloseTo(base * (3 / 6));
  });

  it('damage: overkill is wasted, Feel No Pain, Melta, halving and reduction', () => {
    const sure = weapon({ skill: null, strength: 8, damage: 'D3', mods: { torrent: true } });
    const ones = defender({ groups: [group({ models: 5, save: 7 })] });
    const r = calculate(calc({ weapons: [sure], defender: ones }));
    expect(r.averages.modelsSlain).toBeCloseTo(5 / 6);
    expect(r.averages.wasted).toBeCloseTo((5 / 6) * 1);
    const fnp = defender({ groups: [group({ models: 5, save: 7, fnp: 4 })] });
    expect(
      calculate(calc({ weapons: [{ ...sure, damage: '1' }], defender: fnp })).averages.modelsSlain,
    ).toBeCloseTo(5 / 6 / 2);
    const big = defender({ groups: [group({ models: 1, save: 7, wounds: 20 })] });
    const melta = { ...sure, damage: '2', melta: 2 };
    expect(
      calculate(calc({ weapons: [melta], defender: big, situation: at({ halfRange: true }) }))
        .averages.woundsDealt,
    ).toBeCloseTo((5 / 6) * 4);
    expect(
      calculate(
        calc({ weapons: [melta], defender: { ...big, halveDamage: true, damageReduction: 1 } }),
      ).averages.woundsDealt,
    ).toBeCloseTo(5 / 6);
  });

  it('Psychic: ignores what worsens the hit, meets Feel No Pain against psychic attacks', () => {
    const hitsOf = (w: Weapon, situation = at({})) =>
      calculate(calc({ weapons: [w], defender: crowd, situation })).averages.woundsDealt;
    // S4 into T4: half the hits wound, no save.
    const gun = weapon({ models: 6, mods: { hitModifier: -1, skillModifier: -1 } });
    expect(hitsOf(gun, at({ cover: true }))).toBeCloseTo(6 * (1 / 6) * (1 / 2));
    expect(hitsOf({ ...gun, psychic: true }, at({ cover: true }))).toBeCloseTo(
      6 * (4 / 6) * (1 / 2),
    );
    // What improves the hit still counts.
    const better = weapon({ models: 6, mods: { hitModifier: 1 }, psychic: true });
    expect(hitsOf(better)).toBeCloseTo(6 * (5 / 6) * (1 / 2));

    const sure = weapon({ models: 6, skill: null, strength: 8, mods: { torrent: true } });
    const hooded = defender({ groups: [group({ models: 100, save: 7, fnp: 6, fnpPsychic: 4 })] });
    const dealt = (psychic: boolean) =>
      calculate(calc({ weapons: [{ ...sure, psychic }], defender: hooded })).averages.woundsDealt;
    expect(dealt(false)).toBeCloseTo(6 * (5 / 6) * (5 / 6));
    expect(dealt(true)).toBeCloseTo(6 * (5 / 6) * (3 / 6));
  });

  it('Devastating Wounds: mortal wounds after normal damage, one model per critical wound', () => {
    const dev = weapon({
      skill: null,
      strength: 8,
      damage: '3',
      mods: { torrent: true, devastatingWounds: true, critWoundOn: 2 },
    });
    const r = calculate(
      calc({
        weapons: [dev],
        defender: defender({ groups: [group({ models: 5, save: 2, invuln: 2 })] }),
      }),
    );
    expect(r.averages.modelsSlain).toBeCloseTo(5 / 6);
    expect(r.averages.wasted).toBeCloseTo((5 / 6) * 2);
  });

  it('attached units: bodyguard Toughness, the leader last, Precision, leader slain', () => {
    const guard = group({ models: 1, toughness: 3, save: 7 });
    const leader = group({ models: 1, toughness: 8, save: 7, character: true });
    const s4 = weapon({ skill: null, mods: { torrent: true } });
    const attached = calculate(
      calc({ weapons: [s4], defender: defender({ attached: true, groups: [guard, leader] }) }),
    );
    // S4 vs the bodyguard's T3: wounds on 3+.
    expect(attached.averages.modelsSlain).toBeCloseTo(4 / 6);
    expect(attached.leaderSlain).toBeCloseTo(0);
    const precise = calculate(
      calc({
        weapons: [{ ...s4, precision: true }],
        defender: defender({ attached: true, groups: [guard, leader] }),
      }),
    );
    expect(precise.leaderSlain).toBeCloseTo(4 / 6);
  });

  it('the defender declares the order that loses the fewest models', () => {
    const boyz = group({ name: 'Boyz', models: 9, save: 7 });
    const nob = group({ name: 'Nob', models: 1, save: 7, wounds: 2 });
    const r = calculate(
      calc({
        weapons: [weapon({ models: 2, skill: null, mods: { torrent: true } })],
        defender: defender({ groups: [boyz, nob] }),
      }),
    );
    expect(r.orders).toEqual([[1, 0]]);
  });

  it('skips weapons nobody fires, and a target with only a leader', () => {
    expect(calculate(calc({ weapons: [weapon({ models: 0 })] })).modelsSlain).toEqual([1]);
    const lone = defender({
      attached: true,
      groups: [group({ models: 1, save: 7, character: true })],
    });
    expect(
      calculate(
        calc({ weapons: [weapon({ skill: null, mods: { torrent: true } })], defender: lone }),
      ).leaderSlain,
    ).toBeCloseTo(1 / 2);
  });

  it('flat mortal wounds, the chance to wipe, and readable errors', () => {
    const r = calculate(
      calc({
        weapons: [],
        flatMortals: '2',
        defender: defender({ groups: [group({ models: 2 })] }),
      }),
    );
    expect(r.wipe).toBeCloseTo(1);
    expect(() => calculate(calc({ weapons: [weapon({ attacks: '2Q' })] }))).toThrow(DiceError);
  });
});
