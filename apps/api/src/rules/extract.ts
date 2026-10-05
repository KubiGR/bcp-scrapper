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
export const RULES_FORMAT = 1;

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
  const appFaction = new Map<string, string>();
  for (const keyword of factionKeywords) {
    const id = field(keyword, 'id');
    const common = enText(keyword, 'commonName');
    const faction =
      canonicalArmy(enText(keyword, 'name')) ?? (common === '' ? null : canonicalArmy(common));
    if (id !== null && faction !== null) appFaction.set(id, faction);
  }
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
    const unitInvuln = number(
      field(invulns.find((r) => field(r, 'miniatureId') === null) ?? {}, 'save'),
    );
    const models: UnitModel[] = [...(miniatures.get(id) ?? [])]
      .sort(byOrder)
      // A hidden statline (a sergeant shown with the squad) is still a model of the unit.
      .flatMap((model) => {
        const modelId = field(model, 'id') ?? '';
        const toughness = number(field(model, 'toughness'));
        const wounds = number(field(model, 'wounds'));
        if (toughness === null || wounds === null) return [];
        const own = number(
          field(invulns.find((r) => field(r, 'miniatureId') === modelId) ?? {}, 'save'),
        );
        return [
          {
            id: modelId,
            name: enText(model, 'name'),
            toughness,
            save: number(field(model, 'save')) ?? 7,
            invuln: own ?? unitInvuln,
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
      fnp: fnps.length > 0 ? Math.min(...fnps) : null,
      stealth: coreNames.some((name) => /^Stealth$/i.test(name)),
      damaged: damagedCore[0] ?? damagedText[0] ?? null,
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

/** Finds 39k.pro's data in its script, reads it as text (never runs it) and extracts the units. */
export function readRulesBundle(script: string): { dataVersion: number | null; data: UnitData } {
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
  };
}
