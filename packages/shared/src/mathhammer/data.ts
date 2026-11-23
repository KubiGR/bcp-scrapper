import { z } from 'zod';

/** One profile of a weapon, as 39k.pro gives it (numbers already read). */
export const UnitProfileSchema = z.object({
  name: z.string(),
  melee: z.boolean(),
  range: z.string().nullable(),
  attacks: z.string(),
  /** BS/WS: 3 for 3+; null for "-" (Torrent weapons and the like). */
  skill: z.number().int().nullable(),
  /** null when it isn't a plain number (e.g. "D6+6"). */
  strength: z.number().int().nullable(),
  ap: z.number().int(),
  damage: z.string(),
  /** Weapon ability names as written: "Sustained Hits 2", "ANTI-INFANTRY 4+", "Blast". */
  keywords: z.array(z.string()),
});
export type UnitProfile = z.infer<typeof UnitProfileSchema>;

export const UnitWeaponSchema = z.object({
  id: z.string(),
  name: z.string(),
  profiles: z.array(UnitProfileSchema),
});
export type UnitWeapon = z.infer<typeof UnitWeaponSchema>;

/** A kind of model in the unit. */
export const UnitModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  toughness: z.number().int(),
  /** 7 for no save. */
  save: z.number().int(),
  invuln: z.number().int().nullable(),
  /** Data read before this was known has none: those invulnerable saves work against all attacks. */
  invulnAgainst: z.enum(['all', 'ranged', 'melee']).default('all'),
  wounds: z.number().int(),
});
export type UnitModel = z.infer<typeof UnitModelSchema>;

/** One way to field the unit: how many of each kind of model. */
export const UnitSizeSchema = z.object({
  points: z.number().nullable(),
  models: z.array(z.object({ modelId: z.string(), count: z.number().int() })),
});
export type UnitSize = z.infer<typeof UnitSizeSchema>;

export const UnitDatasheetSchema = z.object({
  id: z.string(),
  name: z.string(),
  legends: z.boolean(),
  /** The app's faction names. */
  factions: z.array(z.string()),
  /** All its models' keywords, upper-case. */
  keywords: z.array(z.string()),
  models: z.array(UnitModelSchema),
  /** Smallest first. */
  sizes: z.array(UnitSizeSchema),
  /** Default wargear: each model of `modelId` carries `count` of `weaponId`. */
  loadout: z.array(
    z.object({ modelId: z.string(), weaponId: z.string(), count: z.number().int() }),
  ),
  weapons: z.array(UnitWeaponSchema),
  /** Wargear that isn't a weapon (Relic Shield, Vexilla): known, never "couldn't read". */
  wargear: z.array(z.string()),
  fnp: z.number().int().nullable(),
  /**
   * Feel No Pain against psychic attacks only, and whether it covers the whole unit (a leader's
   * "models in that unit") or only this model. Data read before this was known has none.
   */
  fnpPsychic: z
    .object({ value: z.number().int(), wholeUnit: z.boolean() })
    .nullable()
    .default(null),
  stealth: z.boolean(),
  /** An ability subtracting from (or halving) the Damage of attacks allocated to its models. */
  damageReduction: z
    .object({ ability: z.string(), minus: z.number().int(), halve: z.boolean() })
    .nullable(),
  /** Damaged X: the model is damaged at X or fewer wounds left. */
  damaged: z.number().int().nullable(),
  /** The datasheet's own abilities (for reading, step 3). */
  abilities: z.array(z.object({ name: z.string(), text: z.string() })),
  /** Datasheet ids this character can lead / support. */
  leads: z.array(z.string()),
  supports: z.array(z.string()),
});
export type UnitDatasheet = z.infer<typeof UnitDatasheetSchema>;

/** A 39k.pro faction keyword with the app's faction name; chapters name their parent. */
export const RulesFactionSchema = z.object({
  name: z.string(),
  faction: z.string(),
  parent: z.string().nullable(),
});
export type RulesFaction = z.infer<typeof RulesFactionSchema>;

