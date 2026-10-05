import { describe, expect, it } from 'vitest';
import { atLeast } from './dice';
import { calculate } from './engine';
import { simulate } from './simulate';
import { SITUATION as S, calc, defender, group, weapon } from './test-helpers';
import type { Calculation } from './types';

/** Mixed setups covering every rule; the exact engine must agree with 200,000 rolled games. */
const SCENARIOS: [string, Calculation][] = [
  [
    'bolters into boyz',
    calc({
      weapons: [weapon({ models: 10, attacks: '2', ap: -1 })],
      defender: defender({ groups: [group({ models: 20, toughness: 5, save: 5 })] }),
    }),
  ],
  [
    'D3 damage into W2, overkill',
    calc({
      weapons: [weapon({ models: 5, attacks: '2', strength: 8, ap: -3, damage: '3' })],
      defender: defender({ groups: [group({ models: 10, wounds: 2 })] }),
    }),
  ],
  [
    'D6 damage re-rolled, FNP 5+',
    calc({
      weapons: [
        weapon({
          models: 2,
          attacks: '2',
          strength: 9,
          ap: -4,
          damage: 'D6',
          mods: { damageReroll: true },
        }),
      ],
      defender: defender({
        groups: [group({ models: 3, toughness: 10, wounds: 12, save: 2, invuln: 4, fnp: 5 })],
      }),
    }),
  ],
  [
    'Sustained 2 + Lethal, re-roll ones',
    calc({
      weapons: [
        weapon({
          models: 6,
          attacks: '3',
          strength: 5,
          mods: {
            sustainedHits: '2',
            lethalHits: true,
            hitReroll: 'ones',
            woundReroll: 'failures',
          },
        }),
      ],
      defender: defender({ groups: [group({ models: 10, save: 4 })] }),
    }),
  ],
  [
    'Devastating D3 into W3',
    calc({
      weapons: [
        weapon({
          models: 5,
          attacks: '3',
          damage: 'D3',
          mods: { devastatingWounds: true, critWoundOn: 5 },
        }),
      ],
      defender: defender({ groups: [group({ models: 5, wounds: 3, save: 2, invuln: 4 })] }),
    }),
  ],
  [
    'critical AP and damage',
    calc({
      weapons: [
        weapon({
          models: 5,
          attacks: '4',
          strength: 5,
          ap: -1,
          mods: { critAp: 2, critDamage: 1 },
        }),
      ],
      defender: defender({ groups: [group({ models: 6, wounds: 2 })] }),
    }),
  ],
  [
    'attached, leader saves better',
    calc({
      weapons: [weapon({ models: 10, attacks: '2', strength: 5, ap: -1 })],
      defender: defender({
        attached: true,
        groups: [
          group({ models: 4, wounds: 2 }),
          group({ models: 1, wounds: 5, save: 2, invuln: 4, character: true }),
        ],
      }),
    }),
  ],
  [
    'Precision into attached',
    calc({
      weapons: [weapon({ models: 5, attacks: '2', ap: -2, damage: '2', precision: true })],
      defender: defender({
        attached: true,
        groups: [
          group({ models: 5, wounds: 2 }),
          group({ models: 1, wounds: 4, character: true, fnp: 6 }),
        ],
      }),
    }),
  ],
  [
    'boyz and nob, two weapons',
    calc({
      weapons: [
        weapon({ models: 10, attacks: '2' }),
        weapon({ attacks: '1', strength: 9, ap: -3, damage: 'D6+1' }),
      ],
      defender: defender({
        groups: [
          group({ models: 9, toughness: 5, save: 5 }),
          group({ models: 1, toughness: 5, save: 5, wounds: 2 }),
        ],
      }),
    }),
  ],
  [
    'Torrent, Ignores Cover, in cover',
    calc({
      situation: { ...S, cover: true },
      weapons: [
        weapon({ models: 3, attacks: 'D6', skill: null, strength: 5, mods: { torrent: true } }),
        weapon({ models: 2, attacks: '2', mods: { ignoresCover: true } }),
      ],
      defender: defender({ groups: [group({ models: 10, save: 4 })] }),
    }),
  ],
  [
    'Blast 2D6, Rapid Fire D3',
    calc({
      situation: { ...S, halfRange: true },
      weapons: [
        weapon({ models: 2, attacks: '2D6', blast: 1, strength: 6, ap: -1 }),
        weapon({ models: 3, rapidFire: 'D3' }),
      ],
      defender: defender({ groups: [group({ models: 20, toughness: 3, save: 5 })] }),
    }),
  ],
  [
    'Melta, halved and reduced',
    calc({
      situation: { ...S, halfRange: true },
      weapons: [weapon({ models: 2, strength: 9, ap: -4, damage: 'D6', melta: 2 })],
      defender: defender({
        halveDamage: true,
        damageReduction: 1,
        groups: [group({ models: 2, toughness: 10, wounds: 12 })],
      }),
    }),
  ],
  [
    'snap shooting',
    calc({
      situation: { ...S, snapShooting: true },
      weapons: [
        weapon({ models: 10, attacks: '2', mods: { hitReroll: 'failures', sustainedHits: '1' } }),
      ],
      defender: defender({ groups: [group({ models: 10, save: 4 })] }),
    }),
  ],
  [
    'indirect, stationary and visible',
    calc({
      situation: { ...S, indirectShooting: true, indirectStationaryVisible: true },
      weapons: [
        weapon({
          models: 3,
          attacks: 'D6',
          strength: 5,
          indirectFire: true,
          blast: 1,
          mods: { hitReroll: 'failures' },
        }),
      ],
      defender: defender({ groups: [group({ models: 10, save: 4 })] }),
    }),
  ],
  [
    'Heavy, plunging, cover, -1 to hit',
    calc({
      situation: { ...S, plungingFire: true, cover: true },
      weapons: [
        weapon({ models: 4, attacks: '2', heavy: true, skill: 4, mods: { hitModifier: 1 } }),
      ],
      defender: defender({ hitModifier: -1, groups: [group({ models: 10, save: 4 })] }),
    }),
  ],
  [
    'Anti-infantry 4+ Devastating, Twin-linked',
    calc({
      weapons: [
        weapon({
          models: 4,
          attacks: '3',
          strength: 3,
          damage: '2',
          anti: [{ keyword: 'INFANTRY', value: 4 }],
          mods: { devastatingWounds: true, woundReroll: 'failures' },
        }),
      ],
      defender: defender({
        keywords: ['INFANTRY'],
        groups: [group({ models: 6, save: 2, wounds: 3, invuln: 5 })],
      }),
    }),
  ],
  [
    'Lance charging, one-die re-rolls',
    calc({
      situation: { ...S, charged: true },
      weapons: [
        weapon({
          melee: true,
          models: 5,
          attacks: '3',
          strength: 6,
          ap: -2,
          damage: '2',
          lance: true,
          mods: { woundRerollOneDie: true, hitRerollOneDie: true },
        }),
      ],
      defender: defender({ groups: [group({ models: 5, toughness: 7, wounds: 3 })] }),
    }),
  ],
  [
    'one damage re-roll',
    calc({
      weapons: [
        weapon({
          models: 3,
          attacks: '2',
          strength: 10,
          ap: -3,
          damage: 'D6',
          mods: { damageRerollOneDie: true },
        }),
      ],
      defender: defender({ groups: [group({ models: 4, toughness: 9, wounds: 6 })] }),
    }),
  ],
  [
    'flat D3 mortal wounds, FNP',
    calc({
      flatMortals: 'D3',
      weapons: [weapon({ models: 5, attacks: '2' })],
      defender: defender({ groups: [group({ models: 5, wounds: 2, fnp: 5 })] }),
    }),
  ],
  [
    'fishing for criticals on 5+',
    calc({
      weapons: [
        weapon({
          models: 5,
          attacks: '4',
          mods: { hitReroll: 'fish', sustainedHits: '1', critHitOn: 5 },
        }),
      ],
      defender: defender({ groups: [group({ models: 20, save: 6 })] }),
    }),
  ],
  [
    'Armour of Contempt, save penalties ignored',
    calc({
      situation: { ...S, armourOfContempt: true },
      weapons: [
        weapon({ models: 10, attacks: '2', ap: -2, mods: { saveModifier: 1, apImprove: 1 } }),
      ],
      defender: defender({ savePenaltiesIgnored: true, groups: [group({ models: 10 })] }),
    }),
  ],
];

