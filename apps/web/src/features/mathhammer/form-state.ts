import {
  buildWeapon,
  DEFAULT_MODS,
  parseAnti,
  parseDice,
  readKeywords,
  type Calculation,
  type Situation,
  type UnitProfile,
  type WeaponKeywords,
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
  /** A datasheet weapon's profiles (empty when typed by hand). */
  profiles: UnitProfile[];
  /** The profile used: its index, or 'best' (the one that slays most against the target). */
  profile: number | 'best';
  /** The chosen profile's ability names from the datasheet, read against the target. */
  keywordNames: string[];
  /** The weapon's own switches instead of the unit's; null to use the unit's. */
  own: WeaponMods | null;
  /** The unit (or attached character) carrying it; "" when typed by hand. */
  owner: string;
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
  /** The datasheet it was filled from, for the "from datasheet" line; null when typed. */
  source: string | null;
  groups: GroupRow[];
  /** Comma-separated, for Anti-X. */
  keywords: string;
  attached: boolean;
  stealth: boolean;
  hitModifier: number;
  woundModifier: number;
  damageReduction: number;
  halveDamage: boolean;
  /** Where a picked datasheet's damage reduction came from (shown, never calculated). */
  damageNote: string | null;
  savePenaltiesIgnored: boolean;
}

export interface MathhammerForm {
  /** The datasheet the attacker was filled from; null when typed. */
  source: string | null;
  /** Shooting counts ranged weapons, Fighting melee ones. */
  phase: 'shooting' | 'fighting';
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
  profiles: [],
  profile: 0,
  keywordNames: [],
  own: null,
  owner: '',
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
    source: null,
    phase: 'shooting',
    weapons: [{ ...newWeapon(), name: 'Bolt rifle', models: 5, attacks: '2', ap: -1, heavy: true }],
    unit: DEFAULT_MODS,
    defender: {
      source: null,
      groups: [{ ...newGroup(), name: 'Boyz', models: 10, toughness: 5, save: 5 }],
      keywords: 'INFANTRY, ORKS',
      attached: false,
      stealth: false,
      hitModifier: 0,
      woundModifier: 0,
      damageReduction: 0,
      halveDamage: false,
      damageNote: null,
      savePenaltiesIgnored: false,
    },
    situation: NO_SITUATION,
    flatMortals: '',
  };
}

const optional = (text: string) => (text.trim() === '' ? null : text.trim());

/** The form as an engine calculation, or what can't be read in it. */
const CLOSE_QUARTERS = /^(close-quarters|pistol)$/i;

/** Indices of a Best row's profiles usable in this phase (melee when fighting, else ranged). */
export function phaseProfiles(row: WeaponRow, phase: MathhammerForm['phase']): number[] {
  return row.profiles.flatMap((p, i) => (p.melee === (phase === 'fighting') ? [i] : []));
}

const choosing = (row: WeaponRow) => row.profile === 'best' && row.profiles.length > 0;

/** Whether the row can attack in this phase: a Best row if any profile fits, else its own. */
const fits = (row: WeaponRow, phase: MathhammerForm['phase']) =>
  choosing(row) ? phaseProfiles(row, phase).length > 0 : row.melee === (phase === 'fighting');

const isCloseQuarters = (names: string[]) => names.some((k) => CLOSE_QUARTERS.test(k.trim()));

/** A shooting row's close-quarters (pistol) status, from its usable profiles when Best. */
const closeQuarters = (row: WeaponRow) =>
  choosing(row)
    ? row.profiles.filter((p) => !p.melee).some((p) => isCloseQuarters(p.keywords))
    : isCloseQuarters(row.keywordNames);

/**
 * Why a weapon sits out this phase, or null when it attacks: Shooting uses ranged weapons and
 * Fighting melee ones; a datasheet's close-quarters weapons (pistols) sit out while the same unit
 * has other ranged weapons, as each model fires one or the other.
 */
export function sitsOut(form: MathhammerForm, row: WeaponRow): string | null {
  if (!fits(row, form.phase)) {
    return form.phase === 'fighting' ? 'Not used when fighting' : 'Not used when shooting';
  }
  if (form.phase === 'fighting' || !closeQuarters(row)) return null;
  const others = form.weapons.some(
    (w) =>
      w !== row &&
      w.owner === row.owner &&
      w.models > 0 &&
      fits(w, 'shooting') &&
      !closeQuarters(w),
  );
  return others ? 'Not used: the models fire their other guns' : null;
}

