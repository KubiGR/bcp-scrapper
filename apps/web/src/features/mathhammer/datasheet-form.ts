import type { UnitDatasheet, UnitProfile, UnitWeapon } from '@bcp/shared';
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

/**
 * The weapons of one unit of this size: one row per weapon of the default loadout, counting every
 * model that carries it. A model fights with one melee weapon (plus Extra Attacks ones), so a
 * model kind's several melee weapons become one row whose profiles are all of theirs (Best).
 */
function rowsOf(unit: UnitDatasheet, size: number, prefix: string): WeaponRow[] {
  const howMany = counts(unit, size);
  const weapons = new Map(unit.weapons.map((w) => [w.id, w]));
  const rows = new Map<string, { name: string; profiles: UnitProfile[]; models: number }>();
  const add = (key: string, name: string, profiles: UnitProfile[], models: number) => {
    const found = rows.get(key);
    if (found === undefined) rows.set(key, { name, profiles, models });
    else found.models += models;
  };
  for (const model of unit.models) {
    const models = howMany.get(model.id) ?? 0;
    if (models === 0) continue;
    const carried = unit.loadout.flatMap((entry) => {
      const weapon = weapons.get(entry.weaponId);
      return entry.modelId === model.id && weapon !== undefined && weapon.profiles.length > 0
        ? [{ weapon, count: entry.count }]
        : [];
    });
    const melee = carried.filter(({ weapon }) => meleeOnly(weapon));
    const merged = melee.length > 1;
    let mergedAdded = false;
    for (const { weapon, count } of carried) {
      if (!merged || !meleeOnly(weapon)) {
        add(weapon.id, `${prefix}${weapon.name}`, weapon.profiles, models * count);
        continue;
      }
      // The model's melee weapons: one row, where the first of them is.
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
        models,
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
    ...rowsOf(sheet, sizeIndex, ''),
    ...attached.flatMap((character) => rowsOf(character, 0, `${character.name}: `)),
  ];
}

/** Model rows of a unit: kinds with the same profile are one row (one allocation group). */
function groupsOf(unit: UnitDatasheet, sizeIndex: number, character: boolean): GroupRow[] {
  const howMany = counts(unit, sizeIndex);
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
      ...groupsOf(sheet, sizeIndex, false),
      ...attached.flatMap((character) => groupsOf(character, 0, true)),
    ],
    keywords: [...new Set(all.flatMap((unit) => unit.keywords))].join(', '),
    attached: attached.length > 0,
    stealth: all.every((unit) => unit.stealth),
  };
}
