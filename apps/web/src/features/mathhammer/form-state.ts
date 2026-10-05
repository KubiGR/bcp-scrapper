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