/**
 * A row's profile values: its own fields, or for 'best' the profile being tried (only profiles
 * usable in this phase; the first of them unless `chosen` names another).
 */
function statsOf(
  row: WeaponRow,
  chosen: number | undefined,
  phase: MathhammerForm['phase'],
): WeaponRow {
  if (!choosing(row)) return row;
  const usable = phaseProfiles(row, phase);
  const index = chosen !== undefined && usable.includes(chosen) ? chosen : usable[0];
  const p = index === undefined ? undefined : row.profiles[index];
  if (p === undefined) return row;
  return {
    ...row,
    melee: p.melee,
    attacks: p.attacks,
    skill: p.skill,
    strength: p.strength ?? row.strength,
    ap: p.ap,
    damage: p.damage,
    keywordNames: p.keywords,
  };
}

const merge = (typed: WeaponKeywords, read: WeaponKeywords): WeaponKeywords => ({
  torrent: typed.torrent || read.torrent,
  lethalHits: typed.lethalHits || read.lethalHits,
  sustainedHits: typed.sustainedHits ?? read.sustainedHits,
  devastatingWounds: typed.devastatingWounds || read.devastatingWounds,
  twinLinked: typed.twinLinked || read.twinLinked,
  heavy: typed.heavy || read.heavy,
  lance: typed.lance || read.lance,
  ignoresCover: typed.ignoresCover || read.ignoresCover,
  precision: typed.precision || read.precision,
  indirectFire: typed.indirectFire || read.indirectFire,
  anti: [...typed.anti, ...read.anti],
  rapidFire: typed.rapidFire ?? read.rapidFire,
  blast: typed.blast ?? read.blast,
  cleave: typed.cleave ?? read.cleave,
  melta: typed.melta ?? read.melta,
});

/** The defender's keywords, upper-case, from the comma-separated field. */
export const targetKeywordsOf = (defender: DefenderForm) =>
  defender.keywords
    .split(',')
    .map((k) => k.trim().toUpperCase())
    .filter((k) => k !== '');

/**
 * The form as an engine calculation, or what can't be read in it. `chosen` gives the profile
 * tried for each 'best' row (by row key; the first profile otherwise).
 */
export function toCalculation(
  form: MathhammerForm,
  chosen: Record<string, number> = {},
): { calculation: Calculation } | { error: string } {
  const targetKeywords = targetKeywordsOf(form.defender);
  const problems: string[] = [];
  const dice = (label: string, text: string) => {
    if (parseDice(text) === null)
      problems.push(`${label}: can’t read “${text}” (use 3, D6, 2D6, D6+3…)`);
  };
  const weapons = form.weapons
    .filter((typed) => sitsOut(form, typed) === null)
    .map((typed) => {
      const row = statsOf(typed, chosen[typed.key], form.phase);
      dice(`${row.name} attacks`, row.attacks);
      dice(`${row.name} damage`, row.damage);
      if (optional(row.sustainedHits) !== null)
        dice(`${row.name} Sustained Hits`, row.sustainedHits);
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
        merge(
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
          readKeywords(row.keywordNames, targetKeywords),
        ),
        row.own ?? form.unit,
      );
    });
  if (form.unit.sustainedHits !== null) dice('Sustained Hits', form.unit.sustainedHits);
  const flatMortals = optional(form.flatMortals);
  if (flatMortals !== null) dice('Mortal wounds', flatMortals);
  if (form.defender.groups.length === 0)
    problems.push('Add at least one kind of model to the target');
  if (problems.length > 0) return { error: problems.join(' · ') };
  const d = form.defender;
  return {
    calculation: {
      weapons,
      defender: {
        groups: d.groups.map(({ key: _key, ...group }) => group),
        keywords: targetKeywords,
        attached: d.attached,
        stealth: d.stealth,
        hitModifier: d.hitModifier,
        woundModifier: d.woundModifier,
        damageReduction: d.damageReduction,
        halveDamage: d.halveDamage,
        savePenaltiesIgnored: d.savePenaltiesIgnored,
      },
      situation: form.situation,
      flatMortals,
    },
  };
}
