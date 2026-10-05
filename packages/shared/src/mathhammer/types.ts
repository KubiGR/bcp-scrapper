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
