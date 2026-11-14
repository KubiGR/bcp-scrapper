/** A JavaScript literal with bare keys and `!0`/`!1`, as 39k.pro's minified script writes data. */
export function toJsLiteral(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(toJsLiteral).join(',')}]`;
  if (value === true) return '!0';
  if (value === false) return '!1';
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(
      ([key, item]) =>
        `${/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}:${toJsLiteral(item)}`,
    );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

const loc = (en: Record<string, unknown>) => ({ localisations: { en, de: { name: 'Deutsch' } } });

const model = (
  id: string,
  datasheetId: string,
  name: string,
  stats: { t: string; sv: string; w: string },
  extra: Record<string, unknown> = {},
) => ({
  id,
  datasheetId,
  displayOrder: 0,
  statlineHidden: false,
  movement: '6"',
  toughness: stats.t,
  save: stats.sv,
  wounds: stats.w,
  leadership: '6+',
  objectiveControl: '2',
  ...extra,
  ...loc({ name }),
});

const profile = (
  id: string,
  itemId: string,
  name: string,
  p: { type: string; a: string; skill: string; s: string; ap: string; d: string },
  order = 0,
) => ({
  id,
  wargearItemId: itemId,
  displayOrder: order,
  type: p.type,
  range: p.type === 'melee' ? 'Melee' : '24"',
  attacks: p.a,
  ballisticSkill: p.type === 'melee' ? null : p.skill,
  weaponSkill: p.type === 'melee' ? p.skill : null,
  strength: p.s,
  armourPenetration: p.ap,
  damage: p.d,
  ...loc({ name }),
});

/** A tiny copy of 39k.pro's tables: Intercessors with a Captain, Boyz with a Warboss. */
export const sampleTables = (): Record<string, unknown[]> => ({
  publication: [
    { id: 'pub-sm', factionKeywordId: 'fk-sm', isCoreRules: false, isCombatPatrol: false },
    { id: 'pub-ork', factionKeywordId: 'fk-ork', isCoreRules: false, isCombatPatrol: false },
    { id: 'pub-cp', factionKeywordId: 'fk-sm', isCoreRules: false, isCombatPatrol: true },
  ],
  faction_keyword: [
    {
      id: 'fk-sm',
      parentFactionKeywordId: null,
      excludedFromArmyBuilder: false,
      ...loc({ name: 'Adeptus Astartes', commonName: 'Space Marines' }),
    },
    {
      id: 'fk-ba',
      parentFactionKeywordId: 'fk-sm',
      excludedFromArmyBuilder: false,
      ...loc({ name: 'Blood Angels', commonName: null }),
    },
    {
      id: 'fk-ork',
      parentFactionKeywordId: null,
      excludedFromArmyBuilder: false,
      ...loc({ name: 'Orks', commonName: null }),
    },
  ],
  datasheet: [
    {
      id: 'ds-int',
      publicationId: 'pub-sm',
      isLegends: false,
      ...loc({ name: 'Intercessor Squad' }),
    },
    { id: 'ds-cap', publicationId: 'pub-sm', isLegends: false, ...loc({ name: 'Captain' }) },
    { id: 'ds-boyz', publicationId: 'pub-ork', isLegends: false, ...loc({ name: 'Boyz' }) },
    { id: 'ds-boss', publicationId: 'pub-ork', isLegends: false, ...loc({ name: 'Warboss' }) },
    { id: 'ds-grot', publicationId: 'pub-ork', isLegends: false, ...loc({ name: 'Gretchin' }) },
    { id: 'ds-cp', publicationId: 'pub-cp', isLegends: false, ...loc({ name: 'Patrol Squad' }) },
  ],
  // Gladius for Space Marines and Blood Angels, Liberator for Blood Angels only; a patrol one left out.
  detachment: [
    { id: 'det-gladius', publicationId: 'pub-sm', ...loc({ name: 'Gladius Task Force' }) },
    { id: 'det-lib', publicationId: 'pub-sm', ...loc({ name: 'Liberator Assault Group' }) },
    { id: 'det-horde', publicationId: 'pub-ork', ...loc({ name: 'War Horde' }) },
    { id: 'det-cp', publicationId: 'pub-cp', ...loc({ name: 'Patrol Detachment' }) },
  ],
  detachment_faction_keyword: [
    { detachmentId: 'det-gladius', factionKeywordId: 'fk-sm' },
    { detachmentId: 'det-gladius', factionKeywordId: 'fk-ba' },
    { detachmentId: 'det-lib', factionKeywordId: 'fk-ba' },
    { detachmentId: 'det-horde', factionKeywordId: 'fk-ork' },
    { detachmentId: 'det-cp', factionKeywordId: 'fk-sm' },
  ],
  datasheet_faction_keyword: [
    { datasheetId: 'ds-int', factionKeywordId: 'fk-sm' },
    { datasheetId: 'ds-cap', factionKeywordId: 'fk-sm' },
    { datasheetId: 'ds-boyz', factionKeywordId: 'fk-ork' },
    { datasheetId: 'ds-boss', factionKeywordId: 'fk-ork' },
    { datasheetId: 'ds-grot', factionKeywordId: 'fk-ork' },
    { datasheetId: 'ds-cp', factionKeywordId: 'fk-sm' },
  ],
  miniature: [
    model('m-int', 'ds-int', 'Intercessor', { t: '4', sv: '3+', w: '2' }),
    model(
      'm-sgt',
      'ds-int',
      'Intercessor Sergeant',
      { t: '4', sv: '3+', w: '2' },
      { statlineHidden: true, displayOrder: 1 },
    ),
    model('m-cap', 'ds-cap', 'Captain', { t: '4', sv: '3+', w: '5' }),
    model('m-boy', 'ds-boyz', 'Boy', { t: '5', sv: '5+', w: '1' }),
    model('m-nob', 'ds-boyz', 'Nob', { t: '5', sv: '5+', w: '2' }, { displayOrder: 1 }),
    model('m-boss', 'ds-boss', 'Warboss', { t: '6', sv: '4+', w: '6' }),
    model('m-grot', 'ds-grot', 'Gretchin', { t: '2', sv: '7+', w: '1' }),
    model('m-cp', 'ds-cp', 'Patroller', { t: '4', sv: '3+', w: '2' }),
  ],
  miniature_keyword: [
    { miniatureId: 'm-int', keywordId: 'kw-inf', displayOrder: 1 },
    { miniatureId: 'm-int', keywordId: 'kw-tac', displayOrder: 2 },
    { miniatureId: 'm-sgt', keywordId: 'kw-inf', displayOrder: 1 },
    { miniatureId: 'm-cap', keywordId: 'kw-char', displayOrder: 1 },
    { miniatureId: 'm-cap', keywordId: 'kw-inf', displayOrder: 2 },
    { miniatureId: 'm-boy', keywordId: 'kw-inf', displayOrder: 1 },
    { miniatureId: 'm-boy', keywordId: 'kw-mob', displayOrder: 2 },
    { miniatureId: 'm-boss', keywordId: 'kw-char', displayOrder: 1 },
    { miniatureId: 'm-grot', keywordId: 'kw-inf', displayOrder: 1 },
  ],
  keyword: [
    { id: 'kw-inf', ...loc({ name: 'Infantry' }) },
    { id: 'kw-tac', ...loc({ name: 'Tacticus' }) },
    { id: 'kw-char', ...loc({ name: 'Character' }) },
    { id: 'kw-mob', ...loc({ name: 'Mob' }) },
  ],
  invulnerable_save: [
    { datasheetId: 'ds-cap', miniatureId: null, save: '4+' },
    { datasheetId: 'ds-boss', miniatureId: 'm-boss', save: '5+' },
  ],
  datasheet_ability: [
    { id: 'ab-fnp', abilityType: 'core', ...loc({ name: 'Feel No Pain 6+', rules: 'x' }) },
    { id: 'ab-stealth', abilityType: 'core', ...loc({ name: 'Stealth', rules: 'x' }) },
    { id: 'ab-damaged', abilityType: 'core', ...loc({ name: 'Damaged 3', rules: 'x' }) },
    { id: 'ab-oath', abilityType: 'faction', ...loc({ name: 'Oath of Moment', rules: 'x' }) },
    {
      id: 'ab-bolter',
      abilityType: 'datasheet',
      ...loc({ name: 'Bolter Discipline', rules: 'Re-roll a hit roll of <b>1</b>.' }),
    },
    {
      id: 'ab-necro',
      abilityType: 'datasheet',
      ...loc({
        name: 'Necrodermis',
        rules:
          'Each time an attack is allocated to this model, subtract 1 from the Damage characteristic of that attack.',
      }),
    },
    {
      id: 'ab-halve',
      abilityType: 'datasheet',
      ...loc({
        name: 'Formidably Resilient',
        rules:
          'Each time an attack is allocated to this model, halve the Damage characteristic of that attack.',
      }),
    },
  ],
  datasheet_datasheet_ability: [
    { datasheetId: 'ds-int', datasheetAbilityId: 'ab-bolter', displayOrder: 1 },
    { datasheetId: 'ds-int', datasheetAbilityId: 'ab-oath', displayOrder: 2 },
    { datasheetId: 'ds-boyz', datasheetAbilityId: 'ab-stealth', displayOrder: 1 },
    { datasheetId: 'ds-boss', datasheetAbilityId: 'ab-fnp', displayOrder: 1 },
    { datasheetId: 'ds-boss', datasheetAbilityId: 'ab-damaged', displayOrder: 2 },
    { datasheetId: 'ds-boss', datasheetAbilityId: 'ab-necro', displayOrder: 3 },
    { datasheetId: 'ds-cap', datasheetAbilityId: 'ab-halve', displayOrder: 1 },
  ],
  wargear_item: [
    { id: 'wi-br', wargearType: 'weapon', ...loc({ name: 'Bolt rifle' }) },
    { id: 'wi-pi', wargearType: 'weapon', ...loc({ name: 'Plasma incinerator' }) },
    { id: 'wi-ch', wargearType: 'weapon', ...loc({ name: 'Choppa' }) },
    { id: 'wi-sl', wargearType: 'weapon', ...loc({ name: 'Slugga' }) },
    { id: 'wi-kl', wargearType: 'weapon', ...loc({ name: 'Power klaw' }) },
    { id: 'wi-shield', wargearType: 'wargear', ...loc({ name: 'Relic Shield' }) },
  ],
  wargear_item_profile: [
    profile('wp-br', 'wi-br', 'Bolt rifle', {
      type: 'ranged',
      a: '2',
      skill: '3+',
      s: '4',
      ap: '-1',
      d: '1',
    }),
    profile('wp-pi1', 'wi-pi', 'Standard', {
      type: 'ranged',
      a: '2',
      skill: '3+',
      s: '7',
      ap: '-2',
      d: '1',
    }),
    profile(
      'wp-pi2',
      'wi-pi',
      'Supercharge',
      { type: 'ranged', a: '2', skill: '3+', s: '8', ap: '-3', d: '2' },
      1,
    ),
    profile('wp-ch', 'wi-ch', 'Choppa', {
      type: 'melee',
      a: '3',
      skill: '3+',
      s: '4',
      ap: '-1',
      d: '1',
    }),
    profile('wp-sl', 'wi-sl', 'Slugga', {
      type: 'ranged',
      a: '1',
      skill: '5+',
      s: '4',
      ap: '0',
      d: '1',
    }),
    profile('wp-kl', 'wi-kl', 'Power klaw', {
      type: 'melee',
      a: '3',
      skill: '4+',
      s: '9',
      ap: '-2',
      d: '2',
    }),
  ],
  wargear_ability: [
    { id: 'wa-rf', ...loc({ name: 'Rapid Fire 1' }) },
    { id: 'wa-haz', ...loc({ name: 'Hazardous' }) },
    { id: 'wa-lh', ...loc({ name: 'LETHAL HITS: non-MONSTER/VEHICLE' }) },
  ],
  wargear_item_profile_wargear_ability: [
    { wargearItemProfileId: 'wp-br', wargearAbilityId: 'wa-rf', displayOrder: 1 },
    { wargearItemProfileId: 'wp-pi2', wargearAbilityId: 'wa-haz', displayOrder: 1 },
    { wargearItemProfileId: 'wp-sl', wargearAbilityId: 'wa-lh', displayOrder: 1 },
  ],
  wargear_option_group: [
    { id: 'g-int', datasheetId: 'ds-int' },
    { id: 'g-cap', datasheetId: 'ds-cap' },
    { id: 'g-boyz', datasheetId: 'ds-boyz' },
  ],
  wargear_option: [
    { id: 'o-br', wargearOptionGroupId: 'g-int', wargearItemId: 'wi-br' },
    { id: 'o-pi', wargearOptionGroupId: 'g-int', wargearItemId: 'wi-pi' },
    { id: 'o-cap-br', wargearOptionGroupId: 'g-cap', wargearItemId: 'wi-br' },
    { id: 'o-shield', wargearOptionGroupId: 'g-cap', wargearItemId: 'wi-shield' },
    { id: 'o-ch', wargearOptionGroupId: 'g-boyz', wargearItemId: 'wi-ch' },
    { id: 'o-sl', wargearOptionGroupId: 'g-boyz', wargearItemId: 'wi-sl' },
    { id: 'o-kl', wargearOptionGroupId: 'g-boyz', wargearItemId: 'wi-kl' },
  ],
  unit_composition: [
    { id: 'uc-int10', datasheetId: 'ds-int', isDefault: false, points: 160, displayOrder: 1 },
    { id: 'uc-int5', datasheetId: 'ds-int', isDefault: true, points: 80, displayOrder: 0 },
    { id: 'uc-cap', datasheetId: 'ds-cap', isDefault: true, points: 80, displayOrder: 0 },
    { id: 'uc-boyz', datasheetId: 'ds-boyz', isDefault: true, points: 85, displayOrder: 0 },
    { id: 'uc-boss', datasheetId: 'ds-boss', isDefault: true, points: 75, displayOrder: 0 },
  ],
  unit_composition_miniature: [
    { unitCompositionId: 'uc-int5', miniatureId: 'm-int', min: 4, max: 4 },
    { unitCompositionId: 'uc-int5', miniatureId: 'm-sgt', min: 1, max: 1 },
    { unitCompositionId: 'uc-int10', miniatureId: 'm-sgt', min: 1, max: 1 },
    { unitCompositionId: 'uc-int10', miniatureId: 'm-int', min: 9, max: 9 },
    { unitCompositionId: 'uc-cap', miniatureId: 'm-cap', min: 1, max: 1 },
    { unitCompositionId: 'uc-boyz', miniatureId: 'm-boy', min: 9, max: 19 },
    { unitCompositionId: 'uc-boyz', miniatureId: 'm-nob', min: 1, max: 1 },
    { unitCompositionId: 'uc-boss', miniatureId: 'm-boss', min: 1, max: 1 },
  ],
  base_miniature_loadout: [
    { id: 'bl-int', datasheetId: 'ds-int', miniatureId: 'm-int' },
    { id: 'bl-sgt', datasheetId: 'ds-int', miniatureId: 'm-sgt' },
    { id: 'bl-cap', datasheetId: 'ds-cap', miniatureId: 'm-cap' },
    { id: 'bl-boy', datasheetId: 'ds-boyz', miniatureId: 'm-boy' },
    { id: 'bl-nob', datasheetId: 'ds-boyz', miniatureId: 'm-nob' },
  ],
  base_miniature_loadout_wargear_option: [
    { baseMiniatureLoadoutId: 'bl-int', wargearOptionId: 'o-br', count: 1 },
    { baseMiniatureLoadoutId: 'bl-sgt', wargearOptionId: 'o-br', count: 1 },
    { baseMiniatureLoadoutId: 'bl-cap', wargearOptionId: 'o-cap-br', count: 1 },
    { baseMiniatureLoadoutId: 'bl-cap', wargearOptionId: 'o-shield', count: 1 },
    { baseMiniatureLoadoutId: 'bl-boy', wargearOptionId: 'o-ch', count: 1 },
    { baseMiniatureLoadoutId: 'bl-boy', wargearOptionId: 'o-sl', count: 1 },
    { baseMiniatureLoadoutId: 'bl-nob', wargearOptionId: 'o-kl', count: 1 },
    { baseMiniatureLoadoutId: 'bl-nob', wargearOptionId: 'o-sl', count: 1 },
  ],
  datasheet_bodyguard_group: [
    { id: 'bg-cap', bodyguardType: 'leader', datasheetId: 'ds-cap' },
    { id: 'bg-boss', bodyguardType: 'leader', datasheetId: 'ds-boss' },
  ],
  datasheet_bodyguard_group_datasheet: [
    { datasheetBodyguardGroupId: 'bg-cap', datasheetId: 'ds-int' },
  ],
  datasheet_bodyguard_group_keyword: [
    // A Warboss leads Mob Infantry units: units with all of the group's keywords.
    { datasheetBodyguardGroupId: 'bg-boss', keywordId: 'kw-mob' },
    { datasheetBodyguardGroupId: 'bg-boss', keywordId: 'kw-inf' },
  ],
});

/** The script as 39k.pro serves it: code around the data object. */
export const sampleBundle = (tables: Record<string, unknown> = sampleTables()) =>
  `(function(){})();function Wd(e){return e}const Qd={data_version:972},Yd=${toJsLiteral(tables)},Vd={metadata:Qd,data:Yd},B=Vd.data;`;

export const SAMPLE_BUNDLE_URL = 'https://39k.pro/assets/index-47cf0977.js';
export const SAMPLE_HOME =
  '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-47cf0977.js"></script></head><body></body></html>';
