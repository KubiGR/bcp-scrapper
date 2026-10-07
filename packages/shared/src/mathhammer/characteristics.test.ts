import { describe, expect, it } from 'vitest';
import { calculate } from './engine';
import { calc, crowd, defender, group, weapon } from './test-helpers';

const step = (w: Parameters<typeof weapon>[0], d = crowd) =>
  calculate(calc({ weapons: [weapon(w)], defender: d })).breakdown[0];

describe('characteristic modifiers', () => {
  it('adds to or takes from Attacks, never below 1', () => {
    expect(step({ attacks: '2', mods: { attacksModifier: 1 } })?.attacks).toBeCloseTo(3, 9);
    // D3 - 1: 1, 1, 2.
    expect(step({ attacks: 'D3', mods: { attacksModifier: -1 } })?.attacks).toBeCloseTo(4 / 3, 9);
  });

  it('improves or worsens BS/WS, between 2+ and 6+', () => {
    // 4+ improved by 1 hits on 3+.
    expect(step({ skill: 4, mods: { skillModifier: 1 } })?.hits).toBeCloseTo(4 / 6, 9);
    // 2+ can't improve further; 6+ can't worsen further.
    expect(step({ skill: 2, mods: { skillModifier: 2 } })?.hits).toBeCloseTo(5 / 6, 9);
    expect(step({ skill: 5, mods: { skillModifier: -3 } })?.hits).toBeCloseTo(1 / 6, 9);
  });

  it('adds to or takes from Strength, never below 1', () => {
    const t5 = defender({ groups: [group({ models: 100, toughness: 5, save: 7 })] });
    const torrent = { skill: null, mods: { torrent: true } };
    // S4 into T5 wounds on 5+; S5 on 4+.
    expect(step({ ...torrent, strength: 4 }, t5)?.wounds).toBeCloseTo(2 / 6, 9);
    expect(
      step({ ...torrent, strength: 4, mods: { torrent: true, strengthModifier: 1 } }, t5)?.wounds,
    ).toBeCloseTo(3 / 6, 9);
    // S1 - 3 stays S1: into T5 that's 6+ to wound.
    expect(
      step({ ...torrent, strength: 1, mods: { torrent: true, strengthModifier: -3 } }, t5)?.wounds,
    ).toBeCloseTo(1 / 6, 9);
  });
});
