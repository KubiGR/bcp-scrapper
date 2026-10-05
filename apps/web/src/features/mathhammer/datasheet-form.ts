import type { UnitDatasheet, UnitProfile } from '@bcp/shared';
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

/** A weapon row from a datasheet profile; with several profiles, Best is chosen. */
function rowFrom(name: string, models: number, profiles: UnitProfile[]): WeaponRow {
  const first = profiles[0];
  return {
    ...newWeapon(),
    name,
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

/**
 * The attacker's weapons for a unit of this size, with its attached characters: one row per
 * weapon of the default loadout, counting every model that carries it.
 */
export function attackerRows(
  sheet: UnitDatasheet,
  sizeIndex: number,
  attached: UnitDatasheet[],
): WeaponRow[] {
  const rowsOf = (unit: UnitDatasheet, size: number, prefix: string) => {
    const howMany = counts(unit, size);
    const carried = new Map<string, number>();
    for (const entry of unit.loadout) {
      const models = howMany.get(entry.modelId) ?? 0;
      if (models > 0)
        carried.set(entry.weaponId, (carried.get(entry.weaponId) ?? 0) + models * entry.count);
    }
    return unit.weapons.flatMap((weapon) => {
      const models = carried.get(weapon.id) ?? 0;
      return models > 0 && weapon.profiles.length > 0
        ? [rowFrom(`${prefix}${weapon.name}`, models, weapon.profiles)]
        : [];
    });
  };
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
