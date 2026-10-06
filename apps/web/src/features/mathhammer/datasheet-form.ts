import type {
  MatchedGroup,
  MathhammerList,
  UnitDatasheet,
  UnitProfile,
  UnitWeapon,
} from '@bcp/shared';
import {
  newGroup,
  newWeapon,
  type DefenderForm,
  type GroupRow,
  type WeaponRow,
} from './form-state';

/** How many of each model kind a size has (the smallest size when out of range). */
function counts(sheet: UnitDatasheet, sizeIndex: number): Map<string, number> {
  const size = sheet.sizes[sizeIndex] ?? sheet.sizes[0];
  return new Map((size?.models ?? []).map((m) => [m.modelId, m.count]));
}

/** A weapon row from datasheet profiles; with several profiles, Best is chosen. */
function rowFrom(name: string, owner: string, models: number, profiles: UnitProfile[]): WeaponRow {
  const first = profiles[0];
  return {
    ...newWeapon(),
    name,
    owner,
    models,
    melee: first?.melee ?? false,
    attacks: first?.attacks ?? '1',
    skill: first?.skill ?? null,
    strength: first?.strength ?? 4,
    ap: first?.ap ?? 0,
    damage: first?.damage ?? '1',
    profiles,
    profile: profiles.length > 1 ? 'best' : 0,
    keywordNames: first?.keywords ?? [],
  };
}

const EXTRA_ATTACKS = /^extra attacks$/i;
const meleeOnly = (weapon: UnitWeapon) =>
  weapon.profiles.length > 0 &&
  weapon.profiles.every((p) => p.melee && !p.keywords.some((k) => EXTRA_ATTACKS.test(k.trim())));

/** Models of one kind and the weapons they carry (how many of each). */
interface Carry {
  modelId: string | null;
  models: number;
  weapons: { weapon: UnitWeapon; count: number }[];
}

/** A size's model kinds with their default loadout. */
function defaultCarry(unit: UnitDatasheet, sizeIndex: number): Carry[] {
  return loadoutCarry(unit, counts(unit, sizeIndex));
}

/** These many models of each kind with the datasheet's default loadout. */
function loadoutCarry(unit: UnitDatasheet, howMany: Map<string, number>): Carry[] {
  const weapons = new Map(unit.weapons.map((w) => [w.id, w]));
  return unit.models.flatMap((model) => {
    const models = howMany.get(model.id) ?? 0;
    if (models === 0) return [];
    return [
      {
        modelId: model.id,
        models,
        weapons: unit.loadout.flatMap((entry) => {
          const weapon = weapons.get(entry.weaponId);
          return entry.modelId === model.id && weapon !== undefined
            ? [{ weapon, count: models * entry.count }]
            : [];
        }),
      },
    ];
  });
}

/**
 * A list unit's groups with their weapons looked up; a list that names none of the unit's
 * weapons (some exports leave them out) gets the default loadout for its models.
 */
function listCarry(unit: UnitDatasheet, groups: MatchedGroup[]): Carry[] {
  if (groups.every((g) => g.weapons.length === 0)) return loadoutCarry(unit, countsOf(groups));
  const weapons = new Map(unit.weapons.map((w) => [w.id, w]));
  return groups.map((g) => ({
    modelId: g.modelId,
    models: g.models,
    weapons: g.weapons.flatMap((w) => {
      const weapon = weapons.get(w.weaponId);
      return weapon === undefined ? [] : [{ weapon, count: w.count }];
    }),
  }));
}

/**
 * Weapon rows for groups of models: one row per weapon, counting every one carried. A model
 * fights with one melee weapon (plus Extra Attacks ones), so melee weapons each model carries
 * several of become one row whose profiles are all of theirs (Best).
 */
