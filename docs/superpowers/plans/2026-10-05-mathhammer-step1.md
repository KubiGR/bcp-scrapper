# Mathhammer, Step 1 (Exact Dice Engine and Hand-Typed Page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Mathhammer page where the owner types an attacking unit's weapons and a target's models, sets the 11th-edition situation and switches, and sees exact chances: models slain (at least N), wounds dealt, wasted damage, wipe and leader slain.

**Architecture:** A pure engine in `packages/shared/src/mathhammer` turns one unit's attacks into an exact distribution: each weapon's attack pool becomes a joint count of normal and special wounds (`pool.ts`); saves are resolved class by class of save faces from the lowest roll up, against numbered target states, with the defender's best allocation order (`allocate.ts`, `resolve.ts`, `engine.ts`). A seeded dice simulator (`simulate.ts`, tests only) checks it. The web page (`apps/web/src/features/mathhammer`) is a form converted to an engine calculation and recomputed on every change.

**Tech Stack:** TypeScript (strict), Vitest, React 19, Mantine 9, TanStack Router.

**Spec:** `docs/superpowers/specs/2026-10-05-mathhammer-design.md` (step 1 of §6: the engine and a page with hand-typed profiles; 39k.pro data, pickers, keyword reading, per-weapon overrides, Best profile, ability highlighting and pinning are steps 2–3).

## Global Constraints

- Rules are 11th edition as in spec §2 (checked against 39k.pro's core rules on 2026-10-05).
- The engine is exact (no simulation in the app); the simulator lives in tests only and must agree within 0.5 percentage points on every "at least N" chance over 200,000 rolls.
- Speed: three 2D6 Blast weapons into 21 models with a leader in under 300 ms (spec §4.7).
- No network, no API, no storage in this step; the page is behind login like every page.
- Before `pnpm` or `git commit`: `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`.
- Copy uses curly apostrophes (’) and quotes (“ ”) like the rest of the app.
- Prototype note: every file in this plan was written and run before the plan (tests green, `tsc` and `eslint` clean); prettier may reflow lines, which is fine.

## Decisions in this plan (rulings against the spec's detail)

- **Step 1 scope:** per-weapon overrides of unit switches, the **Best** profile choice, keyword reading from datasheets, leader pickers, ability highlighting and pinning move to steps 2–3, where datasheets give weapons several profiles and keywords. Here every weapon row has its own keyword ticks and the unit switches apply to all weapons.
- **Weapon order:** ↑/↓ buttons instead of dragging.
- **"Re-roll one die"** for hits or wounds is used by the first weapon (in order) that has it; the one damage re-roll is the unit's, used on the first damage roll below average.
- **Re-roll damage** re-rolls results below the dice's average.
- **Devastating Wounds** mortal wounds ignore the defender's damage reduction and halving (they are mortal wounds, not an attack's Damage); critical wound bonus damage adds to them.
- **Better-AP critical wounds** (critical AP/damage switches) are saved before normal wounds.
- **Torrent** still auto-hits when snap shooting.
- **Melta X** is a number; Rapid Fire and Sustained Hits take dice.
- **Defender Feel No Pain and invulnerable save** are typed per kind of model, so no separate override switches.
- **Save penalties ignored** cancels the attacker's "worsen saves by" switch, not AP (spec §8, confirmed by the owner).

## Review Focus

1. **Half-typed values** (an empty Attacks field, "D", "2Q"): the page shows “Can’t calculate” with the field named, never a blank page. Pinned in Task 8 (page test with "D7").
2. **Weapons nobody fires (0 models) and a target that is only a leader:** no crash, sensible numbers. Pinned in Task 4.
3. **Big setups while typing:** the result lags behind (deferred) but typing stays responsive; the engine stays under 300 ms. Pinned in Task 5 (speed test); the page uses `useDeferredValue`.
4. **Cleared number fields:** treated as the field's minimum (or "none" for InSv, FNP, BS, Blast, Cleave, Melta). Covered by the `Num` input; checked in the Task 9 run.
5. **Attached units with a better leader save:** the leader faces the higher save rolls. Pinned in Task 3 (sorted saves test) and Task 5 (simulator).

---

### Task 1: Engine types, dice and roll odds

**Files:**

- Create: `packages/shared/src/mathhammer/types.ts`
- Create: `packages/shared/src/mathhammer/dice.ts`
- Create: `packages/shared/src/mathhammer/rolls.ts`
- Test: `packages/shared/src/mathhammer/dice.test.ts`
- Test: `packages/shared/src/mathhammer/rolls.test.ts`

**Interfaces:**

- Produces: `types.ts`: `DefenderGroup`, `Defender`, `WeaponMods`, `Weapon`, `Situation`, `Calculation`, `CalculationResult`, `DEFAULT_MODS`. `dice.ts`: `type Dist = number[]`, `point(v)`, `convolve(a, b)`, `mapDist(d, fn)`, `mean(d)`, `atLeast(d)`, `sumOf(count, each)`, `parseDice(text): Dist | null`. `rolls.ts`: `type Reroll = 'none' | 'ones' | 'failures' | 'fish'`, `type Classify`, `interface RollOdds { fail; freeFail; success; crit }`, `rollOdds(classify, reroll)`, `woundNeeded(S, T)`, `capModifier(total, ignorePenalties)`.

- [ ] **Step 1: Write the failing test `packages/shared/src/mathhammer/dice.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { atLeast, convolve, mean, parseDice, point, sumOf } from './dice';

describe('dice', () => {
  it('reads fixed numbers and dice', () => {
    expect(parseDice('3')).toEqual(point(3));
    const d3 = parseDice('D3') ?? [];
    expect(d3.map((p) => p.toFixed(4))).toEqual(['0.0000', '0.3333', '0.3333', '0.3333']);
    expect(mean(parseDice('2D6') ?? [])).toBeCloseTo(7);
    expect(mean(parseDice('d6 + 3') ?? [])).toBeCloseTo(6.5);
    expect(parseDice('D6+3')?.[3]).toBe(0);
    expect(parseDice('D3-1')?.[0]).toBeCloseTo(1 / 3);
  });

  it('says when it isn’t dice', () => {
    expect(parseDice('2Q')).toBeNull();
    expect(parseDice('D8')).toBeNull();
    expect(parseDice('')).toBeNull();
  });

  it('adds independent values and random counts of them', () => {
    expect(mean(convolve(point(2), parseDice('D6') ?? []))).toBeCloseTo(5.5);
    expect(mean(sumOf(point(2), parseDice('D3') ?? []))).toBeCloseTo(4);
    expect(mean(sumOf(parseDice('D3') ?? [], parseDice('D6') ?? []))).toBeCloseTo(7);
  });

  it('gives the chance of each value or more', () => {
    expect(atLeast([0.25, 0.25, 0.5])).toEqual([1, 0.75, 0.5]);
  });
});
```

- [ ] **Step 2: Write the failing test `packages/shared/src/mathhammer/rolls.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { capModifier, rollOdds, woundNeeded, type Classify } from './rolls';

/** 3+ to hit, 6s critical. */
const bs3: Classify = (face) => (face === 1 ? 0 : face === 6 ? 2 : face >= 3 ? 1 : 0);

describe('rollOdds', () => {
  it('without re-rolls', () => {
    const odds = rollOdds(bs3, 'none');
    expect(odds.success + odds.crit).toBeCloseTo(4 / 6);
    expect(odds.crit).toBeCloseTo(1 / 6);
    expect(odds.freeFail).toBeCloseTo(2 / 6);
  });

  it('re-rolling ones leaves other fails free for a later one-die re-roll', () => {
    const odds = rollOdds(bs3, 'ones');
    expect(odds.success + odds.crit).toBeCloseTo(4 / 6 + (1 / 6) * (4 / 6));
    expect(odds.freeFail).toBeCloseTo(1 / 6);
  });

  it('re-rolling failures, and fishing for criticals', () => {
    expect(rollOdds(bs3, 'failures').fail).toBeCloseTo((2 / 6) * (2 / 6));
    expect(rollOdds(bs3, 'fish').crit).toBeCloseTo(1 / 6 + (5 / 6) * (1 / 6));
  });
});

describe('woundNeeded', () => {
  it('compares Strength with Toughness', () => {
    expect(woundNeeded(8, 4)).toBe(2);
    expect(woundNeeded(5, 4)).toBe(3);
    expect(woundNeeded(4, 4)).toBe(4);
    expect(woundNeeded(4, 7)).toBe(5);
    expect(woundNeeded(4, 8)).toBe(6);
    expect(woundNeeded(3, 7)).toBe(6);
  });
});

describe('capModifier', () => {
  it('keeps hit and wound modifiers within ±1, or above 0 when penalties are ignored', () => {
    expect(capModifier(2, false)).toBe(1);
    expect(capModifier(-3, false)).toBe(-1);
    expect(capModifier(-1, true)).toBe(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/dice.test.ts packages/shared/src/mathhammer/rolls.test.ts`
Expected: FAIL, the module(s) under test don’t exist yet.

- [ ] **Step 4: Write `packages/shared/src/mathhammer/types.ts`**

```ts
import type { Reroll } from './rolls';

/** One kind of model in the target: a CHARACTER is always its own group of one. */
export interface DefenderGroup {
  name: string;
  models: number;
  toughness: number;
  /** 3 for 3+. */
  save: number;
  invuln: number | null;
  wounds: number;
  fnp: number | null;
  character: boolean;
}

export interface Defender {
  groups: DefenderGroup[];
  /** Upper-case keywords of the unit, for Anti-X. */
  keywords: string[];
  /** An attached unit: Toughness is the bodyguard's (non-CHARACTER groups'). */
  attached: boolean;
  /** Stealth: benefit of cover against ranged attacks. */
  stealth: boolean;
  hitModifier: number;
  woundModifier: number;
  /** Subtract this from each attack's Damage (min 1). */
  damageReduction: number;
  halveDamage: boolean;
  /** The save roll ignores modifiers that worsen it (other than AP). */
  savePenaltiesIgnored: boolean;
}

/** A weapon's switches after the unit's, the keywords' and the weapon's own are combined. */
export interface WeaponMods {
  hitReroll: Reroll;
  hitRerollOneDie: boolean;
  hitModifier: number;
  hitIgnorePenalties: boolean;
  /** Unmodified hit rolls of this or more are critical (6 normally). */
  critHitOn: number;
  sustainedHits: string | null;
  lethalHits: boolean;
  torrent: boolean;
  ignoresCover: boolean;
  woundReroll: Reroll;
  woundRerollOneDie: boolean;
  woundModifier: number;
  woundIgnorePenalties: boolean;
  critWoundOn: number;
  /** A critical wound improves AP by this. */
  critAp: number;
  /** A critical wound adds this to Damage. */
  critDamage: number;
  devastatingWounds: boolean;
  /** Improve AP by this (e.g. 1: AP -1 becomes -2). */
  apImprove: number;
  /** Worsen the target's save rolls by this. */
  saveModifier: number;
  /** Re-roll damage rolls below the dice's average. */
  damageReroll: boolean;
  damageRerollOneDie: boolean;
  damageModifier: number;
  ignoreDamageReduction: boolean;
}

export interface Weapon {
  name: string;
  /** Models making attacks with it; each rolls its own A. */
  models: number;
  melee: boolean;
  attacks: string;
  /** BS/WS (3 for 3+); null when it has none (Torrent). */
  skill: number | null;
  strength: number;
  /** As written: 0, -1, -2… */
  ap: number;
  damage: string;
  heavy: boolean;
  lance: boolean;
  precision: boolean;
  indirectFire: boolean;
  anti: { keyword: string; value: number }[];
  rapidFire: string | null;
  blast: number | null;
  cleave: number | null;
  melta: number | null;
  mods: WeaponMods;
}

export interface Situation {
  movedOver3: boolean;
  halfRange: boolean;
  charged: boolean;
  plungingFire: boolean;
  snapShooting: boolean;
  indirectShooting: boolean;
  /** Indirect: the unit stayed still and a friendly unit sees the target (fails on 1-3, not 1-5). */
  indirectStationaryVisible: boolean;
  attackerDamaged: boolean;
  cover: boolean;
  armourOfContempt: boolean;
}

export interface Calculation {
  weapons: Weapon[];
  defender: Defender;
  situation: Situation;
  /** Mortal wounds after all weapons (e.g. "D3"); null for none. */
  flatMortals: string | null;
}

export interface CalculationResult {
  /** P(models slain = n). */
  modelsSlain: number[];
  /** P(wounds lost = n). */
  woundsDealt: number[];
  wipe: number;
  /** Chance at least one CHARACTER dies; null when the target has none. */
  leaderSlain: number | null;
  averages: { modelsSlain: number; woundsDealt: number; wasted: number };
  /** For each weapon, the defender's group order used (group indices, first allocated first). */
  orders: number[][];
}

export const DEFAULT_MODS: WeaponMods = {
  hitReroll: 'none',
  hitRerollOneDie: false,
  hitModifier: 0,
  hitIgnorePenalties: false,
  critHitOn: 6,
  sustainedHits: null,
  lethalHits: false,
  torrent: false,
  ignoresCover: false,
  woundReroll: 'none',
  woundRerollOneDie: false,
  woundModifier: 0,
  woundIgnorePenalties: false,
  critWoundOn: 6,
  critAp: 0,
  critDamage: 0,
  devastatingWounds: false,
  apImprove: 0,
  saveModifier: 0,
  damageReroll: false,
  damageRerollOneDie: false,
  damageModifier: 0,
  ignoreDamageReduction: false,
};
```

- [ ] **Step 5: Write `packages/shared/src/mathhammer/dice.ts`**

