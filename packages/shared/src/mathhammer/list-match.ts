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
  for (const group of groups) {
    const weapons: MatchedGroup['weapons'] = [];
    const extraModels: MatchedGroup[] = [];
    for (const item of group.wargear) {
      const weapon = byName(sheet.weapons, item.name);
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
    if (named || onlyKind !== undefined) {
      out.push({ modelId: named?.id ?? onlyKind ?? null, models: group.count, weapons });
    } else {
      // Unnamed models of several kinds: counts from the size, the weapons on the biggest kind.
      const kinds = countsFor(sheet, group.count);
      const biggest = [...kinds].sort((a, b) => b.count - a.count)[0]?.modelId;
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
