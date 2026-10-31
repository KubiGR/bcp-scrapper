import {
  DEFAULT_MODS,
  type Calculation,
  type Defender,
  type DefenderGroup,
  type Situation,
  type Weapon,
  type WeaponMods,
} from './types';

/** Test builders: plain values with only what a test changes written out. */
export const SITUATION: Situation = {
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

export const weapon = (
  w: Partial<Omit<Weapon, 'mods'>> & { mods?: Partial<WeaponMods> } = {},
): Weapon => ({
  name: 'Gun',
  models: 1,
  melee: false,
  attacks: '1',
  skill: 3,
  strength: 4,
  ap: 0,
  damage: '1',
  heavy: false,
  lance: false,
  precision: false,
  indirectFire: false,
  anti: [],
  rapidFire: null,
  blast: null,
  cleave: null,
  melta: null,
  ...w,
  mods: { ...DEFAULT_MODS, ...(w.mods ?? {}) },
});

export const group = (g: Partial<DefenderGroup> = {}): DefenderGroup => ({
  name: 'Troops',
  models: 10,
  toughness: 4,
  save: 3,
  invuln: null,
  invulnAgainst: 'all',
  wounds: 1,
  fnp: null,
  character: false,
  ...g,
});

export const defender = (d: Partial<Defender> = {}): Defender => ({
  groups: [group()],
  keywords: [],
  attached: false,
  stealth: false,
  hitModifier: 0,
  woundModifier: 0,
  damageReduction: 0,
  halveDamage: false,
  savePenaltiesIgnored: false,
  ...d,
});

export const calc = (c: Partial<Calculation> = {}): Calculation => ({
  weapons: [weapon()],
  defender: defender(),
  situation: SITUATION,
  flatMortals: null,
  ...c,
});

/** 100 one-wound models with no save (Sv 7+): wounds dealt then measure hits × wounds alone. */
export const crowd = defender({ groups: [group({ models: 100, save: 7 })] });