/** Everything Mathhammer uses from 39k.pro, in English. */
export const UnitDataSchema = z.object({
  factions: z.array(RulesFactionSchema),
  datasheets: z.array(UnitDatasheetSchema),
});
export type UnitData = z.infer<typeof UnitDataSchema>;

export const MatchedGroupSchema = z.object({
  /** The datasheet model kind; null only when the datasheet has none. */
  modelId: z.string().nullable(),
  models: z.number().int(),
  weapons: z.array(z.object({ weaponId: z.string(), count: z.number().int() })),
});
export const MatchedUnitSchema = z.object({
  /** As written, with the model count: "Custodian Wardens ×5". */
  label: z.string(),
  name: z.string(),
  datasheetId: z.string().nullable(),
  groups: z.array(MatchedGroupSchema),
  attachedTo: z.number().int().nullable(),
  /** Wargear (or the unit) not found in the data. */
  unread: z.array(z.string()),
});
/** POST /api/mathhammer/list, GET /api/mathhammer/lists/:playerId. */
export const MathhammerListSchema = z.object({
  army: z.string().nullable(),
  units: z.array(MatchedUnitSchema),
  /** The datasheets the units use. */
  datasheets: z.array(UnitDatasheetSchema),
});
export type MatchedGroup = z.infer<typeof MatchedGroupSchema>;
export type MatchedUnit = z.infer<typeof MatchedUnitSchema>;
export type MathhammerList = z.infer<typeof MathhammerListSchema>;

/** GET /api/mathhammer/lists?search=: stored lists by player or event. */
export const StoredListSchema = z.object({
  playerId: z.string(),
  player: z.string(),
  event: z.string(),
  faction: z.string().nullable(),
  date: z.iso.datetime(),
});
export const MathhammerListsSchema = z.object({ lists: z.array(StoredListSchema) });
export type StoredList = z.infer<typeof StoredListSchema>;

/** GET /api/rules: the data read from 39k.pro, when, and the last check's error. */
export const RulesStatusSchema = z.object({
  checkedAt: z.iso.datetime().nullable(),
  readAt: z.iso.datetime().nullable(),
  bundle: z.string().nullable(),
  dataVersion: z.number().int().nullable(),
  counts: z
    .object({ factions: z.number().int(), datasheets: z.number().int(), weapons: z.number().int() })
    .nullable(),
  error: z.string().nullable(),
});
export type RulesStatus = z.infer<typeof RulesStatusSchema>;

/** GET /api/mathhammer/factions. */
export const MathhammerFactionsSchema = z.object({
  factions: z.array(z.object({ faction: z.string(), units: z.number().int() })),
});
export type MathhammerFactions = z.infer<typeof MathhammerFactionsSchema>;

/** GET /api/mathhammer/units?faction=: the faction's datasheets (its chapters' and parent's too). */
export const MathhammerUnitsSchema = z.object({
  faction: z.string(),
  datasheets: z.array(UnitDatasheetSchema),
});
export type MathhammerUnits = z.infer<typeof MathhammerUnitsSchema>;

/**
 * GW-app rules text as plain text: `<k>keyword</k>` becomes `**KEYWORD**`, other tags go,
 * carriage returns and non-breaking spaces become plain.
 */
export function cleanRulesText(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';
  return text
    .replace(/\r/g, '')
    .replace(/<k>(.*?)<\/k>/gs, (_, keyword: string) => `**${keyword.toUpperCase()}**`)
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

/**
 * The faction family: the faction, its parent (a chapter's Space Marines) and its children (Space
 * Marines' chapters). Lists write Space Wolves armies as "Space Marines", so units of all of them
 * are offered together.
 */
export function factionFamily(faction: string, factions: RulesFaction[]): string[] {
  const family = new Set([faction]);
  for (const f of factions) {
    if (f.faction === faction && f.parent !== null) family.add(f.parent);
    if (f.parent === faction) family.add(f.faction);
  }
  return [...family].sort();
}
