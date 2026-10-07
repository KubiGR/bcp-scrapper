import { describe, expect, it } from 'vitest';
import { calculate } from './engine';
import { calc, crowd, defender, group, weapon } from './test-helpers';

const close = (actual: number | undefined, expected: number) => {
  expect(actual).toBeCloseTo(expected, 9);
};

describe('step-by-step breakdown', () => {
  it('averages attacks, hits, wounds, unsaved and damage per weapon', () => {
    // 10 attacks hitting on 3+ (6 is critical), wounding on 4+, into models without a save.
    const result = calculate(calc({ weapons: [weapon({ attacks: '10' })], defender: crowd }));
    const step = result.breakdown[0];
    expect(step?.name).toBe('Gun');
    close(step?.attacks, 10);
    close(step?.hits, 20 / 3);
    close(step?.critHits, 10 / 6);
    close(step?.wounds, 10 / 3);
    close(step?.critWounds, 10 / 9);
    close(step?.unsaved, 10 / 3);
    close(step?.damage, 10 / 3);
    close(step?.slain, 10 / 3);
    close(step?.wasted, 0);
  });

  it('counts Sustained Hits’ extra hits and Lethal Hits’ automatic wounds', () => {
    const result = calculate(
      calc({
        weapons: [weapon({ attacks: '10', mods: { sustainedHits: '1', lethalHits: true } })],
        defender: crowd,
      }),
    );
    const step = result.breakdown[0];
    close(step?.sustainedHits, 10 / 6);
    close(step?.lethalHits, 10 / 6);
    close(step?.hits, 25 / 3);
    // Normal hits and Sustained extras roll to wound (4+); Lethal ones wound outright.
    close(step?.wounds, 5);
  });

  it('takes the target’s save off the wounds', () => {
    const result = calculate(
      calc({
        weapons: [weapon({ attacks: '10' })],
        defender: defender({ groups: [group({ models: 100, save: 3 })] }),
      }),
    );
    close(result.breakdown[0]?.unsaved, 10 / 9);
    expect(result.breakdown[0]?.unsavedExact).toBe(true);
  });

  it('adds the re-rolled die of "re-roll one hit" exactly', () => {
    const result = calculate(
      calc({ weapons: [weapon({ mods: { hitRerollOneDie: true } })], defender: crowd }),
    );
    close(result.breakdown[0]?.hits, 4 / 6 + (2 / 6) * (4 / 6));
  });

  it('adds up to the result over several weapons, each after the ones before', () => {
    const result = calculate(
      calc({
        weapons: [weapon({ attacks: '6', damage: '2' }), weapon({ name: 'Sword', attacks: '4' })],
        defender: defender({ groups: [group({ models: 3, save: 4, wounds: 2 })] }),
      }),
    );
    const sum = (key: 'slain' | 'damage' | 'wasted') =>
      result.breakdown.reduce((total, step) => total + step[key], 0);
    close(sum('slain'), result.averages.modelsSlain);
    close(sum('damage'), result.averages.woundsDealt);
    close(sum('wasted'), result.averages.wasted);
  });

  it('gives each weapon a whole number of models slain that adds up to the median', () => {
    const result = calculate(
      calc({
        weapons: [weapon({ attacks: '6', damage: '2' }), weapon({ name: 'Sword', attacks: '4' })],
        defender: defender({ groups: [group({ models: 3, save: 4, wounds: 2 })] }),
      }),
    );
    // The median: the fewest models slain at least half the time.
    let sum = 0;
    const median = result.modelsSlain.findIndex((p) => (sum += p) >= 0.5 - 1e-9);
    for (const step of result.breakdown) expect(Number.isInteger(step.slainMedian)).toBe(true);
    expect(result.breakdown.reduce((total, step) => total + step.slainMedian, 0)).toBe(median);
  });

  it('shows a weapon’s whole volley even when the ones before it sometimes wipe the target', () => {
    // One 1-wound model, no save: the first gun often kills it before the second fires.
    const result = calculate(
      calc({
        weapons: [weapon({ attacks: '6' }), weapon({ name: 'Second', attacks: '8' })],
        defender: defender({ groups: [group({ models: 1, save: 7, wounds: 1 })] }),
      }),
    );
    const second = result.breakdown[1];
    close(second?.attacks, 8);
    close(second?.hits, 8 * (4 / 6));
    // What it adds still counts only the games where something was left to kill.
    expect(second?.slain ?? 1).toBeLessThan(1 - (result.breakdown[0]?.slain ?? 0) + 1e-9);
  });
});
