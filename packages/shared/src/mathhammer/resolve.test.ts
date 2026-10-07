import { describe, expect, it } from 'vitest';
import { currentGroup, faceClasses, losses, type DamageModel, type SaveProfile } from './allocate';
import { parseDice, point } from './dice';
import {
  classPass,
  createSpace,
  hitStep,
  startPass,
  startState,
  type Tag,
  type Tagged,
} from './resolve';
import { group } from './test-helpers';

const one: DamageModel = {
  raw: point(1),
  reroll: false,
  oneDie: false,
  final: (v) => Math.max(1, v),
};

describe('currentGroup', () => {
  const groups = [
    group({ models: 5 }),
    group({ models: 1, wounds: 2 }),
    group({ models: 1, character: true }),
  ];
  const allocation = { groups, priority: [0, 1, 2], precision: false };

  it('takes the declared order, a wounded group first, characters last', () => {
    expect(currentGroup([5, 0, 1, 0, 1, 0, 1], allocation)).toBe(0);
    expect(currentGroup([5, 0, 1, 1, 1, 0, 1], allocation)).toBe(1);
    expect(currentGroup([0, 0, 0, 0, 1, 0, 1], allocation)).toBe(2);
    expect(currentGroup([0, 0, 0, 0, 0, 0, 1], allocation)).toBe(-1);
  });

  it('puts characters first for Precision', () => {
    expect(currentGroup([5, 0, 1, 0, 1, 0, 1], { ...allocation, precision: true })).toBe(2);
  });
});

describe('losses', () => {
  it('rolls Feel No Pain for each wound of the damage', () => {
    const d3: DamageModel = { ...one, raw: parseDice('D3') ?? [] };
    const none = losses(d3, 5, true).find((l) => l.lost === 0)?.p ?? 0;
    expect(none).toBeCloseTo(1 / 9 + 1 / 27 + 1 / 81);
  });

  it('re-rolls damage below the average', () => {
    const d6: DamageModel = { ...one, raw: parseDice('D6') ?? [], reroll: true };
    const mean = losses(d6, null, true).reduce((s, l) => s + l.p * l.lost, 0);
    expect(mean).toBeCloseTo((3 / 6) * 3.5 + (1 / 6) * (4 + 5 + 6));
  });
});

describe('faceClasses', () => {
  it('groups save faces by which groups fail them, lowest first', () => {
    const boyz = group({ save: 5 });
    const boss = group({ save: 4, invuln: 5, character: true });
    const profile: SaveProfile = { ap: -1, saveModifier: 0, damage: one };
    expect(faceClasses([boyz, boss], profile)).toEqual([
      { chance: 4 / 6, hurts: new Set([0, 1]) },
      { chance: 1 / 6, hurts: new Set([0]) },
    ]);
  });
});

describe('sorted saves', () => {
  it('the leader faces the higher rolls', () => {
    // Bodyguard: one W1 model failing on 1-5. Leader: W1, fails only on a 1. Two wounds: the
    // lowest roll goes to the bodyguard, so the leader dies only if both rolls are 1s.
    const groups = [group({ models: 1, save: 6 }), group({ models: 1, save: 2, character: true })];
    const space = createSpace(groups);
    const start = new Map([[space.id(startState(groups)), 1]]);
    const profile: SaveProfile = { ap: 0, saveModifier: 0, damage: one };
    const allocation = { groups, priority: [0, 1], precision: false };
    let tagged: Tagged | null = null;
    let used = 0;
    for (const c of faceClasses(groups, profile)) {
      const step = hitStep(space, allocation, one, c.hurts);
      const share = c.chance / (1 - used);
      tagged =
        tagged === null
          ? startPass(start, [{ rolls: 2, later: 0, q: 1 }], step, share).tagged
          : classPass(tagged, step, share).tagged;
      used += c.chance;
    }
    let leaderDead = 0;
    let guardDead = 0;
    for (const tag of (tagged ?? new Map<number, Tag>()).values()) {
      for (const [id, p] of tag.vector) {
        const state = space.state(id);
        if (state[0] === 0) guardDead += p;
        if (state[2] === 0) leaderDead += p;
      }
    }
    expect(guardDead).toBeCloseTo(35 / 36);
    expect(leaderDead).toBeCloseTo(1 / 36);
  });
});
