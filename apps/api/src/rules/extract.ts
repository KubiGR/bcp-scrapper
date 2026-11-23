import {
  canonicalArmy,
  cleanRulesText,
  UnitDataSchema,
  type UnitData,
  type UnitDatasheet,
  type UnitModel,
  type UnitProfile,
  type UnitWeapon,
} from '@bcp/shared';
import { readJsLiteral } from './js-literal';

/** Bump when the extraction changes: a site holding data read the old way reads it again. */
export const RULES_FORMAT = 7;

/** 39k.pro's data wasn't where or what it should be: the site changed. */
export class RulesShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RulesShapeError';
  }
}

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Tables every read needs; the others may be missing. */
const REQUIRED = [
  'publication',
  'faction_keyword',
  'datasheet',
  'datasheet_faction_keyword',
  'miniature',
  'miniature_keyword',
  'keyword',
  'datasheet_ability',
  'datasheet_datasheet_ability',
  'wargear_option_group',
  'wargear_option',
  'wargear_item',
  'wargear_item_profile',
  'wargear_ability',
  'wargear_item_profile_wargear_ability',
  'unit_composition',
  'unit_composition_miniature',
  'base_miniature_loadout',
  'base_miniature_loadout_wargear_option',
  'datasheet_bodyguard_group',
  'datasheet_bodyguard_group_datasheet',
];

const field = (row: Row, key: string): string | null => {
  const value = row[key];
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null;
};
const en = (row: Row): Row => {
  const all = row.localisations;
  const english = isRow(all) ? all.en : undefined;
  return isRow(english) ? english : {};
};
const enText = (row: Row, key: string) => cleanRulesText(field(en(row), key));
const byOrder = (a: Row, b: Row) => Number(a.displayOrder ?? 0) - Number(b.displayOrder ?? 0);
const unique = <T>(values: T[]) => [...new Set(values)];
/** "3+" → 3, "12" → 12, "-" → null. */
const number = (text: string | null): number | null => {
  const match = /^\s*(-?\d+)\+?\s*$/.exec(text ?? '');
  return match === null ? null : Number(match[1]);
};

/**
 * An invulnerable save row: its value, and whether it only works against ranged or melee
 * attacks (from its columns or its note, e.g. "Against ranged attacks only"). A save that differs
 * between the two (5+, "4+ against melee attacks only") is taken as the better one against all.
 */
function invulnOf(row: Row | undefined): Pick<UnitModel, 'invuln' | 'invulnAgainst'> | null {
  if (row === undefined) return null;
  const note = enText(row, 'rules');
  const save = number(field(row, 'save'));
  const ranged = number(field(row, 'rangedSave'));
  const melee =
    number(field(row, 'meleeSave')) ??
    number(/(\d)\+ against melee attacks only/i.exec(note)?.[1] ?? null);
  const general = save ?? ranged;
  if (melee !== null && general !== null) {
    return { invuln: Math.min(melee, general), invulnAgainst: 'all' };
  }
  if (melee !== null) return { invuln: melee, invulnAgainst: 'melee' };
  if (general === null) return null;
  if (/against melee attacks only/i.test(note)) return { invuln: general, invulnAgainst: 'melee' };
  if ((save === null && ranged !== null) || /against ranged attacks/i.test(note)) {
    return { invuln: general, invulnAgainst: 'ranged' };
  }
  return { invuln: general, invulnAgainst: 'all' };
}

function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const value = field(row, key);
    if (value === null) continue;
    const list = groups.get(value);
    if (list === undefined) groups.set(value, [row]);
    else list.push(row);
  }
  return groups;
}

/** Faction keyword id → the app's faction name, for keywords the app knows. */
function appFactions(factionKeywords: Row[]): Map<string, string> {
  const appFaction = new Map<string, string>();
  for (const keyword of factionKeywords) {
    const id = field(keyword, 'id');
    const common = enText(keyword, 'commonName');
    const faction =
      canonicalArmy(enText(keyword, 'name')) ?? (common === '' ? null : canonicalArmy(common));
    if (id !== null && faction !== null) appFaction.set(id, faction);
  }
  return appFaction;
}

/**
 * Each faction's detachments (A→Z), as the GW app lets each faction take them: a chapter gets
 * its own and the Space Marines ones it may use. Combat Patrol detachments are left out.
 */