function rowsOf(unit: UnitDatasheet, carry: Carry[], prefix: string): WeaponRow[] {
  const rows = new Map<string, { name: string; profiles: UnitProfile[]; models: number }>();
  const add = (key: string, name: string, profiles: UnitProfile[], models: number) => {
    const found = rows.get(key);
    if (found === undefined) rows.set(key, { name, profiles, models });
    else found.models += models;
  };
  for (const group of carry) {
    const carried = group.weapons.filter(({ weapon }) => weapon.profiles.length > 0);
    const melee = carried.filter(({ weapon }) => meleeOnly(weapon));
    // Several melee weapons are a choice only when each model carries more than one (a list
    // giving 7 chainblades and 2 eviscerators to 9 models gives each model one).
    const meleeCarried = melee.reduce((sum, m) => sum + m.count, 0);
    const merged = melee.length > 1 && meleeCarried > group.models;
    let mergedAdded = false;
    for (const { weapon, count } of carried) {
      if (!merged || !meleeOnly(weapon)) {
        add(weapon.id, `${prefix}${weapon.name}`, weapon.profiles, count);
        continue;
      }
      // The group's melee weapons: one row, where the first of them is.
      if (mergedAdded) continue;
      mergedAdded = true;
      add(
        melee.map((m) => m.weapon.id).join('+'),
        `${prefix}${melee.map((m) => m.weapon.name).join(' / ')}`,
        melee.flatMap((m) =>
          m.weapon.profiles.map((p) => ({
            ...p,
            name: m.weapon.profiles.length > 1 ? `${m.weapon.name}: ${p.name}` : m.weapon.name,
          })),
        ),
        group.models,
      );
    }
  }
  return [...rows.values()].map((r) =>
    rowFrom(r.name, prefix === '' ? unit.name : prefix.replace(/: $/, ''), r.models, r.profiles),
  );
}

/**
 * The attacker's weapons for a unit of this size, with its attached characters' (named after
 * them), each row marked with the unit it belongs to.
 */
export function attackerRows(
  sheet: UnitDatasheet,
  sizeIndex: number,
  attached: UnitDatasheet[],
): WeaponRow[] {
  return [
    ...rowsOf(sheet, defaultCarry(sheet, sizeIndex), ''),
    ...attached.flatMap((character) =>
      rowsOf(character, defaultCarry(character, 0), `${character.name}: `),
    ),
  ];
}

/** Model rows of a unit: kinds with the same profile are one row (one allocation group). */
function groupsOf(
  unit: UnitDatasheet,
  howMany: Map<string, number>,
  character: boolean,
): GroupRow[] {
  const rows: GroupRow[] = [];
  for (const model of unit.models) {
    const models = howMany.get(model.id) ?? 0;
    if (models === 0) continue;
    const same = rows.find(
      (r) =>
        r.toughness === model.toughness &&
        r.save === model.save &&
        r.invuln === model.invuln &&
        r.wounds === model.wounds,
    );
    if (same !== undefined && !character) {
      same.models += models;
      if (!same.name.split(' / ').includes(model.name)) same.name = `${same.name} / ${model.name}`;
      continue;
    }
    rows.push({
      ...newGroup(),
      name: model.name,
      models,
      toughness: model.toughness,
      save: model.save,
      invuln: model.invuln,
      wounds: model.wounds,
      fnp: unit.fnp,
      character,
    });
  }
  return rows;
}

const reductionText = (r: NonNullable<UnitDatasheet['damageReduction']>) =>
  [r.halve ? 'halve Damage' : null, r.minus > 0 ? `Damage −${String(r.minus)}` : null]
    .filter(Boolean)
    .join(', ');

/**
 * The defender's damage switches from the unit's own ability (Necrodermis: Damage −1); an attached
 * character's protects only that model, so it is named but not ticked.
 */
