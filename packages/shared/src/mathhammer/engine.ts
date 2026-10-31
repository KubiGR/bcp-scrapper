import {
  defenderFacing,
  faceClasses,
  failChance,
  losses,
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
import { poolWithAverages, type PoolAverages, type PoolRules } from './pool';
import { capModifier, rollOdds, woundNeeded, type Classify, type Reroll } from './rolls';
import type {
  Calculation,
  CalculationResult,
  Defender,
  DefenderGroup,
  Situation,
  Weapon,
  WeaponStep,
} from './types';

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
  // Attacks: A changed by the unit's modifier (never below 1), plus Rapid Fire at half range,
  // Blast and Cleave per five target models.
  const written = dice(weapon.attacks);
  const changed = (value: number) =>
    m.attacksModifier === 0 ? value : Math.max(1, value + m.attacksModifier);
  let perModel: Dist = new Array<number>(changed(written.length - 1) + 1).fill(0);
  written.forEach((p, value) => {
    const at = changed(value);
    perModel[at] = (perModel[at] ?? 0) + p;
  });
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
    Math.max(
      2,
      (weapon.skill === null ? 6 : Math.min(6, Math.max(2, weapon.skill - m.skillModifier))) +
        (cover ? 1 : 0) -
        (ranged && situation.plungingFire ? 1 : 0),
    ),
  );
  const hitModifier = capModifier(
    [
      m.hitModifier,
      weapon.heavy && ranged && !situation.movedOver3 ? 1 : 0,
      situation.attackerDamaged ? -1 : 0,
      defender.hitModifier,
    ],
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
  const need = woundNeeded(Math.max(1, weapon.strength + m.strengthModifier), toughness);
  const woundModifier = capModifier(
    [m.woundModifier, weapon.lance && situation.charged ? 1 : 0, defender.woundModifier],
    m.woundIgnorePenalties,
  );
  const keywords = new Set(defender.keywords.map((k) => k.toUpperCase()));
  const critWoundOn = Math.min(
    m.critWoundOn,
    ...weapon.anti
      .filter((a) => a.keyword === '*' || keywords.has(a.keyword.toUpperCase()))
      .map((a) => a.value),
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
  averages: PoolAverages;
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
): {
  vector: Vector;
  wasted: number;
  parts: { mass: number; setup: WeaponSetup; averages: PoolAverages }[];
} {
  const { defender, situation } = calculation;
  const allocation: Allocation = { groups: defender.groups, priority, precision: weapon.precision };
  const parts = new Map<
    string,
    { key: string; toughness: number; models: number; vector: Vector }
  >();
  const out: Vector = new Map();
  let gone = 0;
  for (const [id, p] of vector) {
    const state = space.state(id);
    const models = modelsOf(state, defender);
    if (models === 0) {
      addTo(out, id, p);
      gone += p;
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
  const used: { mass: number; setup: WeaponSetup; averages: PoolAverages }[] = [];
  for (const part of parts.values()) {
    let ready = prepared.get(part.key);
    if (ready === undefined) {
      const setup = setUp(weapon, defender, situation, part.toughness, part.models, oneDie);
      // Every count starts from this part's states: the first class pass shares its steps.
      const entries: { rolls: number; later: number; q: number }[] = [];
      const { joint, averages } = poolWithAverages(setup.pool);
      joint.forEach((row, normal) => {
        row.forEach((q, specials) => {
          if (q < 1e-15) return;
          if (setup.critical !== null) entries.push({ rolls: specials, later: normal, q });
          else entries.push({ rolls: normal, later: specials, q });
        });
      });
      ready = { setup, averages, entries };
      prepared.set(part.key, ready);
    }
    const { setup, averages, entries } = ready;
    let mass = 0;
    for (const p of part.vector.values()) mass += p;
    used.push({ mass, setup, averages });
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
  // Where the target is already gone the weapon still fires: what would have got through the
  // first models allocated is wasted.
  if (gone > 0) wasted += gone * volleyAtNothing(weapon, calculation, priority, oneDie);
  return { vector: out, wasted, parts: used };
}

const meanLost = (model: DamageModel) =>
  losses(model, null, false).reduce((sum, l) => sum + l.p * l.lost, 0);

/** The damage a volley would do through the first allocated models' saves: all of it wasted. */
function volleyAtNothing(
  weapon: Weapon,
  calculation: Calculation,
  priority: number[],
  oneDie: { hit: boolean; wound: boolean },
): number {
  const { defender, situation } = calculation;
  const first = defender.groups[priority[0] ?? 0];
  if (first === undefined) return 0;
  const setup = setUp(weapon, defender, situation, first.toughness, 0, oneDie);
  const a = poolWithAverages(setup.pool).averages;
  const through = (wounds: number, profile: SaveProfile) =>
    wounds * failChance(first, profile) * meanLost(profile.damage);
  if (setup.devastating !== null) {
    return (
      a.critWounds * meanLost(setup.devastating) + through(a.wounds - a.critWounds, setup.normal)
    );
  }
  if (setup.critical !== null) {
    return through(a.critWounds, setup.critical) + through(a.wounds - a.critWounds, setup.normal);
  }
  return through(a.wounds, setup.normal);
}

/**
 * A weapon's averages before saves for a whole volley: over the games where it has something to
 * shoot at (a target the weapons before it wiped out takes no attacks), from each kind of target
 * it met; and its unsaved wounds against the first group allocated.
 */
function stepOf(
  weapon: Weapon,
  defender: Defender,
  priority: number[],
  parts: { mass: number; setup: WeaponSetup; averages: PoolAverages }[],
): Omit<WeaponStep, 'damage' | 'wasted' | 'slain' | 'slainMedian'> {
  const first = defender.groups[priority[0] ?? 0];
  const fail = (profile: SaveProfile) => (first === undefined ? 1 : failChance(first, profile));
  const same = (profile: SaveProfile) =>
    defender.groups.every((g) => failChance(g, profile) === fail(profile));
  const step = {
    name: weapon.name,
    attacks: 0,
    hits: 0,
    critHits: 0,
    sustainedHits: 0,
    lethalHits: 0,
    wounds: 0,
    critWounds: 0,
    devastating: 0,
    unsaved: 0,
    unsavedExact: true,
  };
  for (const { mass, setup, averages: a } of parts) {
    step.attacks += mass * a.attacks;
    step.hits += mass * a.hits;
    step.critHits += mass * a.critHits;
    step.sustainedHits += mass * a.sustainedHits;
    step.lethalHits += mass * a.lethalHits;
    step.wounds += mass * a.wounds;
    step.critWounds += mass * a.critWounds;
    if (setup.devastating !== null) {
      step.devastating += mass * a.critWounds;
      step.unsaved += mass * (a.wounds - a.critWounds) * fail(setup.normal);
    } else if (setup.critical !== null) {
      step.unsaved +=
        mass *
        (a.critWounds * fail(setup.critical) + (a.wounds - a.critWounds) * fail(setup.normal));
      step.unsavedExact &&= same(setup.critical);
    } else {
      step.unsaved += mass * a.wounds * fail(setup.normal);
    }
    step.unsavedExact &&= same(setup.normal);
  }
  // Per volley: the games where the target was already gone don't lower the weapon's attacks.
  const fired = parts.reduce((sum, part) => sum + part.mass, 0);
  if (fired > 0) {
    for (const key of [
      'attacks',
      'hits',
      'critHits',
      'sustainedHits',
      'lethalHits',
      'wounds',
      'critWounds',
      'devastating',
      'unsaved',
    ] as const) {
      step[key] /= fired;
    }
  }
  return step;
}

function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

/** Orders tried for the defender; beyond this, the order as typed and a sturdiest-first one. */
const MAX_ORDERS = 24;

/**
 * The allocation orders the defender may declare (non-CHARACTER groups first), without repeats
 * of groups with the same profile. With many groups, trying every order would freeze the page,
 * so only two sensible ones are tried.
 */
function allocationOrders(groups: DefenderGroup[]): number[][] {
  const indices = groups.map((_, i) => i);
  const others = indices.filter((i) => groups[i]?.character !== true);
  const characters = indices.filter((i) => groups[i]?.character === true);
  const signature = (order: number[]) =>
    order
      .map((i) => {
        const g = groups[i];
        return g === undefined
          ? ''
          : [g.toughness, g.save, g.invuln, g.invulnAgainst, g.wounds, g.fnp].join('/');
      })
      .join('|');
  const distinct = (orders: number[][]) => {
    const seen = new Map<string, number[]>();
    for (const order of orders) if (!seen.has(signature(order))) seen.set(signature(order), order);
    return [...seen.values()];
  };
  const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
  const sturdiest = [...others].sort((a, b) => {
    const x = groups[a];
    const y = groups[b];
    if (x === undefined || y === undefined) return 0;
    return y.wounds - x.wounds || x.save - y.save;
  });
  const front =
    factorial(others.length) <= MAX_ORDERS
      ? distinct(permutations(others))
      : distinct([others, sturdiest]);
  const back =
    factorial(characters.length) <= MAX_ORDERS ? distinct(permutations(characters)) : [characters];
  const all = front.flatMap((o) => back.map((c) => [...o, ...c]));
  return all.length <= MAX_ORDERS
    ? all
    : distinct([
        [...others, ...characters],
        [...sturdiest, ...characters],
      ]);
}

function slainOf(space: Space, vector: Vector, defender: Defender): number {
  let total = 0;
  for (const [id, p] of vector) {
    const state = space.state(id);
    total += p * defender.groups.reduce((sum, g, i) => sum + g.models - (state[i * 2] ?? 0), 0);
  }
  return total;
}

/** The median models slain: the fewest slain at least half the time. */
function medianSlainOf(space: Space, vector: Vector, defender: Defender): number {
  const dist: number[] = [];
  for (const [id, p] of vector) {
    const state = space.state(id);
    const killed = defender.groups.reduce((sum, g, i) => sum + g.models - (state[i * 2] ?? 0), 0);
    dist[killed] = (dist[killed] ?? 0) + p;
  }
  let sum = 0;
  for (let n = 0; n < dist.length; n += 1) {
    sum += dist[n] ?? 0;
    if (sum >= 0.5 - 1e-9) return n;
  }
  return Math.max(0, dist.length - 1);
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
  const characters = indices.filter((i) => defender.groups[i]?.character === true);
  const candidates = allocationOrders(defender.groups);
  const breakdown: WeaponStep[] = [];
  const lostOf = (v: Vector) => {
    let total = 0;
    for (const [id, p] of v) total += p * woundsOf(space.state(id), defender);
    return total;
  };
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
      parts: { mass: number; setup: WeaponSetup; averages: PoolAverages }[];
      score: [number, number];
    } | null = null;
    // Invulnerable saves that only work against the other kind of attack don't count for this one.
    const facing = { ...calculation, defender: defenderFacing(defender, weapon) };
    for (const priority of candidates) {
      const result = resolveWeapon(space, vector, weapon, facing, priority, oneDie, prepared);
      let wounds = 0;
      for (const [id, p] of result.vector) wounds += p * woundsOf(space.state(id), defender);
      const score: [number, number] = [slainOf(space, result.vector, defender), wounds];
      const better =
        best === null ||
        score[0] < best.score[0] - 1e-12 ||
        (Math.abs(score[0] - best.score[0]) <= 1e-12 && score[1] < best.score[1] - 1e-12);
      if (better) {
        best = {
          priority,
          vector: result.vector,
          wasted: result.wasted,
          parts: result.parts,
          score,
        };
      }
    }
    if (best === null) continue;
    const before = {
      slain: slainOf(space, vector, defender),
      median: medianSlainOf(space, vector, defender),
      wounds: lostOf(vector),
    };
    const damage = lostOf(best.vector) - before.wounds;
    vector = best.vector;
    wasted += best.wasted;
    orders.push(best.priority);
    breakdown.push({
      ...stepOf(weapon, facing.defender, best.priority, best.parts),
      damage,
      wasted: best.wasted,
      slain: slainOf(space, vector, defender) - before.slain,
      slainMedian: medianSlainOf(space, vector, defender) - before.median,
    });
  }
  if (calculation.flatMortals !== null) {
    // Each mortal wound is one wound lost (Feel No Pain applies), to the mortal-wound model.
    const one: DamageModel = { raw: point(1), reroll: false, oneDie: false, final: () => 1 };
    const mortal: Allocation = {
      groups: defender.groups,
      priority: orders.at(-1) ?? candidates[0] ?? [],
      precision: false,
    };
    const before = {
      slain: slainOf(space, vector, defender),
      median: medianSlainOf(space, vector, defender),
      wounds: lostOf(vector),
    };
    const result = repeat(vector, hitStep(space, mortal, one, null), dice(calculation.flatMortals));
    vector = result.vector;
    wasted += result.wasted;
    breakdown.push({
      name: 'Mortal wounds',
      attacks: 0,
      hits: 0,
      critHits: 0,
      sustainedHits: 0,
      lethalHits: 0,
      wounds: 0,
      critWounds: 0,
      devastating: 0,
      unsaved: 0,
      unsavedExact: true,
      damage: lostOf(vector) - before.wounds,
      wasted: result.wasted,
      slain: slainOf(space, vector, defender) - before.slain,
      slainMedian: medianSlainOf(space, vector, defender) - before.median,
    });
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
    breakdown,
  };
}
