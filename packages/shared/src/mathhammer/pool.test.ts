import { describe, expect, it } from 'vitest';
import { parseDice, point } from './dice';
import { weaponPool, type Joint, type PoolRules } from './pool';
import { rollOdds, type RollOdds } from './rolls';

const sure: RollOdds = { fail: 0, freeFail: 0, success: 1, crit: 0 };
const half: RollOdds = rollOdds((f) => (f === 1 ? 0 : f === 6 ? 2 : f >= 4 ? 1 : 0), 'none');

const rules = (r: Partial<PoolRules>): PoolRules => ({
  attacks: point(1),
  hit: half,
  hitOneDie: null,
  sustained: null,
  lethal: false,
  wound: sure,
  woundOneDie: null,
  critSpecial: false,
  ...r,
});

/** Distribution of the first count (normal wounds). */
const normals = (joint: Joint) => joint.map((row) => row.reduce((s, p) => s + p, 0));
const meanNormal = (joint: Joint) => normals(joint).reduce((s, p, n) => s + p * n, 0);
const meanSpecial = (joint: Joint) =>
  joint.reduce((s, row) => s + row.reduce((t, p, b) => t + p * b, 0), 0);

describe('weaponPool', () => {
  it('hits then wounds', () => {
    const bs3 = rollOdds((f) => (f === 1 ? 0 : f === 6 ? 2 : f >= 3 ? 1 : 0), 'none');
    const wound4 = rollOdds((f) => (f === 1 ? 0 : f === 6 ? 2 : f >= 4 ? 1 : 0), 'none');
    expect(
      meanNormal(weaponPool(rules({ attacks: point(6), hit: bs3, wound: wound4 }))),
    ).toBeCloseTo(2);
  });

  it('Torrent hits automatically, with dice attacks', () => {
    const wound4 = rollOdds((f) => (f === 1 ? 0 : f >= 4 ? 1 : 0), 'none');
    expect(
      meanNormal(weaponPool(rules({ attacks: parseDice('D6') ?? [], hit: null, wound: wound4 }))),
    ).toBeCloseTo(1.75);
  });

  it('Sustained Hits adds hits on criticals; Lethal Hits wounds automatically', () => {
    // BS4+: 2/6 ordinary hits, 1/6 criticals worth two hits.
    expect(meanNormal(weaponPool(rules({ sustained: point(1) })))).toBeCloseTo(2 / 6 + 2 / 6);
    const wound4 = rollOdds((f) => (f === 1 ? 0 : f >= 4 ? 1 : 0), 'none');
    // BS4+: 2/6 hits roll to wound (1/2), 1/6 criticals wound automatically.
    expect(meanNormal(weaponPool(rules({ lethal: true, wound: wound4 })))).toBeCloseTo(
      2 / 6 / 2 + 1 / 6,
    );
  });

  it('counts critical wounds apart when they are special', () => {
    const wound4 = rollOdds((f) => (f === 1 ? 0 : f === 6 ? 2 : f >= 4 ? 1 : 0), 'none');
    const joint = weaponPool(
      rules({ hit: null, attacks: point(6), wound: wound4, critSpecial: true }),
    );
    expect(meanSpecial(joint)).toBeCloseTo(1);
    expect(meanNormal(joint)).toBeCloseTo(2);
  });

  it('re-rolls one failed hit die for the whole pool', () => {
    // Two attacks hitting on 4+: P(0) = 1/4 × 1/2, P(2) = 1/4 + 1/2 × 1/2.
    const joint = weaponPool(rules({ attacks: point(2), hitOneDie: half }));
    const dist = normals(joint);
    expect(dist[0]).toBeCloseTo(1 / 8);
    expect(dist[1]).toBeCloseTo(3 / 8);
    expect(dist[2]).toBeCloseTo(1 / 2);
  });
});