```ts
/** A probability distribution over whole numbers 0…n: `dist[v]` is the chance of value v. */
export type Dist = number[];

/** A value that is certain. */
export function point(value: number): Dist {
  const dist: Dist = new Array<number>(value + 1).fill(0);
  dist[value] = 1;
  return dist;
}

/** The distribution of a + b for independent a and b. */
export function convolve(a: Dist, b: Dist): Dist {
  const out: Dist = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    const pa = a[i] ?? 0;
    if (pa === 0) continue;
    for (let j = 0; j < b.length; j += 1) out[i + j] = (out[i + j] ?? 0) + pa * (b[j] ?? 0);
  }
  return out;
}

/** Each value changed by `fn` (results that collide add up). */
export function mapDist(dist: Dist, fn: (value: number) => number): Dist {
  const out: Dist = [];
  dist.forEach((p, value) => {
    if (p === 0) return;
    const to = Math.max(0, fn(value));
    while (out.length <= to) out.push(0);
    out[to] = (out[to] ?? 0) + p;
  });
  return out;
}

export function mean(dist: Dist): number {
  return dist.reduce((sum, p, value) => sum + p * value, 0);
}

/** The chance of each value or more: `atLeast[v]` = P(value ≥ v). */
export function atLeast(dist: Dist): number[] {
  const out = new Array<number>(dist.length).fill(0);
  let tail = 0;
  for (let v = dist.length - 1; v >= 0; v -= 1) {
    tail += dist[v] ?? 0;
    out[v] = tail;
  }
  return out;
}

/** The total of `count` independent draws of `each` (count itself random). */
export function sumOf(count: Dist, each: Dist): Dist {
  const total: Dist = [0];
  let power: Dist = [1];
  count.forEach((p, n) => {
    if (n > 0) power = convolve(power, each);
    if (p === 0) return;
    while (total.length < power.length) total.push(0);
    power.forEach((q, v) => {
      total[v] = (total[v] ?? 0) + p * q;
    });
  });
  return total;
}

const DICE = /^(\d*)D([36])([+-]\d+)?$/;
const FIXED = /^\d+$/;

/** `3`, `D6`, `2D6`, `D6+3`, `D3-1` (min 0) → its distribution; null when it isn't one. */
export function parseDice(expression: string): Dist | null {
  const text = expression.replace(/\s+/g, '').toUpperCase();
  if (FIXED.test(text)) return point(Number(text));
  const match = DICE.exec(text);
  if (match === null) return null;
  const count = match[1] === '' || match[1] === undefined ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  const add = Number(match[3] ?? 0);
  const die: Dist = [0, ...new Array<number>(sides).fill(1 / sides)];
  let dist: Dist = [1];
  for (let i = 0; i < count; i += 1) dist = convolve(dist, die);
  return mapDist(dist, (value) => value + add);
}
```

- [ ] **Step 6: Write `packages/shared/src/mathhammer/rolls.ts`**

```ts
export type Reroll = 'none' | 'ones' | 'failures' | 'fish';

/** What a D6 roll becomes: 0 fail, 1 success, 2 critical. */
export type Classify = (face: number) => 0 | 1 | 2;

/** One roll's chances after its re-roll; `freeFail` = fails never re-rolled (a later
 * "re-roll one die" can still re-roll them). */
export interface RollOdds {
  fail: number;
  freeFail: number;
  success: number;
  crit: number;
}

export function rollOdds(classify: Classify, reroll: Reroll): RollOdds {
  const odds: RollOdds = { fail: 0, freeFail: 0, success: 0, crit: 0 };
  const fresh: [number, number, number] = [0, 0, 0];
  for (let face = 1; face <= 6; face += 1) fresh[classify(face)] += 1 / 6;
  for (let face = 1; face <= 6; face += 1) {
    const result = classify(face);
    const again =
      reroll === 'ones'
        ? face === 1
        : reroll === 'failures'
          ? result === 0
          : reroll === 'fish'
            ? result !== 2
            : false;
    if (again) {
      odds.fail += fresh[0] / 6;
      odds.success += fresh[1] / 6;
      odds.crit += fresh[2] / 6;
    } else if (result === 0) {
      odds.fail += 1 / 6;
      odds.freeFail += 1 / 6;
    } else if (result === 1) odds.success += 1 / 6;
    else odds.crit += 1 / 6;
  }
  return odds;
}

/** The roll needed to wound: S vs T. */
export function woundNeeded(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 <= toughness) return 6;
  return 5;
}

export const capModifier = (total: number, ignorePenalties: boolean) =>
  Math.max(ignorePenalties ? 0 : -1, Math.min(1, total));
```

- [ ] **Step 7: Run the tests and checks**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/dice.test.ts packages/shared/src/mathhammer/rolls.test.ts`
Expected: PASS (9 tests).
Then: `pnpm exec tsc -p packages/shared/tsconfig.json --noEmit && pnpm exec eslint packages/shared/src/mathhammer` → no output.

- [ ] **Step 8: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add packages/shared/src/mathhammer/types.ts packages/shared/src/mathhammer/dice.ts packages/shared/src/mathhammer/rolls.ts packages/shared/src/mathhammer/dice.test.ts packages/shared/src/mathhammer/rolls.test.ts
git commit -m "feat: mathhammer dice and roll odds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: A weapon’s attack pool

**Files:**

- Create: `packages/shared/src/mathhammer/pool.ts`
- Test: `packages/shared/src/mathhammer/pool.test.ts`

**Interfaces:**

- Consumes: `Dist`, `RollOdds` (Task 1).
- Produces: `type Joint = number[][]` (`joint[normal][special]`), `interface PoolRules { attacks; hit: RollOdds | null; hitOneDie; sustained; lethal; wound; woundOneDie; critSpecial }`, `weaponPool(rules): Joint`.

- [ ] **Step 1: Write the failing test `packages/shared/src/mathhammer/pool.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/pool.test.ts`
Expected: FAIL, the module(s) under test don’t exist yet.

- [ ] **Step 3: Write `packages/shared/src/mathhammer/pool.ts`**

```ts
import type { Dist } from './dice';
import type { RollOdds } from './rolls';

/** A joint distribution of two counts: `joint[a][b]` = P(first = a, second = b). */
export type Joint = number[][];

function addAt(joint: Joint, a: number, b: number, p: number): void {
  while (joint.length <= a) joint.push([]);
  const row = joint[a] ?? [];
  while (row.length <= b) row.push(0);
  row[b] = (row[b] ?? 0) + p;
}

function each(joint: Joint, fn: (a: number, b: number, p: number) => void): void {
  joint.forEach((row, a) => {
    row.forEach((p, b) => {
      if (p !== 0) fn(a, b, p);
    });
  });
}

export function convolveJoint(x: Joint, y: Joint): Joint {
  const out: Joint = [];
  each(x, (a, b, p) => {
    each(y, (c, d, q) => {
      addAt(out, a + c, b + d, p * q);
    });
  });
  return out;
}

/** x + weight·y, in place on x. */
function addInto(x: Joint, y: Joint, weight: number, shiftA = 0): void {
  each(y, (a, b, p) => {
    addAt(x, a + shiftA, b, weight * p);
  });
}

/** One outcome kernel for a single die, and what "re-roll one die" needs to know about it. */
export interface Kernel {
  joint: Joint;
  /** Chance the die failed without having been re-rolled (outcome 0,0). */
  freeFail: number;
}

/**
 * The outcome of exactly n dice, for n = 0, 1, 2, … asked in order. With "re-roll one die": if
 * any die failed without being re-rolled, one such die (a 0,0 outcome) is rolled again with
 * `fresh`.
 */
function powers(kernel: Kernel, fresh: Joint | null): (n: number) => Joint {
  let power: Joint = [[1]];
  let clean: Joint = [[1]];
  let done = 0;
  const noFail: Joint = kernel.joint.map((row) => [...row]);
  const origin = noFail[0] ?? [];
  origin[0] = (origin[0] ?? 0) - kernel.freeFail;
  return (n) => {
    while (done < n) {
      power = convolveJoint(power, kernel.joint);
      if (fresh !== null) clean = convolveJoint(clean, noFail);
      done += 1;
    }
    if (fresh === null || n === 0) return power;
    const someFail: Joint = power.map((row) => [...row]);
    addInto(someFail, clean, -1);
    const out: Joint = clean.map((row) => [...row]);
    addInto(out, convolveJoint(someFail, fresh), 1);
    return out;
  };
}

export interface PoolRules {
  /** Attack dice for the whole weapon (all its models). */
  attacks: Dist;
  /** Hit roll odds; null = auto-hit (Torrent). */
  hit: RollOdds | null;
  /** Odds without any re-roll, for "re-roll one die"; null when not used. */
  hitOneDie: RollOdds | null;
  /** Extra hits per critical hit (Sustained Hits). */
  sustained: Dist | null;
  lethal: boolean;
  wound: RollOdds;
  woundOneDie: RollOdds | null;
  /** Critical wounds are a separate kind (Devastating Wounds, or a better AP/D). */
  critSpecial: boolean;
}

/** The weapon's exact joint count of (normal wounds, special wounds). */
export function weaponPool(rules: PoolRules): Joint {
  // Stage 1: one attack die → (hits that roll to wound, automatic wounds).
  const hitKernel = (odds: RollOdds | null): Kernel => {
    const joint: Joint = [];
    if (odds === null) {
      addAt(joint, 1, 0, 1);
      return { joint, freeFail: 0 };
    }
    addAt(joint, 0, 0, odds.fail);
    addAt(joint, 1, 0, odds.success);
    const extra = rules.sustained ?? [1];
    extra.forEach((p, e) => {
      if (p === 0) return;
      if (rules.lethal) addAt(joint, e, 1, odds.crit * p);
      else addAt(joint, 1 + e, 0, odds.crit * p);
    });
    return { joint, freeFail: odds.freeFail };
  };
  const hits = powers(
    hitKernel(rules.hit),
    rules.hitOneDie === null || rules.hit === null ? null : hitKernel(rules.hitOneDie).joint,
  );
  const afterHits: Joint = [];
  rules.attacks.forEach((p, n) => {
    if (p === 0) {
      hits(n);
      return;
    }
    addInto(afterHits, hits(n), p);
  });

  // Stage 2: each hit rolls to wound → (normal wounds, special wounds).
  const woundKernel = (odds: RollOdds): Kernel => {
    const joint: Joint = [];
    addAt(joint, 0, 0, odds.fail);
    addAt(joint, 1, 0, odds.success);
    if (rules.critSpecial) addAt(joint, 0, 1, odds.crit);
    else addAt(joint, 1, 0, odds.crit);
    return { joint, freeFail: odds.freeFail };
  };
  const wounds = powers(
    woundKernel(rules.wound),
    rules.woundOneDie === null ? null : woundKernel(rules.woundOneDie).joint,
  );
  const result: Joint = [];
  afterHits.forEach((row, rolls) => {
    const outcome = wounds(rolls);
    row.forEach((p, autos) => {
      if (p !== 0) addInto(result, outcome, p, autos);
    });
  });
  return result;
}

export { each as eachJoint };
```

- [ ] **Step 4: Run the tests and checks**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/pool.test.ts`
Expected: PASS (5 tests).
Then: `pnpm exec tsc -p packages/shared/tsconfig.json --noEmit && pnpm exec eslint packages/shared/src/mathhammer` → no output.

- [ ] **Step 5: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add packages/shared/src/mathhammer/pool.ts packages/shared/src/mathhammer/pool.test.ts
git commit -m "feat: mathhammer attack pool with exact wound counts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Allocation and save passes

**Files:**

- Create: `packages/shared/src/mathhammer/allocate.ts`
- Create: `packages/shared/src/mathhammer/resolve.ts`
- Create: `packages/shared/src/mathhammer/test-helpers.ts`
- Test: `packages/shared/src/mathhammer/resolve.test.ts`

**Interfaces:**

- Consumes: `Dist`, `DefenderGroup`, `Defender`, `Weapon`, `Situation`, `Calculation`, `DEFAULT_MODS` (Task 1).
- Produces: `allocate.ts`: `type State = number[]` (per group: alive, wounds lost on the wounded model; last: damage re-roll left), `Allocation`, `currentGroup(state, allocation)`, `DamageModel`, `losses(model, fnp, rerollLeft)`, `lose(state, groups, g, lost)`, `SaveProfile`, `saved(face, group, profile)`, `faceClasses(groups, profile)`. `resolve.ts`: `Space`, `createSpace(groups)`, `startState(groups)`, `Vector`, `addTo`, `Step`, `hitStep(space, allocation, damage, hurts | null)`, `apply(vector, step)`, `Tag`, `Tagged`, `addTagged`, `classPass(tagged, step, share)`, `startPass(start, entries, step, share)`, `repeat(vector, step, counts)`. `test-helpers.ts`: `SITUATION`, `weapon()`, `group()`, `defender()`, `calc()`, `crowd`.

- [ ] **Step 1: Write `packages/shared/src/mathhammer/test-helpers.ts`** (shared test builders)

```ts
import {
  DEFAULT_MODS,
  type Calculation,
  type Defender,
  type DefenderGroup,
  type Situation,
  type Weapon,
  type WeaponMods,
} from './types';

/** Test builders: plain values with only what a test changes written out. */
export const SITUATION: Situation = {
  movedOver3: false,
  halfRange: false,
  charged: false,
  plungingFire: false,
  snapShooting: false,
  indirectShooting: false,
  indirectStationaryVisible: false,
  attackerDamaged: false,
  cover: false,
  armourOfContempt: false,
};

export const weapon = (
  w: Partial<Omit<Weapon, 'mods'>> & { mods?: Partial<WeaponMods> } = {},
): Weapon => ({
  name: 'Gun',
  models: 1,
  melee: false,
  attacks: '1',
  skill: 3,
  strength: 4,
  ap: 0,
  damage: '1',
  heavy: false,
  lance: false,
  precision: false,
  indirectFire: false,
  anti: [],
  rapidFire: null,
  blast: null,
  cleave: null,
  melta: null,
  ...w,
  mods: { ...DEFAULT_MODS, ...(w.mods ?? {}) },
});

export const group = (g: Partial<DefenderGroup> = {}): DefenderGroup => ({
  name: 'Troops',
  models: 10,
  toughness: 4,
  save: 3,
  invuln: null,
  wounds: 1,
  fnp: null,
  character: false,
  ...g,
});

export const defender = (d: Partial<Defender> = {}): Defender => ({
  groups: [group()],
  keywords: [],
  attached: false,
  stealth: false,
  hitModifier: 0,
  woundModifier: 0,
  damageReduction: 0,
  halveDamage: false,
  savePenaltiesIgnored: false,
  ...d,
});

export const calc = (c: Partial<Calculation> = {}): Calculation => ({
  weapons: [weapon()],
  defender: defender(),
  situation: SITUATION,
  flatMortals: null,
  ...c,
});

/** 100 one-wound models with no save (Sv 7+): wounds dealt then measure hits × wounds alone. */
export const crowd = defender({ groups: [group({ models: 100, save: 7 })] });
```

- [ ] **Step 2: Write the failing test `packages/shared/src/mathhammer/resolve.test.ts`**

```ts
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/resolve.test.ts`
Expected: FAIL, the module(s) under test don’t exist yet.

- [ ] **Step 4: Write `packages/shared/src/mathhammer/allocate.ts`**

