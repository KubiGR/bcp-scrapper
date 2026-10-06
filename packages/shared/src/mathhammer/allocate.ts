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

/** The chance a wound against this group fails its save (face 1 to 6, as allocation rolls). */
export function failChance(group: DefenderGroup, profile: SaveProfile): number {
  let fails = 0;
  for (let face = 1; face <= 6; face += 1) if (!saved(face, group, profile)) fails += 1;
  return fails / 6;
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
