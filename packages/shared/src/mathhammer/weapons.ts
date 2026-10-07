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