```ts
import type { Dist } from './dice';
import type { DefenderGroup } from './types';

/**
 * The target during an activation: per group, models alive and wounds lost by its wounded model
 * (11e: a wounded model is always picked first, so a group has at most one); last entry 1 while
 * the unit's one damage re-roll is unused.
 */
export type State = number[];
/** Where damage goes next. */
export interface Allocation {
  groups: DefenderGroup[];
  /** Group indices in the order the defender declared (first allocated first). */
  priority: number[];
  /** Precision: CHARACTER groups take the attacks first. */
  precision: boolean;
}

/**
 * The group of the model that takes the next attack (11e 05.03): a wounded non-CHARACTER group
 * first, then non-CHARACTER groups in the declared order, then CHARACTER groups (wounded first);
 * with Precision, CHARACTER groups first. Also the order for mortal wounds (no Precision). -1: all
 * destroyed.
 */
export function currentGroup(state: State, allocation: Allocation): number {
  const alive = (g: number) => (state[g * 2] ?? 0) > 0;
  const wounded = (g: number) => (state[g * 2 + 1] ?? 0) > 0;
  const live = allocation.priority.filter(alive);
  const others = live.filter((g) => allocation.groups[g]?.character !== true);
  const characters = live.filter((g) => allocation.groups[g]?.character === true);
  const pick = (list: number[]) => list.find(wounded) ?? list[0];
  if (allocation.precision && characters.length > 0) return pick(characters) ?? -1;
  if (others.length > 0) return pick(others) ?? -1;
  return pick(characters) ?? -1;
}

/** How an attack that gets through becomes wounds lost (before overkill). */
export interface DamageModel {
  /** Damage dice as rolled. */
  raw: Dist;
  /** Re-roll results below the dice's average. */
  reroll: boolean;
  /** May use the unit's one damage re-roll on a result below average. */
  oneDie: boolean;
  /** Raw result → damage after modifiers (at least 1). */
  final: (raw: number) => number;
}

interface Loss {
  lost: number;
  usedReroll: boolean;
  p: number;
}

function binomialRow(n: number, p: number): number[] {
  const row = new Array<number>(n + 1).fill(0);
  if (p >= 1) {
    row[n] = 1;
    return row;
  }
  if (p <= 0) {
    row[0] = 1;
    return row;
  }
  row[0] = (1 - p) ** n;
  for (let j = 0; j < n; j += 1) row[j + 1] = ((row[j] ?? 0) * (n - j) * p) / ((j + 1) * (1 - p));
  return row;
}

const lossCache = new WeakMap<DamageModel, Map<string, Loss[]>>();

/** The chances of each number of wounds lost: damage rolled (and re-rolled), then Feel No Pain. */
export function losses(model: DamageModel, fnp: number | null, rerollLeft: boolean): Loss[] {
  const key = `${String(fnp)}:${String(rerollLeft)}`;
  const cache = lossCache.get(model) ?? new Map<string, Loss[]>();
  lossCache.set(model, cache);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const average = model.raw.reduce((sum, p, v) => sum + p * v, 0);
  const damage = new Map<string, Loss>();
  const add = (d: number, usedReroll: boolean, p: number) => {
    const k = `${String(d)}:${String(usedReroll)}`;
    const found = damage.get(k);
    if (found === undefined) damage.set(k, { lost: d, usedReroll, p });
    else found.p += p;
  };
  model.raw.forEach((p, v) => {
    if (p === 0) return;
    const again = v < average && (model.reroll || (model.oneDie && rerollLeft));
    if (!again) {
      add(model.final(v), false, p);
      return;
    }
    model.raw.forEach((q, w) => {
      if (q !== 0) add(model.final(w), !model.reroll, p * q);
    });
  });
  const pass = fnp === null ? 0 : (7 - fnp) / 6;
  const out = new Map<string, Loss>();
  for (const { lost: d, usedReroll, p } of damage.values()) {
    binomialRow(d, 1 - pass).forEach((q, lost) => {
      if (q === 0) return;
      const k = `${String(lost)}:${String(usedReroll)}`;
      const found = out.get(k);
      if (found === undefined) out.set(k, { lost, usedReroll, p: p * q });
      else found.p += p * q;
    });
  }
  const result = [...out.values()];
  cache.set(key, result);
  return result;
}

/** A model of group g loses `lost` wounds; excess is wasted (overkill). */
export function lose(
  state: State,
  groups: DefenderGroup[],
  g: number,
  lost: number,
): { next: State; wasted: number } {
  const next = [...state];
  const wounds = groups[g]?.wounds ?? 1;
  const taken = next[g * 2 + 1] ?? 0;
  const applied = Math.min(lost, wounds - taken);
  if (taken + applied >= wounds) {
    next[g * 2] = (next[g * 2] ?? 0) - 1;
    next[g * 2 + 1] = 0;
  } else next[g * 2 + 1] = taken + applied;
  return { next, wasted: lost - applied };
}

/** A pool of attacks to save, with what the attacks do. */
export interface SaveProfile {
  /** AP after all changes (0 or negative). */
  ap: number;
  /** Worsens save rolls by this (0 when the target ignores it). */
  saveModifier: number;
  damage: DamageModel;
}

/** Saves the group makes: unmodified 1 fails; invulnerable save; then the save after AP. */
export function saved(face: number, group: DefenderGroup, profile: SaveProfile): boolean {
  if (face === 1) return false;
  if (group.invuln !== null && face >= group.invuln) return true;
  return face + profile.ap - profile.saveModifier >= group.save;
}

/**
 * Save faces grouped by which groups they hurt, lowest first. 11e resolves save rolls from the
 * lowest result up, so only the order *between* these classes matters: within one, every roll
 * hurts the same groups. Faces that hurt no group are left out.
 */
export function faceClasses(
  groups: DefenderGroup[],
  profile: SaveProfile,
): { chance: number; hurts: Set<number> }[] {
  const classes: { chance: number; hurts: Set<number>; key: string }[] = [];
  for (let face = 1; face <= 6; face += 1) {
    const hurts = new Set(groups.flatMap((g, i) => (saved(face, g, profile) ? [] : [i])));
    const key = [...hurts].join(',');
    const last = classes.at(-1);
    if (last?.key === key) last.chance += 1 / 6;
    else classes.push({ chance: 1 / 6, hurts, key });
  }
  return classes.filter((c) => c.hurts.size > 0).map(({ chance, hurts }) => ({ chance, hurts }));
}
```

- [ ] **Step 5: Write `packages/shared/src/mathhammer/resolve.ts`**

```ts
import {
  currentGroup,
  lose,
  losses,
  type Allocation,
  type DamageModel,
  type State,
} from './allocate';
import type { DefenderGroup } from './types';

/** Target states numbered once, so what a roll does to each can be cached. */
export interface Space {
  groups: DefenderGroup[];
  id: (state: State) => number;
  state: (id: number) => State;
}

export function createSpace(groups: DefenderGroup[]): Space {
  const ids = new Map<string, number>();
  const list: State[] = [];
  return {
    groups,
    id: (state) => {
      const key = state.join(',');
      const found = ids.get(key);
      if (found !== undefined) return found;
      ids.set(key, list.length);
      list.push(state);
      return list.length - 1;
    },
    state: (id) => list[id] ?? [],
  };
}

/** The untouched target: every model alive, the damage re-roll unused. */
export const startState = (groups: DefenderGroup[]): State => [
  ...groups.flatMap((g) => [g.models, 0]),
  1,
];

/** A distribution over state ids. */
export type Vector = Map<number, number>;

export function addTo(vector: Vector, id: number, p: number): void {
  if (p !== 0) vector.set(id, (vector.get(id) ?? 0) + p);
}

interface Outcome {
  to: number;
  p: number;
  wasted: number;
}

/** One roll that may hurt (or one mortal-wound event): what it does to each state. */
export type Step = (id: number) => Outcome[];

/**
 * A step for an attack that gets through to the model taking attacks, when that model's group
 * is in `hurts` (null: any group, for mortal wounds).
 */
export function hitStep(
  space: Space,
  allocation: Allocation,
  damage: DamageModel,
  hurts: Set<number> | null,
): Step {
  const cache = new Map<number, Outcome[]>();
  const last = space.groups.length * 2;
  return (id) => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const state = space.state(id);
    const g = currentGroup(state, allocation);
    const group = space.groups[g];
    let outcomes: Outcome[];
    if (group === undefined || (hurts !== null && !hurts.has(g))) {
      outcomes = [{ to: id, p: 1, wasted: 0 }];
    } else {
      outcomes = losses(damage, group.fnp, state[last] === 1).map((loss) => {
        const { next, wasted } = lose(state, space.groups, g, loss.lost);
        if (loss.usedReroll) next[last] = 0;
        return { to: space.id(next), p: loss.p, wasted };
      });
    }
    cache.set(id, outcomes);
    return outcomes;
  };
}

/** One step applied to a distribution; also its expected wasted damage. */
export function apply(vector: Vector, step: Step): { vector: Vector; wasted: number } {
  const out: Vector = new Map();
  let wasted = 0;
  for (const [id, p] of vector) {
    for (const o of step(id)) {
      addTo(out, o.to, p * o.p);
      wasted += p * o.p * o.wasted;
    }
  }
  return { vector: out, wasted };
}

/** Target states with how many save rolls are left to resolve and a count kept for later. */
export interface Tag {
  rolls: number;
  later: number;
  /** Absolute chances (they sum to this tag's chance). */
  vector: Vector;
}
export type Tagged = Map<number, Tag>;

export function addTagged(
  tagged: Tagged,
  rolls: number,
  later: number,
  id: number,
  p: number,
): void {
  if (p === 0) return;
  const key = rolls * 1_000_000 + later;
  let tag = tagged.get(key);
  if (tag === undefined) {
    tag = { rolls, later, vector: new Map() };
    tagged.set(key, tag);
  }
  addTo(tag.vector, id, p);
}

function binomialRow(n: number, p: number): number[] {
  const row = new Array<number>(n + 1).fill(0);
  if (p >= 1) {
    row[n] = 1;
    return row;
  }
  if (p <= 0) {
    row[0] = 1;
    return row;
  }
  row[0] = (1 - p) ** n;
  for (let j = 0; j < n; j += 1) row[j + 1] = ((row[j] ?? 0) * (n - j) * p) / ((j + 1) * (1 - p));
  return row;
}

/**
 * One class of save faces: of each tag's rolls left, Binomial(rolls, share) show these faces;
 * each of those is resolved with `step` (lowest classes are passed first, as 11e resolves saves
 * from the lowest roll up). Returns the tags with those rolls used, and the expected waste.
 */
export function classPass(
  tagged: Tagged,
  step: Step,
  share: number,
): { tagged: Tagged; wasted: number } {
  const next: Tagged = new Map();
  let wasted = 0;
  for (const tag of tagged.values()) {
    const row = binomialRow(tag.rolls, share);
    let current = tag.vector;
    let tail = 1;
    for (let count = 0; count <= tag.rolls; count += 1) {
      const w = row[count] ?? 0;
      if (w > 0)
        for (const [id, p] of current) addTagged(next, tag.rolls - count, tag.later, id, p * w);
      tail -= w;
      if (count === tag.rolls || tail < 1e-15) break;
      const stepped = apply(current, step);
      wasted += tail * stepped.wasted;
      current = stepped.vector;
    }
  }
  return { tagged: next, wasted };
}

/**
 * The first class pass, when every tag starts from the same `start` vector (weights `q`): each
 * step is applied to the shared vector once, not once per tag.
 */
export function startPass(
  start: Vector,
  entries: { rolls: number; later: number; q: number }[],
  step: Step,
  share: number,
): { tagged: Tagged; wasted: number } {
  const powers: Vector[] = [start];
  const stepWaste: number[] = [];
  const next: Tagged = new Map();
  let wasted = 0;
  for (const entry of entries) {
    const row = binomialRow(entry.rolls, share);
    let tail = 1;
    for (let count = 0; count <= entry.rolls; count += 1) {
      while (powers.length <= count) {
        const stepped = apply(powers[powers.length - 1] ?? new Map<number, number>(), step);
        stepWaste.push(stepped.wasted);
        powers.push(stepped.vector);
      }
      const w = row[count] ?? 0;
      if (w > 0) {
        for (const [id, p] of powers[count] ?? new Map<number, number>()) {
          addTagged(next, entry.rolls - count, entry.later, id, p * w * entry.q);
        }
      }
      tail -= w;
      if (count === entry.rolls || tail < 1e-15) break;
      // The step from count to count + 1 happens when more than `count` rolls show these faces.
      while (powers.length <= count + 1) {
        const stepped = apply(powers[powers.length - 1] ?? new Map<number, number>(), step);
        stepWaste.push(stepped.wasted);
        powers.push(stepped.vector);
      }
      wasted += entry.q * tail * (stepWaste[count] ?? 0);
    }
  }
  return { tagged: next, wasted };
}

/** Applies `step` `count` times, with count drawn from `counts` (e.g. mortal wounds). */
export function repeat(
  vector: Vector,
  step: Step,
  counts: number[],
): { vector: Vector; wasted: number } {
  const out: Vector = new Map();
  let wasted = 0;
  let current = vector;
  let tail = 1;
  for (let n = 0; n < counts.length; n += 1) {
    const w = counts[n] ?? 0;
    if (w > 0) for (const [id, p] of current) addTo(out, id, p * w);
    tail -= w;
    if (n === counts.length - 1 || tail < 1e-15) break;
    const stepped = apply(current, step);
    wasted += tail * stepped.wasted;
    current = stepped.vector;
  }
  return { vector: out, wasted };
}
```

- [ ] **Step 6: Run the tests and checks**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/resolve.test.ts`
Expected: PASS (6 tests).
Then: `pnpm exec tsc -p packages/shared/tsconfig.json --noEmit && pnpm exec eslint packages/shared/src/mathhammer` → no output.

- [ ] **Step 7: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add packages/shared/src/mathhammer/allocate.ts packages/shared/src/mathhammer/resolve.ts packages/shared/src/mathhammer/test-helpers.ts packages/shared/src/mathhammer/resolve.test.ts
git commit -m "feat: mathhammer allocation with sorted saves, overkill and Feel No Pain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The engine

**Files:**

- Create: `packages/shared/src/mathhammer/engine.ts`
- Test: `packages/shared/src/mathhammer/engine.test.ts`

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces: `class DiceError`, `calculate(calculation: Calculation): CalculationResult` (`modelsSlain`, `woundsDealt`, `wipe`, `leaderSlain`, `averages { modelsSlain, woundsDealt, wasted }`, `orders`).

- [ ] **Step 1: Write the failing test `packages/shared/src/mathhammer/engine.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { calculate, DiceError } from './engine';
import { SITUATION, calc, crowd, defender, group, weapon } from './test-helpers';
import type { Situation } from './types';

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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/engine.test.ts`
Expected: FAIL, the module(s) under test don’t exist yet.

- [ ] **Step 3: Write `packages/shared/src/mathhammer/engine.ts`**

```ts
import {
  faceClasses,
  type Allocation,
  type DamageModel,
  type SaveProfile,
  type State,
} from './allocate';
import {
  addTagged,
  addTo,
  classPass,
  startPass,
  createSpace,
  hitStep,
  repeat,
  startState,
  type Space,
  type Tagged,
  type Vector,
} from './resolve';
import { convolve, parseDice, point, type Dist } from './dice';
import { weaponPool, type PoolRules } from './pool';
import { capModifier, rollOdds, woundNeeded, type Classify, type Reroll } from './rolls';
import type { Calculation, CalculationResult, Defender, Situation, Weapon } from './types';

