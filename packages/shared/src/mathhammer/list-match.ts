import {
  factionFamily,
  type MatchedGroup,
  type MatchedUnit,
  type MathhammerList,
  type UnitData,
  type UnitDatasheet,
} from './data';
import type { ListModels, ListRead } from './list-reader';

/** Letters and digits only, accents dropped: "Khârn the Betrayer" → "kharnthebetrayer". */
const loose = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j] ?? 0;
      row[j] = Math.min(
        above + 1,
        (row[j - 1] ?? 0) + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[b.length] ?? 0;
}

/** Current datasheets before Legends. */
const currentFirst = (sheets: UnitDatasheet[]) => [
  ...sheets.filter((s) => !s.legends),
  ...sheets.filter((s) => s.legends),
];

/** The army family's datasheet (exact, loose, then up to 2 letters off), else any faction's. */
function findSheet(name: string, family: UnitDatasheet[], all: UnitDatasheet[]) {
  const key = loose(name);
  const exact = (sheets: UnitDatasheet[]) =>
    currentFirst(sheets).find((s) => s.name.toLowerCase() === name.toLowerCase()) ??
    currentFirst(sheets).find((s) => loose(s.name) === key);
  const typo =
    key.length >= 6
      ? currentFirst(family).find((s) => distance(loose(s.name), key) <= 2)
      : undefined;
  return exact(family) ?? typo ?? exact(all) ?? null;
}

const byName = <T extends { name: string }>(items: T[], name: string) =>
  items.find((i) => loose(i.name) === loose(name));

/**
 * A weapon written under an older name (lists from older GW data): the only weapon whose name
 * contains it or is contained in it ("Astartes chainsword" → "Chainsword"), or, for a "close
 * combat weapon", the datasheet's only melee weapon ("Combat Knife", "Armoured Hull").
 */
function renamedWeapon(sheet: UnitDatasheet, name: string) {
  const key = loose(name);
  if (/^close[- ]?combat weapons?$/i.test(name.trim())) {
    const melee = sheet.weapons.filter(
      (w) => w.profiles.length > 0 && w.profiles.every((p) => p.melee),
    );
    return melee.length === 1 ? melee[0] : undefined;
  }
  const near = sheet.weapons.filter((w) => {
    const other = loose(w.name);
    return Math.min(other.length, key.length) >= 5 && (other.includes(key) || key.includes(other));
  });
  return near.length === 1 ? near[0] : undefined;
}

/** The model counts of the smallest size with this total, else all to the most numerous kind. */
function countsFor(sheet: UnitDatasheet, total: number): { modelId: string; count: number }[] {
  const size = sheet.sizes.find((s) => s.models.reduce((sum, m) => sum + m.count, 0) === total);
  if (size) return size.models.filter((m) => m.count > 0);
  const biggest =
    [...(sheet.sizes[0]?.models ?? [])].sort((a, b) => b.count - a.count)[0]?.modelId ??
    sheet.models[0]?.id;
  return biggest === undefined ? [] : [{ modelId: biggest, count: total }];
}

/** One list unit against its datasheet: model groups with weapon ids, and what wasn't found. */
function matchGroups(groups: ListModels[], sheet: UnitDatasheet) {
  const out: MatchedGroup[] = [];
  const unread: string[] = [];
  const onlyKind = sheet.models.length === 1 ? sheet.models[0]?.id : undefined;
  // A unit with model lines (GW app) writes unit-wide wargear in unnamed lines beside them.
  const hasModelLines = groups.some(
    (g) => g.name !== null && byName(sheet.models, g.name) !== undefined,
  );
  for (const group of groups) {
    const weapons: MatchedGroup['weapons'] = [];
    const extraModels: MatchedGroup[] = [];
    for (const item of group.wargear) {
      const weapon = byName(sheet.weapons, item.name) ?? renamedWeapon(sheet, item.name);
      if (weapon) {
        weapons.push({ weaponId: weapon.id, count: item.count });
        continue;
      }
      // "A and B": two weapons written as one choice.
      const parts = item.name.split(/\s+and\s+/i);
      const joined = parts.flatMap((part) => byName(sheet.weapons, part) ?? []);
      if (parts.length > 1 && joined.length === parts.length) {
        for (const part of joined) weapons.push({ weaponId: part.id, count: item.count });
        continue;
      }
      const kind = byName(sheet.models, item.name);
      if (kind) {
        extraModels.push({ modelId: kind.id, models: item.count, weapons: [] });
        continue;
      }
      if (!sheet.wargear.some((w) => loose(w) === loose(item.name))) unread.push(item.name);
    }
    const named = group.name === null ? undefined : byName(sheet.models, group.name);
    // Models named as wargear ("Intercessor Sergeant, 4 with …") are part of the unit's count.
    const models = Math.max(0, group.count - extraModels.reduce((sum, m) => sum + m.models, 0));
    if (named) {
      out.push({ modelId: named.id, models: group.count, weapons });
    } else if (hasModelLines || models === 0) {
      // Wargear the list writes for the whole unit (a line beside the model lines): no models.
      if (weapons.length > 0) out.push({ modelId: null, models: 0, weapons });
    } else if (onlyKind !== undefined) {
      out.push({ modelId: onlyKind, models, weapons });
    } else {
      // Unnamed models of several kinds: counts from the size (or, beside models named as
      // wargear, all of the most numerous other kind), the weapons on the biggest kind.
      const others = extraModels.map((m) => m.modelId);
      const kinds =
        others.length === 0
          ? countsFor(sheet, models)
          : countsFor(
              {
                ...sheet,
                sizes: sheet.sizes.map((size) => ({
                  ...size,
                  models: size.models.filter((m) => !others.includes(m.modelId)),
                })),
              },
              models,
            );
      const biggest = [...kinds].sort((x, y) => y.count - x.count)[0]?.modelId;
      for (const k of kinds) {
        out.push({
          modelId: k.modelId,
          models: k.count,
          weapons: k.modelId === biggest ? weapons : [],
        });
      }
    }
    out.push(...extraModels);
  }
  return { groups: out, unread };
}

/** A list's units matched to datasheets: the army's family first, then any faction (allies). */
export function matchList(read: ListRead, data: UnitData): MathhammerList {
  const familyNames = read.army === null ? [] : factionFamily(read.army, data.factions);
  const family = data.datasheets.filter((d) => d.factions.some((f) => familyNames.includes(f)));
  const used = new Map<string, UnitDatasheet>();
  const units: MatchedUnit[] = read.units.map((unit) => {
    const total = unit.groups.reduce((sum, g) => sum + g.count, 0);
    const label = total > 1 ? `${unit.name} ×${String(total)}` : unit.name;
    const sheet = findSheet(unit.name, family, data.datasheets);
    if (sheet === null) {
      return {
        label,
        name: unit.name,
        datasheetId: null,
        groups: [],
        attachedTo: unit.attachedTo,
        unread: [unit.name],
      };
    }
    used.set(sheet.id, sheet);
    const { groups, unread } = matchGroups(unit.groups, sheet);
    return {
      label,
      name: unit.name,
      datasheetId: sheet.id,
      groups,
      attachedTo: unit.attachedTo,
      unread,
    };
  });
  return { army: read.army, units, datasheets: [...used.values()] };
}