export function extractDetachments(tables: Record<string, unknown>): Map<string, string[]> {
  const rows = (name: string): Row[] => {
    const value = tables[name];
    return Array.isArray(value) ? value.filter(isRow) : [];
  };
  const patrol = new Set(
    rows('publication')
      .filter((p) => p.isCombatPatrol === true)
      .map((p) => field(p, 'id')),
  );
  const appFaction = appFactions(rows('faction_keyword'));
  const names = new Map(
    rows('detachment')
      .filter((d) => d.isCombatPatrol !== true && !patrol.has(field(d, 'publicationId')))
      .map((d) => [field(d, 'id'), enText(d, 'name')]),
  );
  const byFaction = new Map<string, Set<string>>();
  for (const link of rows('detachment_faction_keyword')) {
    const name = names.get(field(link, 'detachmentId'));
    const faction = appFaction.get(field(link, 'factionKeywordId') ?? '');
    if (name === undefined || name === '' || faction === undefined) continue;
    const set = byFaction.get(faction) ?? new Set<string>();
    set.add(name);
    byFaction.set(faction, set);
  }
  return new Map(
    [...byFaction]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([faction, set]) => [faction, [...set].sort((a, b) => a.localeCompare(b))]),
  );
}

/** GW-app tables from 39k.pro → the English unit data Mathhammer uses. */
export function extractUnits(tables: Record<string, unknown>): UnitData {
  const table = (name: string): Row[] => {
    const value = tables[name];
    const rows = Array.isArray(value) ? value.filter(isRow) : [];
    if (rows.length === 0 && REQUIRED.includes(name)) {
      throw new RulesShapeError(`39k.pro data has no ${name}`);
    }
    return rows;
  };
  for (const name of REQUIRED) table(name);

  const patrol = new Set(
    table('publication')
      .filter((p) => p.isCombatPatrol === true)
      .map((p) => field(p, 'id')),
  );
  const kept = (row: Row) =>
    row.isCombatPatrol !== true && !patrol.has(field(row, 'publicationId'));

  // Factions, as the app names them.
  const factionKeywords = table('faction_keyword');
  const appFaction = appFactions(factionKeywords);
  const factionsOf = (ids: (string | null)[]) =>
    unique(ids.flatMap((id) => (id === null ? [] : [appFaction.get(id) ?? ''])))
      .filter((faction) => faction !== '')
      .sort();
  const factions = factionKeywords.flatMap((keyword) => {
    const faction = appFaction.get(field(keyword, 'id') ?? '');
    if (faction === undefined || keyword.excludedFromArmyBuilder === true) return [];
    const parentId = field(keyword, 'parentFactionKeywordId');
    const parent = parentId === null ? null : (appFaction.get(parentId) ?? null);
    return [{ name: enText(keyword, 'name'), faction, parent: parent === faction ? null : parent }];
  });

  // Lookups.
  const datasheetFactions = groupBy(table('datasheet_faction_keyword'), 'datasheetId');
  const miniatures = groupBy(table('miniature'), 'datasheetId');
  const modelKeywords = groupBy(table('miniature_keyword'), 'miniatureId');
  const keywordName = new Map(table('keyword').map((k) => [field(k, 'id'), enText(k, 'name')]));
  const invulnerable = groupBy(table('invulnerable_save'), 'datasheetId');
  const damagedRows = groupBy(table('datasheet_damage'), 'datasheetId');
  const ability = new Map(table('datasheet_ability').map((a) => [field(a, 'id'), a]));
  const abilityLinks = groupBy(table('datasheet_datasheet_ability'), 'datasheetId');
  const items = new Map(table('wargear_item').map((item) => [field(item, 'id'), item]));
  const profileRows = groupBy(table('wargear_item_profile'), 'wargearItemId');
  const weaponAbility = new Map(
    table('wargear_ability').map((a) => [field(a, 'id'), enText(a, 'name')]),
  );
  const profileAbilities = groupBy(
    table('wargear_item_profile_wargear_ability'),
    'wargearItemProfileId',
  );
  const optionById = new Map(table('wargear_option').map((o) => [field(o, 'id'), o]));
  const compositions = groupBy(table('unit_composition'), 'datasheetId');
  const compositionModels = groupBy(table('unit_composition_miniature'), 'unitCompositionId');
  const baseLoadouts = groupBy(table('base_miniature_loadout'), 'datasheetId');
  const baseLoadoutOptions = groupBy(
    table('base_miniature_loadout_wargear_option'),
    'baseMiniatureLoadoutId',
  );
  const bodyguardGroups = groupBy(table('datasheet_bodyguard_group'), 'datasheetId');
  const bodyguardDatasheets = groupBy(
    table('datasheet_bodyguard_group_datasheet'),
    'datasheetBodyguardGroupId',
  );
  const bodyguardKeywords = groupBy(
    table('datasheet_bodyguard_group_keyword'),
    'datasheetBodyguardGroupId',
  );

  /** Item ids a datasheet can take, through a choice table chain (set → choice → item). */
  const chain = (
    setTable: string,
    choiceTable: string,
    setKey: string,
    itemTable: string,
    choiceKey: string,
  ) => {
    const choices = groupBy(table(choiceTable), setKey);
    const choiceItems = groupBy(table(itemTable), choiceKey);
    const sets = groupBy(table(setTable), 'datasheetId');
    return (datasheetId: string) =>
      (sets.get(datasheetId) ?? []).flatMap((set) =>
        (choices.get(field(set, 'id') ?? '') ?? []).flatMap((choice) =>
          (choiceItems.get(field(choice, 'id') ?? '') ?? []).map((row) =>
            field(row, 'wargearItemId'),
          ),
        ),
      );
  };
  const optionGroups = groupBy(table('wargear_option_group'), 'datasheetId');
  const options = groupBy(table('wargear_option'), 'wargearOptionGroupId');
  const itemSources = [
    (datasheetId: string) =>
      (optionGroups.get(datasheetId) ?? []).flatMap((group) =>
        (options.get(field(group, 'id') ?? '') ?? []).map((row) => field(row, 'wargearItemId')),
      ),
    chain(
      'loadout_choice_set',
      'loadout_choice',
      'loadoutChoiceSetId',
      'loadout_choice_wargear_item',
      'loadoutChoiceId',
    ),
    chain(
      'all_model_wargear_choice_set',
      'all_model_wargear_choice',
      'allModelWargearChoiceSetId',
      'all_model_wargear_choice_wargear_item',
      'allModelWargearChoiceId',
    ),
    chain(
      'limited_wargear_choice_set',
      'limited_wargear_choice',
      'limitedWargearChoiceSetId',
      'limited_wargear_choice_wargear_item',
      'limitedWargearChoiceId',
    ),
  ];

  const profileOf = (row: Row): UnitProfile => {
    const melee = field(row, 'type') === 'melee';
    return {
      name: enText(row, 'name'),
      melee,
      range: field(row, 'range'),
      attacks: field(row, 'attacks') ?? '1',
      skill: number(
        melee
          ? (field(row, 'weaponSkill') ?? field(row, 'ballisticSkill'))
          : field(row, 'ballisticSkill'),
      ),
      strength: number(field(row, 'strength')),
      ap: number(field(row, 'armourPenetration')) ?? 0,
      damage: field(row, 'damage') ?? '1',
      keywords: [...(profileAbilities.get(field(row, 'id') ?? '') ?? [])]
        .sort(byOrder)
        .map((link) => weaponAbility.get(field(link, 'wargearAbilityId')) ?? '')
        .filter((name) => name !== ''),
    };
  };
  const weaponOf = (id: string, item: Row): UnitWeapon => ({
    id,
    name: enText(item, 'name'),
    profiles: [...(profileRows.get(id) ?? [])].sort(byOrder).map(profileOf),
  });

  // Datasheets.
  const kinds = new Map<string, string[]>(); // datasheet id → upper-case keywords
  const sheets = table('datasheet').filter(kept);
  for (const sheet of sheets) {
    const id = field(sheet, 'id') ?? '';
    kinds.set(
      id,
      unique(
        (miniatures.get(id) ?? []).flatMap((model) =>
          (modelKeywords.get(field(model, 'id') ?? '') ?? []).map((link) =>
            (keywordName.get(field(link, 'keywordId')) ?? '').toUpperCase(),
          ),
        ),
      ).filter((k) => k !== ''),
    );
  }
  const factionsById = new Map(
    sheets.map((sheet) => {
      const id = field(sheet, 'id') ?? '';
      return [
        id,
        factionsOf((datasheetFactions.get(id) ?? []).map((r) => field(r, 'factionKeywordId'))),
      ];
    }),
  );
  /** Units a character can lead or support: listed ones, and those with a listed keyword. */
  const bodyguardsOf = (id: string, type: string): string[] => {
    const mine = factionsById.get(id) ?? [];
    return unique(
      (bodyguardGroups.get(id) ?? [])
        .filter((group) => field(group, 'bodyguardType') === type)
        .flatMap((group) => {
          const groupId = field(group, 'id') ?? '';
          const listed = (bodyguardDatasheets.get(groupId) ?? []).map(
            (row) => field(row, 'datasheetId') ?? '',
          );
          const wanted = (bodyguardKeywords.get(groupId) ?? []).map((row) =>
            (keywordName.get(field(row, 'keywordId')) ?? '').toUpperCase(),
          );
          const byKeyword =
            wanted.length === 0
              ? []
              : [...kinds.entries()]
                  .filter(
                    ([other, keywords]) =>
                      other !== id &&
                      wanted.every((k) => keywords.includes(k)) &&
                      (factionsById.get(other) ?? []).some((f) => mine.includes(f)),
                  )
                  .map(([other]) => other);
          return [...listed, ...byKeyword];
        })
        .filter((other) => other !== '' && kinds.has(other)),
    );
  };

  const datasheets = sheets.map((sheet): UnitDatasheet => {
    const id = field(sheet, 'id') ?? '';
    const invulns = invulnerable.get(id) ?? [];
    const unitInvuln = invulnOf(invulns.find((r) => field(r, 'miniatureId') === null));
    const models: UnitModel[] = [...(miniatures.get(id) ?? [])]
      .sort(byOrder)
      // A hidden statline (a sergeant shown with the squad) is still a model of the unit.
      .flatMap((model) => {
        const modelId = field(model, 'id') ?? '';
        const toughness = number(field(model, 'toughness'));
        const wounds = number(field(model, 'wounds'));
        if (toughness === null || wounds === null) return [];
        const own = invulnOf(invulns.find((r) => field(r, 'miniatureId') === modelId));
        return [
          {
            id: modelId,
            name: enText(model, 'name'),
            toughness,
            save: number(field(model, 'save')) ?? 7,
            ...(own ?? unitInvuln ?? { invuln: null, invulnAgainst: 'all' as const }),
            wounds,
          },
        ];
      });
    const modelIds = new Set(models.map((m) => m.id));
    const sizes = [...(compositions.get(id) ?? [])]
      .sort(byOrder)
      .map((composition) => ({
        points: typeof composition.points === 'number' ? composition.points : null,
        models: (compositionModels.get(field(composition, 'id') ?? '') ?? [])
          .map((row) => ({
            modelId: field(row, 'miniatureId') ?? '',
            count: Number(row.max ?? row.min ?? 0),
          }))
          .filter((m) => modelIds.has(m.modelId) && m.count > 0),
      }))
      .filter((size) => size.models.length > 0)
      .sort(
        (a, b) =>
          a.models.reduce((s, m) => s + m.count, 0) - b.models.reduce((s, m) => s + m.count, 0),
      );
    const loadout = (baseLoadouts.get(id) ?? []).flatMap((base) => {
      const modelId = field(base, 'miniatureId') ?? '';
      return (baseLoadoutOptions.get(field(base, 'id') ?? '') ?? []).flatMap((row) => {
        const itemId = field(optionById.get(field(row, 'wargearOptionId')) ?? {}, 'wargearItemId');
        const item = items.get(itemId);
        if (itemId === null || item === undefined || field(item, 'wargearType') !== 'weapon') {
          return [];
        }
        return [{ modelId, weaponId: itemId, count: Number(row.count ?? 1) }];
      });
    });
    const weaponIds = unique([
      ...loadout.map((l) => l.weaponId),
      ...itemSources.flatMap((source) => source(id)),
    ]).filter((itemId): itemId is string => itemId !== null);
    const weapons = weaponIds.flatMap((itemId) => {
      const item = items.get(itemId);
      return item !== undefined && field(item, 'wargearType') === 'weapon'
        ? [weaponOf(itemId, item)]
        : [];
    });
    const wargear = weaponIds.flatMap((itemId) => {
      const item = items.get(itemId);
      return item !== undefined && field(item, 'wargearType') !== 'weapon'
        ? [enText(item, 'name')]
        : [];
    });
    const linked = [...(abilityLinks.get(id) ?? [])].sort(byOrder).flatMap((link) => {
      const row = ability.get(field(link, 'datasheetAbilityId'));
      return row === undefined ? [] : [row];
    });
    const coreNames = linked
      .filter((row) => field(row, 'abilityType') === 'core')
      .map((row) => enText(row, 'name'));
    const fnps = coreNames.flatMap((name) => {
      const match = /^Feel No Pain (\d)\+/i.exec(name);
      return match === null ? [] : [Number(match[1])];
    });
    const damagedCore = coreNames.flatMap((name) => {
      const match = /^Damaged (\d+)/i.exec(name);
      return match === null ? [] : [Number(match[1])];
    });
    const damagedText = (damagedRows.get(id) ?? []).flatMap((row) => {
      const match = /1-(\d+) wounds/i.exec(`${enText(row, 'name')} ${enText(row, 'rules')}`);
      return match === null ? [] : [Number(match[1])];
    });
    return {
      id,
      name: enText(sheet, 'name'),
      legends: sheet.isLegends === true,
      factions: factionsById.get(id) ?? [],
      keywords: kinds.get(id) ?? [],
      models,
      sizes,
      loadout,
      weapons,
      wargear,
      fnp: fnps.length > 0 ? Math.min(...fnps) : null,
      fnpPsychic: fnpPsychicOf(linked.map((row) => enText(row, 'rules'))),
      stealth: coreNames.some((name) => /^Stealth$/i.test(name)),
      damaged: damagedCore[0] ?? damagedText[0] ?? null,
      damageReduction: damageReductionOf(
        linked.map((row) => ({ name: enText(row, 'name'), text: enText(row, 'rules') })),
      ),
      abilities: linked
        .filter(
          (row) => field(row, 'abilityType') !== 'core' && field(row, 'abilityType') !== 'faction',
        )
        .map((row) => ({ name: enText(row, 'name'), text: enText(row, 'rules') })),
      leads: bodyguardsOf(id, 'leader'),
      supports: bodyguardsOf(id, 'support'),
    };
  });

  return { factions, datasheets: datasheets.filter((d) => d.models.length > 0) };
}