/** A dice expression the engine can't read. */
export class DiceError extends Error {
  constructor(expression: string) {
    super(`Can’t read “${expression}” as dice (use 3, D6, 2D6, D6+3…)`);
    this.name = 'DiceError';
  }
}

function dice(expression: string): Dist {
  const dist = parseDice(expression);
  if (dist === null) throw new DiceError(expression);
  return dist;
}

const alive = (state: State, g: number) => (state[g * 2] ?? 0) > 0;

/** 11e: an attached unit uses its bodyguard's highest T; otherwise the highest T alive. */
function toughnessOf(state: State, defender: Defender): number {
  const live = defender.groups.filter((_, g) => alive(state, g));
  const bodyguard = live.filter((g) => !g.character);
  const pool = defender.attached && bodyguard.length > 0 ? bodyguard : live;
  return Math.max(0, ...pool.map((g) => g.toughness));
}

const modelsOf = (state: State, defender: Defender) =>
  defender.groups.reduce((sum, _, g) => sum + (state[g * 2] ?? 0), 0);

interface WeaponSetup {
  pool: PoolRules;
  normal: SaveProfile;
  /** Critical wounds saved with a better AP/D; null when they are ordinary wounds or Devastating. */
  critical: SaveProfile | null;
  /** Devastating Wounds: mortal wounds per critical wound; null without it. */
  devastating: DamageModel | null;
}

function setUp(
  weapon: Weapon,
  defender: Defender,
  situation: Situation,
  toughness: number,
  targetModels: number,
  oneDie: { hit: boolean; wound: boolean },
): WeaponSetup {
  const m = weapon.mods;
  const ranged = !weapon.melee;
  // Attacks: A, plus Rapid Fire at half range, Blast and Cleave per five target models.
  let perModel = dice(weapon.attacks);
  if (ranged && situation.halfRange && weapon.rapidFire !== null) {
    perModel = convolve(perModel, dice(weapon.rapidFire));
  }
  const fives = Math.floor(targetModels / 5);
  const bonus = (weapon.blast ?? 0) * fives + (weapon.cleave ?? 0) * fives;
  if (bonus > 0) perModel = convolve(perModel, point(bonus));
  let attacks: Dist = [1];
  for (let i = 0; i < weapon.models; i += 1) attacks = convolve(attacks, perModel);

  // Hit roll.
  const snap = ranged && situation.snapShooting;
  const indirect = ranged && weapon.indirectFire && situation.indirectShooting;
  const cover = ranged && !m.ignoresCover && (situation.cover || defender.stealth || indirect);
  const skill = Math.min(
    6,
    Math.max(2, (weapon.skill ?? 6) + (cover ? 1 : 0) - (ranged && situation.plungingFire ? 1 : 0)),
  );
  const hitModifier = capModifier(
    m.hitModifier +
      (weapon.heavy && ranged && !situation.movedOver3 ? 1 : 0) -
      (situation.attackerDamaged ? 1 : 0) +
      defender.hitModifier,
    m.hitIgnorePenalties,
  );
  const failUpTo = indirect ? (situation.indirectStationaryVisible ? 3 : 5) : 0;
  const classifyHit: Classify = (face) => {
    if (face === 1) return 0;
    if (snap) return face === 6 ? 1 : 0;
    if (face <= failUpTo) return 0;
    if (face >= m.critHitOn) return 2;
    return face + hitModifier >= skill ? 1 : 0;
  };
  const hitRerolls = !snap && !indirect;
  const hitReroll: Reroll = hitRerolls ? m.hitReroll : 'none';

  // Wound roll.
  const need = woundNeeded(weapon.strength, toughness);
  const woundModifier = capModifier(
    m.woundModifier + (weapon.lance && situation.charged ? 1 : 0) + defender.woundModifier,
    m.woundIgnorePenalties,
  );
  const keywords = new Set(defender.keywords.map((k) => k.toUpperCase()));
  const critWoundOn = Math.min(
    m.critWoundOn,
    ...weapon.anti.filter((a) => keywords.has(a.keyword.toUpperCase())).map((a) => a.value),
  );
  const classifyWound: Classify = (face) => {
    if (face === 1) return 0;
    if (face >= critWoundOn) return 2;
    return face + woundModifier >= need ? 1 : 0;
  };

  // Damage.
  const melta = ranged && situation.halfRange ? (weapon.melta ?? 0) : 0;
  const raw = dice(weapon.damage);
  const attackDamage = (extra: number): DamageModel => ({
    raw,
    reroll: m.damageReroll,
    oneDie: m.damageRerollOneDie,
    final: (value) => {
      let d = Math.max(1, value + melta + m.damageModifier + extra);
      if (!m.ignoreDamageReduction) {
        if (defender.halveDamage) d = Math.ceil(d / 2);
        d = Math.max(1, d - defender.damageReduction);
      }
      return d;
    },
  });
  const ap = (extra: number) =>
    Math.min(0, weapon.ap - m.apImprove - extra + (situation.armourOfContempt ? 1 : 0));
  const saveModifier = defender.savePenaltiesIgnored ? 0 : m.saveModifier;
  const special = m.devastatingWounds || m.critAp > 0 || m.critDamage > 0;

  return {
    pool: {
      attacks,
      hit: m.torrent ? null : rollOdds(classifyHit, hitReroll),
      hitOneDie: m.torrent || !hitRerolls || !oneDie.hit ? null : rollOdds(classifyHit, 'none'),
      sustained: m.sustainedHits === null || m.torrent ? null : dice(m.sustainedHits),
      lethal: m.lethalHits && !m.torrent,
      wound: rollOdds(classifyWound, m.woundReroll),
      woundOneDie: oneDie.wound ? rollOdds(classifyWound, 'none') : null,
      critSpecial: special,
    },
    normal: { ap: ap(0), saveModifier, damage: attackDamage(0) },
    critical:
      special && !m.devastatingWounds
        ? { ap: ap(m.critAp), saveModifier, damage: attackDamage(m.critDamage) }
        : null,
    devastating: m.devastatingWounds
      ? {
          raw,
          reroll: m.damageReroll,
          oneDie: m.damageRerollOneDie,
          // Mortal wounds equal to D: the defender's damage reduction doesn't apply.
          final: (value) => Math.max(1, value + melta + m.damageModifier + m.critDamage),
        }
      : null,
  };
}

/** Resolves one weapon's attacks against every state, partitioned by what the weapon sees. */
/** A weapon's attacks for one toughness / model count: the same whatever order is tried. */
interface Prepared {
  setup: WeaponSetup;
  entries: { rolls: number; later: number; q: number }[];
}

function resolveWeapon(
  space: Space,
  vector: Vector,
  weapon: Weapon,
  calculation: Calculation,
  priority: number[],
  oneDie: { hit: boolean; wound: boolean },
  prepared: Map<string, Prepared>,
): { vector: Vector; wasted: number } {
  const { defender, situation } = calculation;
  const allocation: Allocation = { groups: defender.groups, priority, precision: weapon.precision };
  const parts = new Map<
    string,
    { key: string; toughness: number; models: number; vector: Vector }
  >();
  const out: Vector = new Map();
  for (const [id, p] of vector) {
    const state = space.state(id);
    const models = modelsOf(state, defender);
    if (models === 0) {
      addTo(out, id, p);
      continue;
    }
    const toughness = toughnessOf(state, defender);
    // Only Blast and Cleave care how many models there are, and only per five.
    const fives = weapon.blast !== null || weapon.cleave !== null ? Math.floor(models / 5) : 0;
    const key = `${String(toughness)}:${String(fives)}`;
    const part = parts.get(key) ?? { key, toughness, models, vector: new Map<number, number>() };
    parts.set(key, part);
    addTo(part.vector, id, p);
  }
  let wasted = 0;
  for (const part of parts.values()) {
    let ready = prepared.get(part.key);
    if (ready === undefined) {
      const setup = setUp(weapon, defender, situation, part.toughness, part.models, oneDie);
      // Every count starts from this part's states: the first class pass shares its steps.
      const entries: { rolls: number; later: number; q: number }[] = [];
      weaponPool(setup.pool).forEach((row, normal) => {
        row.forEach((q, specials) => {
          if (q < 1e-15) return;
          if (setup.critical !== null) entries.push({ rolls: specials, later: normal, q });
          else entries.push({ rolls: normal, later: specials, q });
        });
      });
      ready = { setup, entries };
      prepared.set(part.key, ready);
    }
    const { setup, entries } = ready;
    // Each pool's save faces class by class from the lowest; the first class pass shares its
    // steps between counts, since they all start from this part's states.
    const pass = (from: Tagged | null, profile: SaveProfile): Tagged => {
      let tags = from;
      let used = 0;
      for (const c of faceClasses(defender.groups, profile)) {
        const step = hitStep(space, allocation, profile.damage, c.hurts);
        const share = Math.min(1, c.chance / (1 - used));
        const result =
          tags === null
            ? startPass(part.vector, entries, step, share)
            : classPass(tags, step, share);
        tags = result.tagged;
        wasted += result.wasted;
        used += c.chance;
      }
      return tags ?? startPass(part.vector, entries, () => [], 0).tagged;
    };
    let tagged: Tagged;
    if (setup.critical === null) tagged = pass(null, setup.normal);
    else {
      // Better-AP critical wounds are saved first (the attacker's choice), then normal wounds.
      const swapped: Tagged = new Map();
      for (const tag of pass(null, setup.critical).values()) {
        for (const [id, p] of tag.vector) addTagged(swapped, tag.later, 0, id, p);
      }
      tagged = pass(swapped, setup.normal);
    }
    const mortal =
      setup.devastating === null
        ? null
        : hitStep(space, { ...allocation, precision: false }, setup.devastating, null);
    for (const tag of tagged.values()) {
      if (mortal === null || tag.later === 0) {
        for (const [id, p] of tag.vector) addTo(out, id, p);
        continue;
      }
      // Mortal wounds after normal damage; each critical wound damages at most one model.
      const counts = new Array<number>(tag.later + 1).fill(0);
      counts[tag.later] = 1;
      const result = repeat(tag.vector, mortal, counts);
      for (const [id, p] of result.vector) addTo(out, id, p);
      wasted += result.wasted;
    }
  }
  return { vector: out, wasted };
}

function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

function slainOf(space: Space, vector: Vector, defender: Defender): number {
  let total = 0;
  for (const [id, p] of vector) {
    const state = space.state(id);
    total += p * defender.groups.reduce((sum, g, i) => sum + g.models - (state[i * 2] ?? 0), 0);
  }
  return total;
}

function woundsOf(state: State, defender: Defender): number {
  return defender.groups.reduce(
    (sum, g, i) => sum + (g.models - (state[i * 2] ?? 0)) * g.wounds + (state[i * 2 + 1] ?? 0),
    0,
  );
}

/** The exact result of one unit's attacks against one target (11th edition). */
export function calculate(calculation: Calculation): CalculationResult {
  const { defender } = calculation;
  const space = createSpace(defender.groups);
  let vector: Vector = new Map([[space.id(startState(defender.groups)), 1]]);
  let wasted = 0;
  const orders: number[][] = [];
  const indices = defender.groups.map((_, i) => i);
  const others = indices.filter((i) => defender.groups[i]?.character !== true);
  const characters = indices.filter((i) => defender.groups[i]?.character === true);
  const candidates = permutations(others).flatMap((o) =>
    permutations(characters).map((c) => [...o, ...c]),
  );
  // "Re-roll one die" for hits/wounds: the unit's first weapon that has it uses it.
  let hitOneDie = true;
  let woundOneDie = true;
  for (const weapon of calculation.weapons) {
    if (weapon.models <= 0) continue;
    const oneDie = {
      hit: hitOneDie && weapon.mods.hitRerollOneDie,
      wound: woundOneDie && weapon.mods.woundRerollOneDie,
    };
    if (oneDie.hit) hitOneDie = false;
    if (oneDie.wound) woundOneDie = false;
    const prepared = new Map<string, Prepared>();
    // The defender declares the order that loses the fewest models (then fewest wounds).
    let best: {
      priority: number[];
      vector: Vector;
      wasted: number;
      score: [number, number];
    } | null = null;
    for (const priority of candidates) {
      const result = resolveWeapon(space, vector, weapon, calculation, priority, oneDie, prepared);
      let wounds = 0;
      for (const [id, p] of result.vector) wounds += p * woundsOf(space.state(id), defender);
      const score: [number, number] = [slainOf(space, result.vector, defender), wounds];
      const better =
        best === null ||
        score[0] < best.score[0] - 1e-12 ||
        (Math.abs(score[0] - best.score[0]) <= 1e-12 && score[1] < best.score[1] - 1e-12);
      if (better) best = { priority, vector: result.vector, wasted: result.wasted, score };
    }
    if (best === null) continue;
    vector = best.vector;
    wasted += best.wasted;
    orders.push(best.priority);
  }
  if (calculation.flatMortals !== null) {
    // Each mortal wound is one wound lost (Feel No Pain applies), to the mortal-wound model.
    const one: DamageModel = { raw: point(1), reroll: false, oneDie: false, final: () => 1 };
    const mortal: Allocation = {
      groups: defender.groups,
      priority: orders.at(-1) ?? candidates[0] ?? [],
      precision: false,
    };
    const result = repeat(vector, hitStep(space, mortal, one, null), dice(calculation.flatMortals));
    vector = result.vector;
    wasted += result.wasted;
  }
  const slain: number[] = [];
  const wounds: number[] = [];
  let wipe = 0;
  let leaderSlain = 0;
  const add = (list: number[], at: number, p: number) => {
    while (list.length <= at) list.push(0);
    list[at] = (list[at] ?? 0) + p;
  };
  for (const [id, p] of vector) {
    const state = space.state(id);
    const killed = defender.groups.reduce((sum, g, i) => sum + g.models - (state[i * 2] ?? 0), 0);
    add(slain, killed, p);
    add(wounds, woundsOf(state, defender), p);
    if (defender.groups.every((_, i) => (state[i * 2] ?? 0) === 0)) wipe += p;
    if (characters.some((i) => (state[i * 2] ?? 0) === 0)) leaderSlain += p;
  }
  const average = (list: number[]) => list.reduce((sum, p, v) => sum + p * v, 0);
  return {
    modelsSlain: slain,
    woundsDealt: wounds,
    wipe,
    leaderSlain: characters.length > 0 ? leaderSlain : null,
    averages: { modelsSlain: average(slain), woundsDealt: average(wounds), wasted },
    orders,
  };
}
```

- [ ] **Step 4: Run the tests and checks**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/engine.test.ts`
Expected: PASS (12 tests).
Then: `pnpm exec tsc -p packages/shared/tsconfig.json --noEmit && pnpm exec eslint packages/shared/src/mathhammer` → no output.