function damageFrom(
  sheet: UnitDatasheet,
  characters: UnitDatasheet[],
): Pick<DefenderForm, 'damageReduction' | 'halveDamage' | 'damageNote'> {
  const own = sheet.damageReduction;
  const notes = [
    ...(own === null ? [] : [`${capitalised(reductionText(own))}: ${own.ability}`]),
    ...characters.flatMap((c) =>
      c.damageReduction === null
        ? []
        : [
            `${c.name} only: ${c.damageReduction.ability} (${reductionText(c.damageReduction)}), not ticked`,
          ],
    ),
  ];
  return {
    damageReduction: own?.minus ?? 0,
    halveDamage: own?.halve ?? false,
    damageNote: notes.length === 0 ? null : notes.join('; '),
  };
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The defender filled from a unit of this size and its attached characters; switches kept. */
export function defenderFrom(
  sheet: UnitDatasheet,
  sizeIndex: number,
  attached: UnitDatasheet[],
  previous: DefenderForm,
): DefenderForm {
  const all = [sheet, ...attached];
  return {
    ...previous,
    source: [sheet.name, ...attached.map((a) => a.name)].join(' + '),
    groups: [
      ...groupsOf(sheet, counts(sheet, sizeIndex), false),
      ...attached.flatMap((character) => groupsOf(character, counts(character, 0), true)),
    ],
    keywords: [...new Set(all.flatMap((unit) => unit.keywords))].join(', '),
    attached: attached.length > 0,
    stealth: all.every((unit) => unit.stealth),
    ...damageFrom(sheet, attached),
  };
}

const sheetOf = (list: MathhammerList, id: string | null) =>
  list.datasheets.find((d) => d.id === id);
const attachedTo = (list: MathhammerList, index: number) =>
  list.units.flatMap((u, i) => (u.attachedTo === index ? [i] : []));

/** Units offered by the list picker: not the characters attached to another. */
export function pickableUnits(list: MathhammerList): { index: number; label: string }[] {
  return list.units.flatMap((unit, index) => {
    if (unit.attachedTo !== null || unit.datasheetId === null) return [];
    const names = attachedTo(list, index).map((i) => list.units[i]?.name ?? '');
    return [{ index, label: [unit.label, ...names].join(' + ') }];
  });
}

/** A list unit's attached characters that were matched to a datasheet. */
function charactersOf(list: MathhammerList, index: number) {
  return attachedTo(list, index).flatMap((i) => {
    const unit = list.units[i];
    const sheet = sheetOf(list, unit?.datasheetId ?? null);
    return unit && sheet ? [{ unit, sheet }] : [];
  });
}

/** The attacker's weapons for a list unit and the characters attached to it. */
export function attackerRowsFromList(list: MathhammerList, index: number): WeaponRow[] {
  const unit = list.units[index];
  const sheet = sheetOf(list, unit?.datasheetId ?? null);
  if (unit === undefined || sheet === undefined) return [];
  return [
    ...rowsOf(sheet, listCarry(sheet, unit.groups), ''),
    ...charactersOf(list, index).flatMap((c) =>
      rowsOf(c.sheet, listCarry(c.sheet, c.unit.groups), `${c.unit.name}: `),
    ),
  ];
}

/** How many models of each kind a list unit's groups have. */
const countsOf = (groups: MatchedGroup[]) => {
  const howMany = new Map<string, number>();
  for (const g of groups) {
    if (g.modelId !== null) howMany.set(g.modelId, (howMany.get(g.modelId) ?? 0) + g.models);
  }
  return howMany;
};

/** The defender from a list unit and the characters attached to it; switches kept. */
export function defenderFromList(
  list: MathhammerList,
  index: number,
  previous: DefenderForm,
): DefenderForm {
  const unit = list.units[index];
  const sheet = sheetOf(list, unit?.datasheetId ?? null);
  if (unit === undefined || sheet === undefined) return previous;
  const characters = charactersOf(list, index);
  const all = [sheet, ...characters.map((c) => c.sheet)];
  return {
    ...previous,
    source: [unit.name, ...characters.map((c) => c.unit.name)].join(' + '),
    groups: [
      ...groupsOf(sheet, countsOf(unit.groups), false),
      ...characters.flatMap((c) => groupsOf(c.sheet, countsOf(c.unit.groups), true)),
    ],
    keywords: [...new Set(all.flatMap((s) => s.keywords))].join(', '),
    attached: characters.length > 0,
    stealth: all.every((s) => s.stealth),
    ...damageFrom(
      sheet,
      characters.map((c) => c.sheet),
    ),
  };
}