/**
 * The best Feel No Pain against psychic attacks the abilities give ("Feel No Pain 4+ ability
 * against Psychic Attacks and mortal wounds"), and whether it covers the model's whole unit (a
 * leader's "models in that unit", "this unit") or only "this model".
 */
function fnpPsychicOf(texts: string[]): { value: number; wholeUnit: boolean } | null {
  let best: { value: number; wholeUnit: boolean } | null = null;
  for (const text of texts) {
    const match = /Feel No Pain (\d)\+(?: ability)? against ([^.]*)/i.exec(text);
    if (match === null || !/psychic attack/i.test(match[2] ?? '')) continue;
    const found = { value: Number(match[1]), wholeUnit: !/^this model has/i.test(text) };
    if (
      best === null ||
      found.value < best.value ||
      (found.value === best.value && found.wholeUnit)
    ) {
      best = found;
    }
  }
  return best;
}

/**
 * The first ability that subtracts from ("subtract 1 from the Damage characteristic") or halves
 * the Damage of attacks against the model, e.g. Necrodermis.
 */
function damageReductionOf(abilities: { name: string; text: string }[]) {
  for (const { name, text } of abilities) {
    const minus = /subtract (\d+) from the Damage characteristic/i.exec(text);
    const halve = /halve the Damage characteristic/i.test(text);
    if (minus !== null || halve) return { ability: name, minus: Number(minus?.[1] ?? 0), halve };
  }
  return null;
}

/**
 * Finds 39k.pro's data in its script, reads it as text (never runs it) and extracts the units and
 * each faction's detachments.
 */
export function readRulesBundle(script: string): {
  dataVersion: number | null;
  data: UnitData;
  detachments: Map<string, string[]>;
} {
  const at = script.indexOf('{publication:');
  if (at < 0) {
    throw new RulesShapeError('No rules data found in 39k.pro’s script (the site changed)');
  }
  let value: unknown;
  try {
    value = readJsLiteral(script, at).value;
  } catch (error) {
    throw new RulesShapeError(
      `39k.pro’s rules data couldn’t be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRow(value)) throw new RulesShapeError('39k.pro’s rules data isn’t an object');
  const version = /data_version:(\d+)/.exec(script.slice(Math.max(0, at - 200), at));
  const parsed = UnitDataSchema.safeParse(extractUnits(value));
  if (!parsed.success) throw new RulesShapeError('39k.pro’s rules data has an unexpected shape');
  return {
    dataVersion: version?.[1] === undefined ? null : Number(version[1]),
    data: parsed.data,
    detachments: extractDetachments(value),
  };
}