- [ ] **Step 5: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add packages/shared/src/mathhammer/engine.ts packages/shared/src/mathhammer/engine.test.ts
git commit -m "feat: mathhammer engine for one unit into one target

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Simulator cross-check and speed

**Files:**

- Create: `packages/shared/src/mathhammer/simulate.ts`
- Test: `packages/shared/src/mathhammer/crosscheck.test.ts`

**Interfaces:**

- Consumes: `calculate` (Task 4), `atLeast` (Task 1), test helpers (Task 3).
- Produces: `simulate(calculation, orders, runs, seed): { modelsSlain; woundsDealt; wasted }` (tests only; an independent dice-rolling implementation of the same rules).

- [ ] **Step 1: Write the failing test `packages/shared/src/mathhammer/crosscheck.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/crosscheck.test.ts`
Expected: FAIL, the module(s) under test don’t exist yet.

- [ ] **Step 3: Write `packages/shared/src/mathhammer/simulate.ts`**

```ts
import type { Calculation, Weapon } from './types';

/** A small seeded random generator (mulberry32), so simulations repeat exactly. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollExpr(expression: string, d6: () => number): number {
  const text = expression.replace(/\s+/g, '').toUpperCase();
  if (/^\d+$/.test(text)) return Number(text);
  const m = /^(\d*)D([36])([+-]\d+)?$/.exec(text);
  if (m === null) throw new Error(`bad dice ${expression}`);
  let total = Number(m[3] ?? 0);
  for (let i = 0; i < (m[1] ? Number(m[1]) : 1); i += 1) {
    const face = d6();
    total += m[2] === '3' ? Math.ceil(face / 2) : face;
  }
  return Math.max(0, total);
}

function average(expression: string): number {
  const text = expression.replace(/\s+/g, '').toUpperCase();
  if (/^\d+$/.test(text)) return Number(text);
  const m = /^(\d*)D([36])([+-]\d+)?$/.exec(text);
  if (m === null) throw new Error(`bad dice ${expression}`);
  const count = m[1] ? Number(m[1]) : 1;
  return count * (m[2] === '3' ? 2 : 3.5) + Number(m[3] ?? 0);
}

const cap = (total: number, ignore: boolean) => Math.max(ignore ? 0 : -1, Math.min(1, total));

/** Rolls the calculation `runs` times; returns P(models slain = n) and P(wounds lost = n). */
export function simulate(
  calc: Calculation,
  orders: number[][],
  runs: number,
  seed = 1,
): { modelsSlain: number[]; woundsDealt: number[]; wasted: number } {
  const rnd = random(seed);
  const d6 = () => 1 + Math.floor(rnd() * 6);
  const { defender, situation } = calc;
  const groups = defender.groups;
  const slainCount: number[] = [];
  const woundCount: number[] = [];
  let wastedTotal = 0;
  const bump = (list: number[], at: number) => {
    while (list.length <= at) list.push(0);
    list[at] = (list[at] ?? 0) + 1;
  };

  for (let run = 0; run < runs; run += 1) {
    const alive = groups.map((g) => g.models);
    const taken = groups.map(() => 0);
    let rerollLeft = true;
    let hitOneDie = true;
    let woundOneDie = true;
    let wasted = 0;

    const pick = (priority: number[], precision: boolean): number => {
      const live = priority.filter((g) => (alive[g] ?? 0) > 0);
      const others = live.filter((g) => groups[g]?.character !== true);
      const chars = live.filter((g) => groups[g]?.character === true);
      const choose = (list: number[]) => list.find((g) => (taken[g] ?? 0) > 0) ?? list[0];
      if (precision && chars.length > 0) return choose(chars) ?? -1;
      if (others.length > 0) return choose(others) ?? -1;
      return choose(chars) ?? -1;
    };
    const lose = (g: number, points: number) => {
      const group = groups[g];
      if (group === undefined) return;
      let lost = 0;
      for (let i = 0; i < points; i += 1) {
        if (group.fnp === null || d6() < group.fnp) lost += 1;
      }
      const room = group.wounds - (taken[g] ?? 0);
      const applied = Math.min(lost, room);
      wasted += lost - applied;
      taken[g] = (taken[g] ?? 0) + applied;
      if ((taken[g] ?? 0) >= group.wounds) {
        alive[g] = (alive[g] ?? 0) - 1;
        taken[g] = 0;
      }
    };
    const damageRoll = (weapon: Weapon, extra: number, mortal: boolean): number => {
      const m = weapon.mods;
      let raw = rollExpr(weapon.damage, d6);
      const avg = average(weapon.damage);
      if (raw < avg && m.damageReroll) raw = rollExpr(weapon.damage, d6);
      else if (raw < avg && m.damageRerollOneDie && rerollLeft) {
        raw = rollExpr(weapon.damage, d6);
        rerollLeft = false;
      }
      const melta = !weapon.melee && situation.halfRange ? (weapon.melta ?? 0) : 0;
      let d = Math.max(1, raw + melta + m.damageModifier + extra);
      if (!mortal && !m.ignoreDamageReduction) {
        if (defender.halveDamage) d = Math.ceil(d / 2);
        d = Math.max(1, d - defender.damageReduction);
      }
      return d;
    };

    calc.weapons
      .filter((w) => w.models > 0)
      .forEach((weapon, index) => {
        const m = weapon.mods;
        const priority = orders[index] ?? groups.map((_, i) => i);
        const ranged = !weapon.melee;
        const live = groups.map((_, g) => g).filter((g) => (alive[g] ?? 0) > 0);
        if (live.length === 0) return;
        const bodyguard = live.filter((g) => groups[g]?.character !== true);
        const tPool = defender.attached && bodyguard.length > 0 ? bodyguard : live;
        const toughness = Math.max(...tPool.map((g) => groups[g]?.toughness ?? 0));
        const models = live.reduce((sum, g) => sum + (alive[g] ?? 0), 0);
        const useHitOneDie = hitOneDie && m.hitRerollOneDie;
        const useWoundOneDie = woundOneDie && m.woundRerollOneDie;
        if (useHitOneDie) hitOneDie = false;
        if (useWoundOneDie) woundOneDie = false;

        // Attacks.
        let attacks = 0;
        const fives = Math.floor(models / 5);
        for (let i = 0; i < weapon.models; i += 1) {
          attacks += rollExpr(weapon.attacks, d6);
          if (ranged && situation.halfRange && weapon.rapidFire !== null) {
            attacks += rollExpr(weapon.rapidFire, d6);
          }
          attacks += ((weapon.blast ?? 0) + (weapon.cleave ?? 0)) * fives;
        }

        // Hits.
        const snap = ranged && situation.snapShooting;
        const indirect = ranged && weapon.indirectFire && situation.indirectShooting;
        const cover =
          ranged && !m.ignoresCover && (situation.cover || defender.stealth || indirect);
        const skill = Math.min(
          6,
          Math.max(
            2,
            (weapon.skill ?? 6) + (cover ? 1 : 0) - (ranged && situation.plungingFire ? 1 : 0),
          ),
        );
        const hitMod = cap(
          m.hitModifier +
            (weapon.heavy && ranged && !situation.movedOver3 ? 1 : 0) -
            (situation.attackerDamaged ? 1 : 0) +
            defender.hitModifier,
          m.hitIgnorePenalties,
        );
        const failUpTo = indirect ? (situation.indirectStationaryVisible ? 3 : 5) : 0;
        const hitResult = (f: number): number => {
          if (f === 1) return 0;
          if (snap) return f === 6 ? 1 : 0;
          if (f <= failUpTo) return 0;
          if (f >= m.critHitOn) return 2;
          return f + hitMod >= skill ? 1 : 0;
        };
        const canReroll = !snap && !indirect;
        const policy = canReroll ? m.hitReroll : 'none';
        const roll = (
          classify: (f: number) => number,
          reroll: string,
        ): { r: number; free: boolean } => {
          const f = d6();
          const r = classify(f);
          const again =
            reroll === 'ones'
              ? f === 1
              : reroll === 'failures'
                ? r === 0
                : reroll === 'fish'
                  ? r !== 2
                  : false;
          if (again) return { r: classify(d6()), free: false };
          return { r, free: r === 0 };
        };
        let woundRolls = 0;
        let autoWounds = 0;
        const hitResults: { r: number; free: boolean }[] = [];
        for (let i = 0; i < attacks; i += 1) {
          hitResults.push(m.torrent ? { r: 1, free: false } : roll(hitResult, policy));
        }
        if (useHitOneDie && canReroll && !m.torrent) {
          const idx = hitResults.findIndex((h) => h.r === 0 && h.free);
          if (idx >= 0) hitResults[idx] = { r: hitResult(d6()), free: false };
        }
        for (const h of hitResults) {
          if (h.r === 1) woundRolls += 1;
          if (h.r === 2) {
            const extra = m.sustainedHits === null || m.torrent ? 0 : rollExpr(m.sustainedHits, d6);
            if (m.lethalHits && !m.torrent) {
              autoWounds += 1;
              woundRolls += extra;
            } else woundRolls += 1 + extra;
          }
        }

        // Wounds.
        const sv = toughness;
        const need =
          weapon.strength >= sv * 2
            ? 2
            : weapon.strength > sv
              ? 3
              : weapon.strength === sv
                ? 4
                : weapon.strength * 2 <= sv
                  ? 6
                  : 5;
        const woundMod = cap(
          m.woundModifier + (weapon.lance && situation.charged ? 1 : 0) + defender.woundModifier,
          m.woundIgnorePenalties,
        );
        const kws = new Set(defender.keywords.map((k) => k.toUpperCase()));
        const critOn = Math.min(
          m.critWoundOn,
          ...weapon.anti.filter((a) => kws.has(a.keyword.toUpperCase())).map((a) => a.value),
        );
        const woundResult = (f: number): number =>
          f === 1 ? 0 : f >= critOn ? 2 : f + woundMod >= need ? 1 : 0;
        const woundResults: { r: number; free: boolean }[] = [];
        for (let i = 0; i < woundRolls; i += 1) woundResults.push(roll(woundResult, m.woundReroll));
        if (useWoundOneDie) {
          const idx = woundResults.findIndex((h) => h.r === 0 && h.free);
          if (idx >= 0) woundResults[idx] = { r: woundResult(d6()), free: false };
        }
        const special = m.devastatingWounds || m.critAp > 0 || m.critDamage > 0;
        let normal = autoWounds;
        let crits = 0;
        for (const w of woundResults) {
          if (w.r === 1) normal += 1;
          if (w.r === 2) {
            if (special) crits += 1;
            else normal += 1;
          }
        }

        // Saves, lowest roll first, each against the current group.
        const apOf = (extra: number) =>
          Math.min(0, weapon.ap - m.apImprove - extra + (situation.armourOfContempt ? 1 : 0));
        const saveMod = defender.savePenaltiesIgnored ? 0 : m.saveModifier;
        const savePool = (count: number, ap: number, extraDamage: number) => {
          const faces: number[] = [];
          for (let i = 0; i < count; i += 1) faces.push(d6());
          faces.sort((a, b) => a - b);
          for (const f of faces) {
            const g = pick(priority, weapon.precision);
            if (g < 0) return;
            const group = groups[g];
            if (group === undefined) return;
            const ok =
              f !== 1 &&
              ((group.invuln !== null && f >= group.invuln) || f + ap - saveMod >= group.save);
            if (ok) continue;
            lose(g, damageRoll(weapon, extraDamage, false));
          }
        };
        if (special && !m.devastatingWounds) savePool(crits, apOf(m.critAp), m.critDamage);
        savePool(normal, apOf(0), 0);
        if (m.devastatingWounds) {
          for (let i = 0; i < crits; i += 1) {
            const g = pick(priority, false);
            if (g < 0) break;
            lose(g, damageRoll(weapon, m.critDamage, true));
          }
        }
      });

    if (calc.flatMortals !== null) {
      const count = rollExpr(calc.flatMortals, d6);
      const priority = orders.at(-1) ?? groups.map((_, i) => i);
      for (let i = 0; i < count; i += 1) {
        const g = pick(priority, false);
        if (g < 0) break;
        lose(g, 1);
      }
    }

    const slain = groups.reduce((s, g, i) => s + g.models - (alive[i] ?? 0), 0);
    const wounds = groups.reduce(
      (s, g, i) => s + (g.models - (alive[i] ?? 0)) * g.wounds + (taken[i] ?? 0),
      0,
    );
    bump(slainCount, slain);
    bump(woundCount, wounds);
    wastedTotal += wasted;
  }
  return {
    modelsSlain: slainCount.map((c) => c / runs),
    woundsDealt: woundCount.map((c) => c / runs),
    wasted: wastedTotal / runs,
  };
}
```

- [ ] **Step 4: Run the tests and checks**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/crosscheck.test.ts`
Expected: PASS (22 tests).
Then: `pnpm exec tsc -p packages/shared/tsconfig.json --noEmit && pnpm exec eslint packages/shared/src/mathhammer` → no output.

- [ ] **Step 5: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add packages/shared/src/mathhammer/simulate.ts packages/shared/src/mathhammer/crosscheck.test.ts
git commit -m "test: mathhammer engine agrees with 200,000 rolled games

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Weapon keywords and the shared export

**Files:**

- Create: `packages/shared/src/mathhammer/weapons.ts`
- Create: `packages/shared/src/mathhammer/index.ts`
- Modify: packages/shared/src/index.ts (add `export * from './mathhammer';`)
- Test: `packages/shared/src/mathhammer/weapons.test.ts`

**Interfaces:**

- Consumes: `Weapon`, `WeaponMods` (Task 1).
- Produces: `WeaponKeywords`, `WeaponProfile`, `NO_KEYWORDS`, `buildWeapon(profile, keywords, unit): Weapon`, `parseAnti(text)`; `@bcp/shared` exports the engine (`calculate`, `atLeast`, `parseDice`, types, `Reroll`).

- [ ] **Step 1: Write the failing test `packages/shared/src/mathhammer/weapons.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/weapons.test.ts`
Expected: FAIL, the module(s) under test don’t exist yet.

- [ ] **Step 3: Write `packages/shared/src/mathhammer/weapons.ts`**

```ts
import type { Weapon, WeaponMods } from './types';

