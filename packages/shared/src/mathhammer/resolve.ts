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
    if (group === undefined) {
      // The target is wiped out: the attack's damage is wasted, when it would have got through
      // (saves as the first models allocated would make them).
      const through = hurts === null || hurts.has(allocation.priority[0] ?? 0);
      const lost = losses(damage, null, false).reduce((sum, l) => sum + l.p * l.lost, 0);
      outcomes = [{ to: id, p: 1, wasted: through ? lost : 0 }];
    } else if (hurts !== null && !hurts.has(g)) {
      outcomes = [{ to: id, p: 1, wasted: 0 }];
    } else {
      // Feel No Pain as this weapon meets it (the allocation's groups; psychic-only counted).
      const fnp = (allocation.groups[g] ?? group).fnp;
      outcomes = losses(damage, fnp, state[last] === 1).map((loss) => {
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
