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

/**
 * The modifier to a hit or wound roll: the sum of `modifiers` (each +1/-1/…) capped at ±1; with
 * `ignorePenalties`, the negative ones are left out before capping.
 */
export const capModifier = (modifiers: number[], ignorePenalties: boolean) =>
  Math.max(
    -1,
    Math.min(
      1,
      modifiers.reduce((sum, m) => sum + (ignorePenalties && m < 0 ? 0 : m), 0),
    ),
  );