/** A weapon's own keywords: they switch on their effects for that weapon. */
export interface WeaponKeywords {
  torrent: boolean;
  lethalHits: boolean;
  /** Sustained Hits X ("1", "2", "D3"); null without it. */
  sustainedHits: string | null;
  devastatingWounds: boolean;
  twinLinked: boolean;
  heavy: boolean;
  lance: boolean;
  ignoresCover: boolean;
  precision: boolean;
  indirectFire: boolean;
  anti: { keyword: string; value: number }[];
  rapidFire: string | null;
  blast: number | null;
  cleave: number | null;
  melta: number | null;
}

/** A weapon profile as typed (or read from a datasheet). */
export interface WeaponProfile {
  name: string;
  models: number;
  melee: boolean;
  attacks: string;
  skill: number | null;
  strength: number;
  ap: number;
  damage: string;
}

export const NO_KEYWORDS: WeaponKeywords = {
  torrent: false,
  lethalHits: false,
  sustainedHits: null,
  devastatingWounds: false,
  twinLinked: false,
  heavy: false,
  lance: false,
  ignoresCover: false,
  precision: false,
  indirectFire: false,
  anti: [],
  rapidFire: null,
  blast: null,
  cleave: null,
  melta: null,
};

/**
 * The weapon the engine resolves: the unit's switches with the weapon's keywords switched on
 * (a keyword never switches a unit switch off; Twin-linked re-rolls failed wound rolls unless the
 * unit already re-rolls more).
 */
export function buildWeapon(
  profile: WeaponProfile,
  keywords: WeaponKeywords,
  unit: WeaponMods,
): Weapon {
  return {
    ...profile,
    heavy: keywords.heavy,
    lance: keywords.lance,
    precision: keywords.precision,
    indirectFire: keywords.indirectFire,
    anti: keywords.anti,
    rapidFire: keywords.rapidFire,
    blast: keywords.blast,
    cleave: keywords.cleave,
    melta: keywords.melta,
    mods: {
      ...unit,
      torrent: unit.torrent || keywords.torrent,
      lethalHits: unit.lethalHits || keywords.lethalHits,
      sustainedHits: keywords.sustainedHits ?? unit.sustainedHits,
      devastatingWounds: unit.devastatingWounds || keywords.devastatingWounds,
      ignoresCover: unit.ignoresCover || keywords.ignoresCover,
      woundReroll:
        keywords.twinLinked && (unit.woundReroll === 'none' || unit.woundReroll === 'ones')
          ? 'failures'
          : unit.woundReroll,
    },
  };
}

const ANTI = /^\s*(?:ANTI-)?([A-Z][A-Z' -]*?)\s+([2-6])\+\s*$/i;

/** "INFANTRY 4+, VEHICLE 3+" (or "Anti-infantry 4+") → keyword and value pairs; null if unreadable. */
export function parseAnti(text: string): { keyword: string; value: number }[] | null {
  if (text.trim() === '') return [];
  const out: { keyword: string; value: number }[] = [];
  for (const part of text.split(',')) {
    const match = ANTI.exec(part);
    if (match === null) return null;
    out.push({ keyword: (match[1] ?? '').trim().toUpperCase(), value: Number(match[2]) });
  }
  return out;
}
```

- [ ] **Step 4: Write `packages/shared/src/mathhammer/index.ts`**

```ts
export * from './dice';
export * from './engine';
export * from './types';
export * from './weapons';
export type { Reroll } from './rolls';
```

- [ ] **Step 5: Export it from the shared package**

In `packages/shared/src/index.ts`, add after the last export:

```ts
export * from './mathhammer';
```

- [ ] **Step 6: Run the tests and checks**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/weapons.test.ts`
Expected: PASS (3 tests).
Then: `pnpm exec tsc -p packages/shared/tsconfig.json --noEmit && pnpm exec eslint packages/shared/src/mathhammer` → no output.

- [ ] **Step 7: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add packages/shared/src/mathhammer/weapons.ts packages/shared/src/mathhammer/index.ts packages/shared/src/mathhammer/weapons.test.ts packages/shared/src/index.ts
git commit -m "feat: mathhammer weapon keywords and exports

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The page's form model

**Files:**

- Create: `apps/web/src/features/mathhammer/form-state.ts`
- Test: `apps/web/src/features/mathhammer/form-state.test.ts`

**Interfaces:**

- Consumes: `buildWeapon`, `parseAnti`, `parseDice`, `DEFAULT_MODS`, `Calculation`, `Situation`, `WeaponMods` from `@bcp/shared` (Task 6).
- Produces: `WeaponRow`, `GroupRow`, `DefenderForm`, `MathhammerForm`, `NO_SITUATION`, `newWeapon()`, `newGroup()`, `defaultForm()` (five bolt rifles into ten Boyz), `toCalculation(form): { calculation } | { error }`.

- [ ] **Step 1: Write the failing test `apps/web/src/features/mathhammer/form-state.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { defaultForm, toCalculation, type MathhammerForm } from './form-state';

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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --project web apps/web/src/features/mathhammer/form-state.test.ts`
Expected: FAIL, `./form-state` doesn’t exist.

- [ ] **Step 3: Write `apps/web/src/features/mathhammer/form-state.ts`**

```ts
import {
  buildWeapon,
  DEFAULT_MODS,
  parseAnti,
  parseDice,
  type Calculation,
  type Situation,
  type WeaponMods,
} from '@bcp/shared';

/** One weapon as typed: its profile and its keywords. */
export interface WeaponRow {
  key: string;
  name: string;
  models: number;
  melee: boolean;
  attacks: string;
  /** BS/WS (3 for 3+); null for weapons without one (Torrent). */
  skill: number | null;
  strength: number;
  ap: number;
  damage: string;
  torrent: boolean;
  lethalHits: boolean;
  /** Sustained Hits X ("" = none). */
  sustainedHits: string;
  devastatingWounds: boolean;
  twinLinked: boolean;
  heavy: boolean;
  lance: boolean;
  ignoresCover: boolean;
  precision: boolean;
  indirectFire: boolean;
  /** Rapid Fire X ("" = none). */
  rapidFire: string;
  blast: number | null;
  cleave: number | null;
  melta: number | null;
  /** "INFANTRY 4+, VEHICLE 3+" ("" = none). */
  anti: string;
}

/** One kind of model in the target. */
export interface GroupRow {
  key: string;
  name: string;
  models: number;
  toughness: number;
  save: number;
  invuln: number | null;
  wounds: number;
  fnp: number | null;
  character: boolean;
}

export interface DefenderForm {
  groups: GroupRow[];
  /** Comma-separated, for Anti-X. */
  keywords: string;
  attached: boolean;
  stealth: boolean;
  hitModifier: number;
  woundModifier: number;
  damageReduction: number;
  halveDamage: boolean;
  savePenaltiesIgnored: boolean;
}

export interface MathhammerForm {
  weapons: WeaponRow[];
  /** The attacking unit's switches, for all its weapons. */
  unit: WeaponMods;
  defender: DefenderForm;
  situation: Situation;
  /** Mortal wounds after all weapons ("" = none). */
  flatMortals: string;
}

export const NO_SITUATION: Situation = {
  movedOver3: false,
  halfRange: false,
  charged: false,
  plungingFire: false,
  snapShooting: false,
  indirectShooting: false,
  indirectStationaryVisible: false,
  attackerDamaged: false,
  cover: false,
  armourOfContempt: false,
};

let counter = 0;
const nextKey = () => {
  counter += 1;
  return `row-${String(counter)}`;
};

export const newWeapon = (): WeaponRow => ({
  key: nextKey(),
  name: 'Weapon',
  models: 1,
  melee: false,
  attacks: '1',
  skill: 3,
  strength: 4,
  ap: 0,
  damage: '1',
  torrent: false,
  lethalHits: false,
  sustainedHits: '',
  devastatingWounds: false,
  twinLinked: false,
  heavy: false,
  lance: false,
  ignoresCover: false,
  precision: false,
  indirectFire: false,
  rapidFire: '',
  blast: null,
  cleave: null,
  melta: null,
  anti: '',
});

export const newGroup = (): GroupRow => ({
  key: nextKey(),
  name: 'Models',
  models: 5,
  toughness: 4,
  save: 3,
  invuln: null,
  wounds: 1,
  fnp: null,
  character: false,
});

/** A setup to start from: five bolt rifles into ten Boyz. */
export function defaultForm(): MathhammerForm {
  return {
    weapons: [{ ...newWeapon(), name: 'Bolt rifle', models: 5, attacks: '2', ap: -1, heavy: true }],
    unit: DEFAULT_MODS,
    defender: {
      groups: [{ ...newGroup(), name: 'Boyz', models: 10, toughness: 5, save: 5 }],
      keywords: 'INFANTRY, ORKS',
      attached: false,
      stealth: false,
      hitModifier: 0,
      woundModifier: 0,
      damageReduction: 0,
      halveDamage: false,
      savePenaltiesIgnored: false,
    },
    situation: NO_SITUATION,
    flatMortals: '',
  };
}

const optional = (text: string) => (text.trim() === '' ? null : text.trim());

/** The form as an engine calculation, or what can't be read in it. */
export function toCalculation(
  form: MathhammerForm,
): { calculation: Calculation } | { error: string } {
  const problems: string[] = [];
  const dice = (label: string, text: string) => {
    if (parseDice(text) === null)
      problems.push(`${label}: can’t read “${text}” (use 3, D6, 2D6, D6+3…)`);
  };
  const weapons = form.weapons.map((row) => {
    dice(`${row.name} attacks`, row.attacks);
    dice(`${row.name} damage`, row.damage);
    if (optional(row.sustainedHits) !== null) dice(`${row.name} Sustained Hits`, row.sustainedHits);
    if (optional(row.rapidFire) !== null) dice(`${row.name} Rapid Fire`, row.rapidFire);
    const anti = parseAnti(row.anti);
    if (anti === null)
      problems.push(`${row.name}: can’t read Anti “${row.anti}” (write e.g. INFANTRY 4+)`);
    return buildWeapon(
      {
        name: row.name,
        models: row.models,
        melee: row.melee,
        attacks: row.attacks,
        skill: row.skill,
        strength: row.strength,
        ap: row.ap,
        damage: row.damage,
      },
      {
        torrent: row.torrent,
        lethalHits: row.lethalHits,
        sustainedHits: optional(row.sustainedHits),
        devastatingWounds: row.devastatingWounds,
        twinLinked: row.twinLinked,
        heavy: row.heavy,
        lance: row.lance,
        ignoresCover: row.ignoresCover,
        precision: row.precision,
        indirectFire: row.indirectFire,
        anti: anti ?? [],
        rapidFire: optional(row.rapidFire),
        blast: row.blast,
        cleave: row.cleave,
        melta: row.melta,
      },
      form.unit,
    );
  });
  if (form.unit.sustainedHits !== null) dice('Sustained Hits', form.unit.sustainedHits);
  const flatMortals = optional(form.flatMortals);
  if (flatMortals !== null) dice('Mortal wounds', flatMortals);
  if (form.defender.groups.length === 0)
    problems.push('Add at least one kind of model to the target');
  if (problems.length > 0) return { error: problems.join(' · ') };
  const { groups, keywords, ...rest } = form.defender;
  return {
    calculation: {
      weapons,
      defender: {
        ...rest,
        groups: groups.map(({ key: _key, ...group }) => group),
        keywords: keywords
          .split(',')
          .map((k) => k.trim().toUpperCase())
          .filter((k) => k !== ''),
      },
      situation: form.situation,
      flatMortals,
    },
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run --project web apps/web/src/features/mathhammer/form-state.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add apps/web/src/features/mathhammer/form-state.ts apps/web/src/features/mathhammer/form-state.test.ts
git commit -m "feat: mathhammer page form and its calculation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The Mathhammer page

**Files:**

- Create: `apps/web/src/features/mathhammer/inputs.tsx`, `apps/web/src/features/mathhammer/WeaponEditor.tsx`, `apps/web/src/features/mathhammer/AttackerPanel.tsx`, `apps/web/src/features/mathhammer/DefenderPanel.tsx`, `apps/web/src/features/mathhammer/SituationPanel.tsx`, `apps/web/src/features/mathhammer/ResultPanel.tsx`, `apps/web/src/features/mathhammer/ResultPanel.module.css`, `apps/web/src/features/mathhammer/MathhammerPage.tsx`
- Create: `apps/web/src/routes/mathhammer.tsx`
- Modify: `apps/web/src/components/AppLayout.tsx` (`NAV_ITEMS`: `{ to: '/mathhammer', label: 'Mathhammer' }` after Top lists)
- Regenerate: `apps/web/src/routeTree.gen.ts`
- Test: `apps/web/src/features/mathhammer/MathhammerPage.test.tsx`

**Interfaces:**

- Consumes: Task 7's form model; `calculate`, `atLeast`, `CalculationResult`, `Reroll`, `Situation`, `WeaponMods` from `@bcp/shared`.
- Produces: the `/mathhammer` route and nav entry; `MathhammerPage`; `ResultPanel` with `percent(p)` and `type Outcome`.

**Layout:** left column (lg 7/12): Attacker (weapons, each a fieldset “Weapon N” with profile, keywords, ↑/↓/Remove; Add weapon; the unit's hit, wound, save and damage switches) and Situation. Right column (5/12): Result (averages, “Models slain, at least” table with bars, allocation order) and Defender (rows “Models N” with Character tick; keywords; attached, Stealth and defender switches). The result is computed from `useDeferredValue(form)`.

- [ ] **Step 1: Write the failing test `apps/web/src/features/mathhammer/MathhammerPage.test.tsx`**

```tsx
import { calculate } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { defaultForm, toCalculation } from './form-state';
import { MathhammerPage } from './MathhammerPage';
import { percent } from './ResultPanel';

/** The engine's average models slain for a form, as the page shows it. */
function expectedSlain(change: (form: ReturnType<typeof defaultForm>) => void): string {
  const form = defaultForm();
  change(form);
  const read = toCalculation(form);
  if (!('calculation' in read)) throw new Error(read.error);
  return calculate(read.calculation).averages.modelsSlain.toFixed(2);
}

const weapon = () => within(screen.getByRole('group', { name: 'Weapon 1' }));

describe('MathhammerPage', () => {
  it('shows the result of the starting setup', () => {
    renderWithProviders(<MathhammerPage />);
    expect(screen.getByLabelText('Models slain')).toHaveTextContent(expectedSlain(() => undefined));
    expect(screen.getByRole('table', { name: 'Models slain, at least' })).toBeInTheDocument();
  });

  it('recalculates when a weapon changes', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.change(weapon().getByLabelText('Attacks'), { target: { value: '4' } });
    const want = expectedSlain((form) => {
      const first = form.weapons[0];
      if (first !== undefined) form.weapons = [{ ...first, attacks: '4' }];
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Models slain')).toHaveTextContent(want);
    });
  });

  it('applies the situation', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.click(screen.getByLabelText('In cover (-1 BS for ranged)'));
    const want = expectedSlain((form) => {
      form.situation = { ...form.situation, cover: true };
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Models slain')).toHaveTextContent(want);
    });
  });

  it('says what it can’t read', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.change(weapon().getByLabelText('D'), { target: { value: 'D7' } });
    expect(await screen.findByText('Can’t calculate')).toBeInTheDocument();
    expect(screen.getByText(/Bolt rifle damage: can’t read “D7”/)).toBeInTheDocument();
  });

  it('shows the leader’s chance once a Character is added', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Add models' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Models 2' })).getByLabelText('Character'),
    );
    expect(await screen.findByText('Leader slain')).toBeInTheDocument();
    expect(screen.getByText(/^Allocation: /)).toBeInTheDocument();
  });
});