const gap = (a: number[], b: number[]) => {
  const x = atLeast(a);
  const y = atLeast(b);
  let most = 0;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1)
    most = Math.max(most, Math.abs((x[i] ?? 0) - (y[i] ?? 0)));
  return most;
};

describe('engine against simulation', () => {
  it.each(SCENARIOS)(
    '%s',
    (_, setup) => {
      const exact = calculate(setup);
      const rolled = simulate(setup, exact.orders, 200_000, 7);
      expect(gap(exact.modelsSlain, rolled.modelsSlain)).toBeLessThan(0.005);
      expect(gap(exact.woundsDealt, rolled.woundsDealt)).toBeLessThan(0.005);
      expect(Math.abs(exact.averages.wasted - rolled.wasted)).toBeLessThan(
        0.02 + 0.01 * exact.averages.wasted,
      );
    },
    30_000,
  );
});

describe('speed', () => {
  it('three 2D6 Blast weapons into 21 models with a leader in under 300 ms', () => {
    const gun = weapon({
      models: 3,
      attacks: '2D6',
      skill: 4,
      strength: 5,
      ap: -1,
      blast: 1,
      mods: { sustainedHits: '1' },
    });
    const target = defender({
      attached: true,
      groups: [
        group({ models: 19, toughness: 5, save: 5, fnp: 6 }),
        group({ models: 1, toughness: 5, save: 5, wounds: 2, fnp: 6 }),
        group({ models: 1, toughness: 6, save: 4, invuln: 5, wounds: 6, fnp: 6, character: true }),
      ],
    });
    const setup = calc({
      weapons: [gun, gun, gun],
      defender: target,
      situation: { ...S, halfRange: true },
    });
    calculate(setup);
    const started = performance.now();
    calculate(setup);
    expect(performance.now() - started).toBeLessThan(300);
  });
});
