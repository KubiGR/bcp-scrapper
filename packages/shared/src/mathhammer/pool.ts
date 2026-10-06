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

/** Stage 1, all attack dice: the joint count of (hits that roll to wound, automatic wounds). */
function hitStage(rules: PoolRules): Joint {
  // One attack die → (hits that roll to wound, automatic wounds).
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
  return afterHits;
}

/** The weapon's exact joint count of (normal wounds, special wounds). */
export function weaponPool(rules: PoolRules): Joint {
  const afterHits = hitStage(rules);

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

/** A weapon's average counts at each stage (hits include Sustained extras and Lethal ones). */
export interface PoolAverages {
  attacks: number;
  hits: number;
  critHits: number;
  sustainedHits: number;
  /** Critical hits that wound automatically (Lethal Hits). */
  lethalHits: number;
  /** Wounds, Lethal Hits' included. */
  wounds: number;
  critWounds: number;
}

const mean = (dist: Dist) => dist.reduce((sum, p, value) => sum + p * value, 0);

/** The chance that some of n dice (n from `counts`) failed without a re-roll. */
const someFreeFail = (counts: number[], freeFail: number) =>
  counts.reduce((sum, p, n) => sum + p * (1 - (1 - freeFail) ** n), 0);

/**
 * Exact averages of `weaponPool`'s stages. Averages add up die by die; "re-roll one die" adds a
 * fresh roll whenever some die failed without a re-roll.
 */
export function poolAverages(rules: PoolRules): PoolAverages {
  const attacks = mean(rules.attacks);
  const extra = rules.sustained === null ? 0 : mean(rules.sustained);
  const perHitDie = (odds: RollOdds) => ({
    hits: odds.success + odds.crit * (1 + extra),
    crit: odds.crit,
    sustained: odds.crit * extra,
    lethal: rules.lethal ? odds.crit : 0,
  });
  let hit = { hits: attacks, crit: 0, sustained: 0, lethal: 0 };
  if (rules.hit !== null) {
    const die = perHitDie(rules.hit);
    const again = rules.hitOneDie === null ? 0 : someFreeFail(rules.attacks, rules.hit.freeFail);
    const fresh = rules.hitOneDie === null ? die : perHitDie(rules.hitOneDie);
    hit = {
      hits: attacks * die.hits + again * fresh.hits,
      crit: attacks * die.crit + again * fresh.crit,
      sustained: attacks * die.sustained + again * fresh.sustained,
      lethal: attacks * die.lethal + again * fresh.lethal,
    };
  }
  // Hits that roll to wound: their count's distribution, for "re-roll one wound".
  const rolls: number[] = [];
  hitStage(rules).forEach((row, n) => {
    rolls[n] = row.reduce((sum, p) => sum + p, 0);
  });
  const rolled = mean(rolls);
  const again = rules.woundOneDie === null ? 0 : someFreeFail(rolls, rules.wound.freeFail);
  const fresh = rules.woundOneDie ?? rules.wound;
  return {
    attacks,
    hits: hit.hits,
    critHits: hit.crit,
    sustainedHits: hit.sustained,
    lethalHits: hit.lethal,
    wounds:
      rolled * (rules.wound.success + rules.wound.crit) +
      again * (fresh.success + fresh.crit) +
      hit.lethal,
    critWounds: rolled * rules.wound.crit + again * fresh.crit,
  };
}