describe('percent', () => {
  it('never rounds a real chance to 0% or 100%', () => {
    expect(percent(0.623)).toBe('62%');
    expect(percent(0.001)).toBe('<1%');
    expect(percent(0.999)).toBe('>99%');
    expect(percent(1)).toBe('100%');
    expect(percent(0)).toBe('0%');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --project web apps/web/src/features/mathhammer/MathhammerPage.test.tsx`
Expected: FAIL, `./MathhammerPage` doesn’t exist.

- [ ] **Step 3: Write `apps/web/src/features/mathhammer/inputs.tsx`**

```tsx
import { Checkbox, NumberInput, Select, TextInput } from '@mantine/core';
import type { Reroll } from '@bcp/shared';

/** A small whole-number field; with `nullable`, empty means none. */
export function Num({
  label,
  value,
  onChange,
  min,
  max,
  nullable = false,
  w = 72,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  nullable?: boolean;
  w?: number;
}) {
  return (
    <NumberInput
      size="xs"
      label={label}
      value={value ?? ''}
      min={min}
      max={max}
      w={w}
      allowDecimal={false}
      onChange={(next) => {
        if (next === '') onChange(nullable ? null : (min ?? 0));
        else onChange(typeof next === 'number' ? next : Number(next));
      }}
    />
  );
}

/** A dice field: 3, D6, 2D6, D6+3… */
export function DiceInput({
  label,
  value,
  onChange,
  w = 72,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  w?: number;
  placeholder?: string;
}) {
  return (
    <TextInput
      size="xs"
      label={label}
      value={value}
      w={w}
      placeholder={placeholder}
      onChange={(event) => {
        onChange(event.currentTarget.value);
      }}
    />
  );
}

export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      size="xs"
      label={label}
      checked={checked}
      onChange={(event) => {
        onChange(event.currentTarget.checked);
      }}
    />
  );
}

const REROLLS: { value: Reroll; label: string }[] = [
  { value: 'none', label: 'No re-roll' },
  { value: 'ones', label: 'Re-roll 1s' },
  { value: 'failures', label: 'Re-roll fails' },
  { value: 'fish', label: 'Re-roll non-criticals' },
];

export function RerollSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Reroll;
  onChange: (value: Reroll) => void;
}) {
  return (
    <Select
      size="xs"
      label={label}
      data={REROLLS}
      value={value}
      w={170}
      allowDeselect={false}
      onChange={(next) => {
        const found = REROLLS.find((r) => r.value === next);
        if (found !== undefined) onChange(found.value);
      }}
    />
  );
}

/** -1, 0 or +1. */
export function ModifierSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Select
      size="xs"
      label={label}
      data={['-1', '0', '+1']}
      value={value > 0 ? '+1' : String(value)}
      w={80}
      allowDeselect={false}
      onChange={(next) => {
        onChange(Number(next ?? '0'));
      }}
    />
  );
}

/** Critical on 2+ … 6+. */
export function CritSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Select
      size="xs"
      label={label}
      data={['6', '5', '4', '3', '2'].map((v) => ({ value: v, label: `${v}+` }))}
      value={String(value)}
      w={80}
      allowDeselect={false}
      onChange={(next) => {
        onChange(Number(next ?? '6'));
      }}
    />
  );
}
```

- [ ] **Step 4: Write `apps/web/src/features/mathhammer/WeaponEditor.tsx`**

```tsx
import { Button, Group, Paper, Stack, TextInput } from '@mantine/core';
import type { WeaponRow } from './form-state';
import { Check, DiceInput, Num } from './inputs';

