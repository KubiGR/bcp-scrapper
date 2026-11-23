import { fnpAgainst, invulnAgainst } from './allocate';
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

/** ±1 cap on the summed modifiers; ignoring penalties leaves the negative ones out first. */
const cap = (mods: number[], ignore: boolean) => {
  let total = 0;
  for (const m of mods) if (!(ignore && m < 0)) total += m;
  return Math.max(-1, Math.min(1, total));
};

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
    const lose = (g: number, points: number, psychic: boolean) => {
      const group = groups[g];
      if (group === undefined) return;
      const fnp = fnpAgainst(group, { psychic });
      let lost = 0;
      for (let i = 0; i < points; i += 1) {
        if (fnp === null || d6() < fnp) lost += 1;
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
        // A wiped-out target still takes the volley (all of it wasted), as the first allocated.
        const first = groups[priority[0] ?? 0];
        const bodyguard = live.filter((g) => groups[g]?.character !== true);
        const tPool = defender.attached && bodyguard.length > 0 ? bodyguard : live;
        const toughness =
          live.length === 0
            ? (first?.toughness ?? 0)
            : Math.max(...tPool.map((g) => groups[g]?.toughness ?? 0));
        const models = live.reduce((sum, g) => sum + (alive[g] ?? 0), 0);
        const useHitOneDie = hitOneDie && m.hitRerollOneDie;
        const useWoundOneDie = woundOneDie && m.woundRerollOneDie;
        if (useHitOneDie) hitOneDie = false;
        if (useWoundOneDie) woundOneDie = false;

        // Attacks.
        let attacks = 0;
        const fives = Math.floor(models / 5);
        for (let i = 0; i < weapon.models; i += 1) {
          const rolled = rollExpr(weapon.attacks, d6);
          attacks += m.attacksModifier === 0 ? rolled : Math.max(1, rolled + m.attacksModifier);
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
        const skillModifier = weapon.psychic ? Math.max(0, m.skillModifier) : m.skillModifier;
        const skill = Math.min(
          6,
          Math.max(
            2,
            (weapon.skill === null ? 6 : Math.min(6, Math.max(2, weapon.skill - skillModifier))) +
              (cover && !weapon.psychic ? 1 : 0) -
              (ranged && situation.plungingFire ? 1 : 0),
          ),
        );
        const hitMod = cap(
          [
            m.hitModifier,
            weapon.heavy && ranged && !situation.movedOver3 ? 1 : 0,
            situation.attackerDamaged ? -1 : 0,
            defender.hitModifier,
          ],
          m.hitIgnorePenalties || weapon.psychic,
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
        const strength = Math.max(1, weapon.strength + m.strengthModifier);
        const need =
          strength >= sv * 2
            ? 2
            : strength > sv
              ? 3
              : strength === sv
                ? 4
                : strength * 2 <= sv
                  ? 6
                  : 5;
        const woundMod = cap(
          [m.woundModifier, weapon.lance && situation.charged ? 1 : 0, defender.woundModifier],
          m.woundIgnorePenalties,
        );
        const kws = new Set(defender.keywords.map((k) => k.toUpperCase()));
        const critOn = Math.min(
          m.critWoundOn,
          ...weapon.anti
            .filter((a) => a.keyword === '*' || kws.has(a.keyword.toUpperCase()))
            .map((a) => a.value),
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
            const group = g < 0 ? first : groups[g];
            if (group === undefined) return;
            const invuln = invulnAgainst(group, weapon);
            const ok =
              f !== 1 && ((invuln !== null && f >= invuln) || f + ap - saveMod >= group.save);
            if (ok) continue;
            if (g < 0) wasted += damageRoll(weapon, extraDamage, false);
            else lose(g, damageRoll(weapon, extraDamage, false), weapon.psychic);
          }
        };
        if (special && !m.devastatingWounds) savePool(crits, apOf(m.critAp), m.critDamage);
        savePool(normal, apOf(0), 0);
        if (m.devastatingWounds) {
          for (let i = 0; i < crits; i += 1) {
            const g = pick(priority, false);
            if (g < 0) wasted += damageRoll(weapon, m.critDamage, true);
            else lose(g, damageRoll(weapon, m.critDamage, true), weapon.psychic);
          }
        }
      });

    if (calc.flatMortals !== null) {
      const count = rollExpr(calc.flatMortals, d6);
      const priority = orders.at(-1) ?? groups.map((_, i) => i);
      for (let i = 0; i < count; i += 1) {
        const g = pick(priority, false);
        if (g < 0) wasted += 1;
        else lose(g, 1, false);
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