/** One weapon: its profile on the first line, its keywords on the second. */
export function WeaponEditor({
  index,
  weapon,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  weapon: WeaponRow;
  count: number;
  onChange: (patch: Partial<WeaponRow>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const w = weapon;
  return (
    <Paper withBorder p="sm" component="fieldset" aria-label={`Weapon ${String(index + 1)}`}>
      <Stack gap="xs">
        <Group gap="xs" align="flex-end">
          <TextInput
            size="xs"
            label="Weapon"
            value={w.name}
            w={150}
            onChange={(event) => {
              onChange({ name: event.currentTarget.value });
            }}
          />
          <Num
            label="Models"
            value={w.models}
            min={0}
            onChange={(v) => {
              onChange({ models: v ?? 0 });
            }}
          />
          <DiceInput
            label="Attacks"
            value={w.attacks}
            onChange={(v) => {
              onChange({ attacks: v });
            }}
          />
          <Num
            label={w.melee ? 'WS' : 'BS'}
            value={w.skill}
            min={2}
            max={6}
            nullable
            onChange={(v) => {
              onChange({ skill: v });
            }}
          />
          <Num
            label="S"
            value={w.strength}
            min={1}
            onChange={(v) => {
              onChange({ strength: v ?? 1 });
            }}
          />
          <Num
            label="AP"
            value={w.ap}
            min={-6}
            max={0}
            onChange={(v) => {
              onChange({ ap: v ?? 0 });
            }}
          />
          <DiceInput
            label="D"
            value={w.damage}
            onChange={(v) => {
              onChange({ damage: v });
            }}
          />
          <Check
            label="Melee"
            checked={w.melee}
            onChange={(v) => {
              onChange({ melee: v });
            }}
          />
          <Group gap={4}>
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => {
                onMove(-1);
              }}
            >
              ↑
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label="Move down"
              disabled={index === count - 1}
              onClick={() => {
                onMove(1);
              }}
            >
              ↓
            </Button>
            <Button size="compact-xs" variant="subtle" color="red" onClick={onRemove}>
              Remove
            </Button>
          </Group>
        </Group>
        <Group gap="sm" align="flex-end">
          <Check
            label="Torrent"
            checked={w.torrent}
            onChange={(v) => {
              onChange({ torrent: v });
            }}
          />
          <Check
            label="Lethal Hits"
            checked={w.lethalHits}
            onChange={(v) => {
              onChange({ lethalHits: v });
            }}
          />
          <Check
            label="Devastating Wounds"
            checked={w.devastatingWounds}
            onChange={(v) => {
              onChange({ devastatingWounds: v });
            }}
          />
          <Check
            label="Twin-linked"
            checked={w.twinLinked}
            onChange={(v) => {
              onChange({ twinLinked: v });
            }}
          />
          <Check
            label="Heavy"
            checked={w.heavy}
            onChange={(v) => {
              onChange({ heavy: v });
            }}
          />
          <Check
            label="Lance"
            checked={w.lance}
            onChange={(v) => {
              onChange({ lance: v });
            }}
          />
          <Check
            label="Ignores Cover"
            checked={w.ignoresCover}
            onChange={(v) => {
              onChange({ ignoresCover: v });
            }}
          />
          <Check
            label="Precision"
            checked={w.precision}
            onChange={(v) => {
              onChange({ precision: v });
            }}
          />
          <Check
            label="Indirect Fire"
            checked={w.indirectFire}
            onChange={(v) => {
              onChange({ indirectFire: v });
            }}
          />
        </Group>
        <Group gap="xs" align="flex-end">
          <DiceInput
            label="Sustained Hits"
            value={w.sustainedHits}
            w={96}
            onChange={(v) => {
              onChange({ sustainedHits: v });
            }}
          />
          <DiceInput
            label="Rapid Fire"
            value={w.rapidFire}
            w={80}
            onChange={(v) => {
              onChange({ rapidFire: v });
            }}
          />
          <Num
            label="Blast"
            value={w.blast}
            min={1}
            nullable
            onChange={(v) => {
              onChange({ blast: v });
            }}
          />
          <Num
            label="Cleave"
            value={w.cleave}
            min={1}
            nullable
            onChange={(v) => {
              onChange({ cleave: v });
            }}
          />
          <Num
            label="Melta"
            value={w.melta}
            min={1}
            nullable
            onChange={(v) => {
              onChange({ melta: v });
            }}
          />
          <TextInput
            size="xs"
            label="Anti"
            placeholder="INFANTRY 4+"
            value={w.anti}
            w={160}
            onChange={(event) => {
              onChange({ anti: event.currentTarget.value });
            }}
          />
        </Group>
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 5: Write `apps/web/src/features/mathhammer/AttackerPanel.tsx`**

```tsx
import type { WeaponMods } from '@bcp/shared';
import { Button, Group, Stack, Text } from '@mantine/core';
import { Panel } from '../../components/Panel';
import { newWeapon, type MathhammerForm, type WeaponRow } from './form-state';
import { Check, CritSelect, DiceInput, ModifierSelect, Num, RerollSelect } from './inputs';
import { WeaponEditor } from './WeaponEditor';

/** The unit's switches: they apply to all its weapons (weapon keywords add to them). */
function UnitSwitches({
  unit,
  flatMortals,
  onChange,
}: {
  unit: WeaponMods;
  flatMortals: string;
  onChange: (unit: WeaponMods, flatMortals: string) => void;
}) {
  const set = (patch: Partial<WeaponMods>) => {
    onChange({ ...unit, ...patch }, flatMortals);
  };
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        Hit roll
      </Text>
      <Group gap="xs" align="flex-end">
        <RerollSelect
          label="Re-roll hits"
          value={unit.hitReroll}
          onChange={(v) => {
            set({ hitReroll: v });
          }}
        />
        <Check
          label="Re-roll one hit"
          checked={unit.hitRerollOneDie}
          onChange={(v) => {
            set({ hitRerollOneDie: v });
          }}
        />
        <ModifierSelect
          label="To hit"
          value={unit.hitModifier}
          onChange={(v) => {
            set({ hitModifier: v });
          }}
        />
        <Check
          label="Ignore hit penalties"
          checked={unit.hitIgnorePenalties}
          onChange={(v) => {
            set({ hitIgnorePenalties: v });
          }}
        />
        <CritSelect
          label="Critical hit"
          value={unit.critHitOn}
          onChange={(v) => {
            set({ critHitOn: v });
          }}
        />
        <DiceInput
          label="Sustained Hits"
          value={unit.sustainedHits ?? ''}
          w={96}
          onChange={(v) => {
            set({ sustainedHits: v.trim() === '' ? null : v.trim() });
          }}
        />
        <Check
          label="Lethal Hits"
          checked={unit.lethalHits}
          onChange={(v) => {
            set({ lethalHits: v });
          }}
        />
        <Check
          label="Ignores Cover"
          checked={unit.ignoresCover}
          onChange={(v) => {
            set({ ignoresCover: v });
          }}
        />
      </Group>
      <Text size="sm" fw={600}>
        Wound roll
      </Text>
      <Group gap="xs" align="flex-end">
        <RerollSelect
          label="Re-roll wounds"
          value={unit.woundReroll}
          onChange={(v) => {
            set({ woundReroll: v });
          }}
        />
        <Check
          label="Re-roll one wound"
          checked={unit.woundRerollOneDie}
          onChange={(v) => {
            set({ woundRerollOneDie: v });
          }}
        />
        <ModifierSelect
          label="To wound"
          value={unit.woundModifier}
          onChange={(v) => {
            set({ woundModifier: v });
          }}
        />
        <Check
          label="Ignore wound penalties"
          checked={unit.woundIgnorePenalties}
          onChange={(v) => {
            set({ woundIgnorePenalties: v });
          }}
        />
        <CritSelect
          label="Critical wound"
          value={unit.critWoundOn}
          onChange={(v) => {
            set({ critWoundOn: v });
          }}
        />
        <Num
          label="Critical AP +"
          value={unit.critAp}
          min={0}
          w={96}
          onChange={(v) => {
            set({ critAp: v ?? 0 });
          }}
        />
        <Num
          label="Critical D +"
          value={unit.critDamage}
          min={0}
          w={96}
          onChange={(v) => {
            set({ critDamage: v ?? 0 });
          }}
        />
        <Check
          label="Devastating Wounds"
          checked={unit.devastatingWounds}
          onChange={(v) => {
            set({ devastatingWounds: v });
          }}
        />
      </Group>
      <Text size="sm" fw={600}>
        Saves and damage
      </Text>
      <Group gap="xs" align="flex-end">
        <Num
          label="Improve AP by"
          value={unit.apImprove}
          min={0}
          w={96}
          onChange={(v) => {
            set({ apImprove: v ?? 0 });
          }}
        />
        <Num
          label="Worsen saves by"
          value={unit.saveModifier}
          min={0}
          w={110}
          onChange={(v) => {
            set({ saveModifier: v ?? 0 });
          }}
        />
        <Check
          label="Re-roll damage"
          checked={unit.damageReroll}
          onChange={(v) => {
            set({ damageReroll: v });
          }}
        />
        <Check
          label="Re-roll one damage"
          checked={unit.damageRerollOneDie}
          onChange={(v) => {
            set({ damageRerollOneDie: v });
          }}
        />
        <Num
          label="Damage +"
          value={unit.damageModifier}
          min={-3}
          w={80}
          onChange={(v) => {
            set({ damageModifier: v ?? 0 });
          }}
        />
        <Check
          label="Ignore damage reduction"
          checked={unit.ignoreDamageReduction}
          onChange={(v) => {
            set({ ignoreDamageReduction: v });
          }}
        />
        <DiceInput
          label="Mortal wounds"
          value={flatMortals}
          w={96}
          placeholder="D3"
          onChange={(v) => {
            onChange(unit, v);
          }}
        />
      </Group>
    </Stack>
  );
}

/** The attacking unit: weapons in the order they resolve, and the unit's switches. */
export function AttackerPanel({
  form,
  onChange,
}: {
  form: MathhammerForm;
  onChange: (next: MathhammerForm) => void;
}) {
  const setWeapons = (weapons: WeaponRow[]) => {
    onChange({ ...form, weapons });
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...form.weapons];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(index + by, 0, moved);
    setWeapons(next);
  };
  return (
    <Panel title="Attacker">
      <Stack gap="md">
        {form.weapons.map((weapon, index) => (
          <WeaponEditor
            key={weapon.key}
            index={index}
            weapon={weapon}
            count={form.weapons.length}
            onChange={(patch) => {
              setWeapons(form.weapons.map((w) => (w.key === weapon.key ? { ...w, ...patch } : w)));
            }}
            onMove={(by) => {
              move(index, by);
            }}
            onRemove={() => {
              setWeapons(form.weapons.filter((w) => w.key !== weapon.key));
            }}
          />
        ))}
        <Group>
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              setWeapons([...form.weapons, newWeapon()]);
            }}
          >
            Add weapon
          </Button>
        </Group>
        <UnitSwitches
          unit={form.unit}
          flatMortals={form.flatMortals}
          onChange={(unit, flatMortals) => {
            onChange({ ...form, unit, flatMortals });
          }}
        />
      </Stack>
    </Panel>
  );
}
```

- [ ] **Step 6: Write `apps/web/src/features/mathhammer/DefenderPanel.tsx`**

```tsx
import { Button, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { Panel } from '../../components/Panel';
import { newGroup, type DefenderForm, type GroupRow } from './form-state';
import { Check, Num } from './inputs';

function GroupEditor({
  index,
  group,
  onChange,
  onRemove,
}: {
  index: number;
  group: GroupRow;
  onChange: (patch: Partial<GroupRow>) => void;
  onRemove: () => void;
}) {
  const g = group;
  return (
    <Paper withBorder p="sm" component="fieldset" aria-label={`Models ${String(index + 1)}`}>
      <Group gap="xs" align="flex-end">
        <TextInput
          size="xs"
          label="Models"
          value={g.name}
          w={130}
          onChange={(event) => {
            onChange({ name: event.currentTarget.value });
          }}
        />
        <Num
          label="How many"
          value={g.models}
          min={1}
          onChange={(v) => {
            onChange({ models: v ?? 1 });
          }}
        />
        <Num
          label="T"
          value={g.toughness}
          min={1}
          w={60}
          onChange={(v) => {
            onChange({ toughness: v ?? 1 });
          }}
        />
        <Num
          label="Sv"
          value={g.save}
          min={2}
          max={7}
          w={60}
          onChange={(v) => {
            onChange({ save: v ?? 7 });
          }}
        />
        <Num
          label="InSv"
          value={g.invuln}
          min={2}
          max={6}
          w={60}
          nullable
          onChange={(v) => {
            onChange({ invuln: v });
          }}
        />
        <Num
          label="W"
          value={g.wounds}
          min={1}
          w={60}
          onChange={(v) => {
            onChange({ wounds: v ?? 1 });
          }}
        />
        <Num
          label="FNP"
          value={g.fnp}
          min={2}
          max={6}
          w={60}
          nullable
          onChange={(v) => {
            onChange({ fnp: v });
          }}
        />
        <Check
          label="Character"
          checked={g.character}
          onChange={(v) => {
            onChange({ character: v });
          }}
        />
        <Button size="compact-xs" variant="subtle" color="red" onClick={onRemove}>
          Remove
        </Button>
      </Group>
    </Paper>
  );
}

/** The target: its kinds of model (a leader is a Character), keywords and switches. */
export function DefenderPanel({
  defender,
  onChange,
}: {
  defender: DefenderForm;
  onChange: (next: DefenderForm) => void;
}) {
  const set = (patch: Partial<DefenderForm>) => {
    onChange({ ...defender, ...patch });
  };
  return (
    <Panel title="Defender">
      <Stack gap="md">
        <Text size="xs" c="dimmed">
          One row per kind of model; a leader is its own row with Character ticked. Sv 7 means no
          save.
        </Text>
        {defender.groups.map((group, index) => (
          <GroupEditor
            key={group.key}
            index={index}
            group={group}
            onChange={(patch) => {
              set({
                groups: defender.groups.map((g) => (g.key === group.key ? { ...g, ...patch } : g)),
              });
            }}
            onRemove={() => {
              set({ groups: defender.groups.filter((g) => g.key !== group.key) });
            }}
          />
        ))}
        <Group>
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              set({ groups: [...defender.groups, newGroup()] });
            }}
          >
            Add models
          </Button>
        </Group>
        <TextInput
          size="xs"
          label="Keywords"
          description="For Anti-X, e.g. INFANTRY, ORKS"
          value={defender.keywords}
          onChange={(event) => {
            set({ keywords: event.currentTarget.value });
          }}
        />
        <Group gap="sm" align="flex-end">
          <Check
            label="Attached unit"
            checked={defender.attached}
            onChange={(v) => {
              set({ attached: v });
            }}
          />
          <Check
            label="Stealth"
            checked={defender.stealth}
            onChange={(v) => {
              set({ stealth: v });
            }}
          />
          <Check
            label="-1 to be hit"
            checked={defender.hitModifier < 0}
            onChange={(v) => {
              set({ hitModifier: v ? -1 : 0 });
            }}
          />
          <Check
            label="-1 to be wounded"
            checked={defender.woundModifier < 0}
            onChange={(v) => {
              set({ woundModifier: v ? -1 : 0 });
            }}
          />
          <Check
            label="Halve damage"
            checked={defender.halveDamage}
            onChange={(v) => {
              set({ halveDamage: v });
            }}
          />
          <Check
            label="Save penalties ignored"
            checked={defender.savePenaltiesIgnored}
            onChange={(v) => {
              set({ savePenaltiesIgnored: v });
            }}
          />
          <Num
            label="Damage -"
            value={defender.damageReduction}
            min={0}
            w={80}
            onChange={(v) => {
              set({ damageReduction: v ?? 0 });
            }}
          />
        </Group>
      </Stack>
    </Panel>
  );
}
```

- [ ] **Step 7: Write `apps/web/src/features/mathhammer/SituationPanel.tsx`**

```tsx
import type { Situation } from '@bcp/shared';
import { SimpleGrid, Stack, Text } from '@mantine/core';
import { Panel } from '../../components/Panel';
import { Check } from './inputs';

/** The situation of the whole calculation: weapon rules apply only when theirs is ticked. */
export function SituationPanel({
  situation,
  onChange,
}: {
  situation: Situation;
  onChange: (next: Situation) => void;
}) {
  const check = (label: string, key: keyof Situation) => (
    <Check
      label={label}
      checked={situation[key]}
      onChange={(v) => {
        onChange({ ...situation, [key]: v });
      }}
    />
  );
  return (
    <Panel title="Situation">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Stack gap={6}>
          <Text size="sm" fw={600}>
            Attacker
          </Text>
          {check('Moved more than 3" (no Heavy)', 'movedOver3')}
          {check('Half range (Rapid Fire, Melta)', 'halfRange')}
          {check('Charged (Lance)', 'charged')}
          {check('Plunging fire (+1 BS)', 'plungingFire')}
          {check('Snap shooting (6s hit)', 'snapShooting')}
          {check('Indirect shooting', 'indirectShooting')}
          {check('…stayed still, target seen by a friend', 'indirectStationaryVisible')}
          {check('Damaged (-1 to hit)', 'attackerDamaged')}
        </Stack>
        <Stack gap={6}>
          <Text size="sm" fw={600}>
            Target
          </Text>
          {check('In cover (-1 BS for ranged)', 'cover')}
          {check('Armour of Contempt (AP worse by 1)', 'armourOfContempt')}
        </Stack>
      </SimpleGrid>
    </Panel>
  );
}
```

- [ ] **Step 8: Write `apps/web/src/features/mathhammer/ResultPanel.tsx` and `apps/web/src/features/mathhammer/ResultPanel.module.css`**

```tsx
import { atLeast, type CalculationResult } from '@bcp/shared';
import { Alert, Group, Stack, Table, Text } from '@mantine/core';
import { Panel } from '../../components/Panel';
import classes from './ResultPanel.module.css';

/** 0.623 → "62%"; tiny chances never round to a flat 0% or 100%. */
export function percent(p: number): string {
  if (p > 0 && p < 0.005) return '<1%';
  if (p < 1 && p >= 0.995) return '>99%';
  return `${String(Math.round(p * 100))}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="lg" fw={600} className="numeric" aria-label={label}>
        {value}
      </Text>
    </Stack>
  );
}

export type Outcome = { result: CalculationResult; groupNames: string[] } | { error: string };

/** Averages, the chance of each number of models slain or more, and the allocation used. */
export function ResultPanel({ outcome }: { outcome: Outcome }) {
  if ('error' in outcome) {
    return (
      <Panel title="Result">
        <Alert color="red" title="Can’t calculate">
          {outcome.error}
        </Alert>
      </Panel>
    );
  }
  const { result, groupNames } = outcome;
  const slain = atLeast(result.modelsSlain).slice(1);
  const order = result.orders[0];
  return (
    <Panel title="Result">
      <Stack gap="md">
        <Group gap="xl">
          <Stat label="Models slain" value={result.averages.modelsSlain.toFixed(2)} />
          <Stat label="Wounds dealt" value={result.averages.woundsDealt.toFixed(2)} />
          <Stat label="Wasted damage" value={result.averages.wasted.toFixed(2)} />
          <Stat label="Wipe" value={percent(result.wipe)} />
          {result.leaderSlain !== null && (
            <Stat label="Leader slain" value={percent(result.leaderSlain)} />
          )}
        </Group>
        <Table aria-label="Models slain, at least" withRowBorders={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Models slain</Table.Th>
              <Table.Th ta="right">Chance</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {slain.map((p, i) => (
              <Table.Tr key={i}>
                <Table.Td className="numeric">{`${String(i + 1)}+`}</Table.Td>
                <Table.Td ta="right" className="numeric">
                  {percent(p)}
                </Table.Td>
                <Table.Td w="60%">
                  <div className={classes.track} aria-hidden>
                    <div className={classes.bar} style={{ width: `${String(p * 100)}%` }} />
                  </div>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {order !== undefined && groupNames.length > 1 && (
          <Text size="xs" c="dimmed">
            {`Allocation: ${order.map((g) => groupNames[g] ?? '?').join(' → ')}`}
          </Text>
        )}
      </Stack>
    </Panel>
  );
}
```

```css
/* The chance of slaying at least that many models. */
.track {
  height: 8px;
  border-radius: var(--mantine-radius-sm);
  background: var(--mantine-color-dark-6);
  overflow: hidden;
}

.bar {
  height: 100%;
  border-radius: var(--mantine-radius-sm);
  background: var(--mantine-color-neon-5);
}
```

- [ ] **Step 9: Write `apps/web/src/features/mathhammer/MathhammerPage.tsx`**

```tsx
import { calculate } from '@bcp/shared';
import { Grid, Stack, Text, Title } from '@mantine/core';
import { useDeferredValue, useMemo, useState } from 'react';
import { AttackerPanel } from './AttackerPanel';
import { DefenderPanel } from './DefenderPanel';
import { defaultForm, toCalculation } from './form-state';
import { ResultPanel, type Outcome } from './ResultPanel';
import { SituationPanel } from './SituationPanel';

/** Exact chances for one unit's attacks into one target (11th edition). */
export function MathhammerPage() {
  const [form, setForm] = useState(defaultForm);
  // Typing stays quick while a big calculation catches up.
  const settled = useDeferredValue(form);
  const outcome = useMemo<Outcome>(() => {
    const read = toCalculation(settled);
    if ('error' in read) return read;
    try {
      return {
        result: calculate(read.calculation),
        groupNames: settled.defender.groups.map((g) => g.name),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [settled]);

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={1}>Mathhammer</Title>
        <Text size="sm" c="dimmed">
          Exact chances, worked out from the dice by 11th-edition rules.
        </Text>
      </Stack>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Stack gap="lg">
            <AttackerPanel form={form} onChange={setForm} />
            <SituationPanel
              situation={form.situation}
              onChange={(situation) => {
                setForm({ ...form, situation });
              }}
            />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack gap="lg">
            <ResultPanel outcome={outcome} />
            <DefenderPanel
              defender={form.defender}
              onChange={(defender) => {
                setForm({ ...form, defender });
              }}
            />
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
```

- [ ] **Step 10: Add the route and nav entry**

`apps/web/src/routes/mathhammer.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { MathhammerPage } from '../features/mathhammer/MathhammerPage';

export const Route = createFileRoute('/mathhammer')({ component: MathhammerPage });
```

In `apps/web/src/components/AppLayout.tsx`, `NAV_ITEMS`, after `{ to: '/analysis/top-lists', label: 'Top lists' },` add:

```ts
  { to: '/mathhammer', label: 'Mathhammer' },
```

Regenerate the route tree in `apps/web`: `pnpm exec tsr generate`. Expected `git diff --stat apps/web/src/routeTree.gen.ts`: 21 insertions, only for `/mathhammer` (if a web dev server runs from this checkout and the diff shows anything else, delete the file and regenerate).

- [ ] **Step 11: Run the tests and checks**

Run: `pnpm vitest run --project web apps/web/src/features/mathhammer apps/web/src/components/AppLayout.test.tsx`
Expected: PASS (all; 6 in `MathhammerPage.test.tsx`).
Then: `pnpm exec tsc -p apps/web/tsconfig.json --noEmit && pnpm exec eslint apps/web/src/features/mathhammer apps/web/src/routes/mathhammer.tsx` → no output.

- [ ] **Step 12: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add apps/web/src/features/mathhammer apps/web/src/routes/mathhammer.tsx apps/web/src/components/AppLayout.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat: Mathhammer page with exact chances

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Full check and a real run

**Files:** none new.

- [ ] **Step 1: Run the whole gate**

Run: `pnpm check`
Expected: typecheck, eslint, prettier and every vitest project green (about 1,140 earlier tests plus this plan's). Fix any formatting the gate reports (`pnpm exec prettier --write <file>`), then commit as `chore: format`.

- [ ] **Step 2: Try the page in the preview**

Start the web and API preview (`.claude/launch.json`), open `/mathhammer` and check:

- the starting setup shows averages and a “Models slain, at least” table that falls from left to right;
- adding a second weapon and moving it with ↑/↓ changes the numbers;
- clearing Attacks shows “Can’t calculate … Attacks”, typing it back recovers;
- a Character row adds “Leader slain” and an “Allocation:” line;
- the page is usable at phone width (fields wrap).
  Take a screenshot for the owner.
