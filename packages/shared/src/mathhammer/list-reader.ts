import { parseArmyList } from '../army-list-parser';

export interface ListWargear {
  name: string;
  count: number;
}
/** Models of one kind as the list writes them; `name` null when the list doesn't name them. */
export interface ListModels {
  name: string | null;
  count: number;
  wargear: ListWargear[];
}
export interface ListUnit {
  name: string;
  points: number | null;
  groups: ListModels[];
  /** Index (in `units`) of the unit this character is attached to (Leader or Support). */
  attachedTo: number | null;
}
export interface ListRead {
  army: string | null;
  units: ListUnit[];
}

/** Adds `count` of `name`, summing a name already there; "Warlord" isn't wargear. */
function addWargear(list: ListWargear[], name: string, count: number) {
  const clean = name.trim();
  if (clean === '' || /^warlord$/i.test(clean)) return;
  const found = list.find((w) => w.name === clean);
  if (found) found.count += count;
  else list.push({ name: clean, count });
}

const indent = (line: string) => line.length - line.trimStart().length;
/** `• 5x Name`, `5x Name`. */
const ITEM = /^(?:•\s*)?(\d+)x\s+(.+)$/;
const GW_UNIT = /^(.+?)\s*\((\d+)\s*(?:points|pts)\)$/i;

/**
 * GW app: `Name (N points)` units, bullet model lines, "Attached Unit" blocks. NewRecruit also
 * writes this layout (`(N pts)`, bullets at the left edge) under its `+` header.
 */
function gwApp(lines: string[]): ListUnit[] {
  // Units come after the battle size line ("Strike Force (2000 points)"), or NewRecruit's header.
  const sizeAt = Math.max(
    lines.findIndex((line) =>
      /^(?:Combat Patrol|Incursion|Strike Force|Onslaught)\s*\(/i.test(line.trim()),
    ),
    lines.findLastIndex((line) => line.startsWith('+')),
  );
  const units: ListUnit[] = [];
  /** The open "Attached Unit" block: each unit's index and role. */
  let block: { index: number; role: string }[] | null = null;
  const closeBlock = () => {
    const guard = block?.find((b) => b.role === 'bodyguard');
    for (const b of block ?? []) {
      const unit = units[b.index];
      if (guard && unit && b.role !== 'bodyguard') unit.attachedTo = guard.index;
    }
    block = null;
  };
  let unit: ListUnit | null = null;
  let group: ListModels | null = null;
  for (let i = sizeAt + 1; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = raw.trim();
    if (line === '') continue;
    if (/^Exported with/i.test(line)) break;
    if (/^Attached Unit \d+$/i.test(line)) {
      closeBlock();
      block = [];
      continue;
    }
    if (indent(raw) === 0 && /^[A-Z][A-Z &]+$/.test(line)) {
      // A section heading ("CHARACTERS") ends an attachment block.
      if (!/^ATTACHED UNITS$/.test(line)) closeBlock();
      unit = null;
      continue;
    }
    const header = indent(raw) === 0 ? GW_UNIT.exec(line) : null;
    if (header) {
      unit = { name: header[1] ?? '', points: Number(header[2]), groups: [], attachedTo: null };
      units.push(unit);
      group = null;
      continue;
    }
    if (unit === null) continue;
    const role = /^•\s*Attached as:\s*(Leader|Support|Bodyguard)/i.exec(line);
    if (role) {
      block?.push({ index: units.length - 1, role: (role[1] ?? '').toLowerCase() });
      continue;
    }
    if (/^•\s*(?:Enhancement:|Warlord$)/i.test(line)) continue;
    const item = ITEM.exec(line);
    if (item === null) continue;
    const count = Number(item[1]);
    const name = item[2] ?? '';
    const bulleted = line.startsWith('•') && indent(raw) <= 2;
    if (bulleted) {
      const next = lines.slice(i + 1).find((l) => l.trim() !== '') ?? '';
      if (indent(next) > indent(raw) && next.trim().startsWith('•')) {
        // A model line: its weapons follow, deeper.
        group = { name, count, wargear: [] };
        unit.groups.push(group);
        continue;
      }
      // A single model's wargear: one unnamed group.
      group = unit.groups.find((g) => g.name === null) ?? null;
      if (group === null) {
        group = { name: null, count: 1, wargear: [] };
        unit.groups.push(group);
      }
    }
    if (group) addWargear(group.wargear, name, count);
  }
  closeBlock();
  return units;
}

/** `A, B, 3 with C, D` → items before any "N with" (one each), then groups of N. */
function nrItems(text: string): ListWargear[] {
  const wargear: ListWargear[] = [];
  let count = 1;
  for (const part of text.split(/,\s*/)) {
    const withN = /^(\d+)\s+with\s+(.+)$/i.exec(part.trim());
    if (withN) {
      count = Number(withN[1]);
      addWargear(wargear, withN[2] ?? '', count);
    } else {
      addWargear(wargear, part, count);
    }
  }
  return wargear;
}

const NR_UNIT = /^(?:Char\d+:\s*)?(\d+)x\s+(.+?)\s*\((\d+)\s*pts\)(?::\s*(.*))?$/i;

/** NewRecruit: `Nx Name (P pts): wargear`, optional bullet model lines, "Attached to X[n]". */
function newRecruit(lines: string[]): ListUnit[] {
  const units: ListUnit[] = [];
  const attachments: { bodyguard: number; character: string; nth: number }[] = [];
  let unit: ListUnit | null = null;
  let group: ListModels | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '' || line.startsWith('+')) continue;
    const head = indent(raw) === 0 ? NR_UNIT.exec(line) : null;
    if (head) {
      const total = Number(head[1]);
      unit = { name: head[2] ?? '', points: Number(head[3]), groups: [], attachedTo: null };
      units.push(unit);
      group = null;
      const items = head[4]?.trim() ?? '';
      if (items !== '') unit.groups.push({ name: null, count: total, wargear: nrItems(items) });
      continue;
    }
    if (unit === null) continue;
    const attached = /^Attached to\s+(.+?)(?:\[(\d+)\])?$/i.exec(line);
    if (attached) {
      attachments.push({
        bodyguard: units.length - 1,
        character: attached[1] ?? '',
        nth: Number(attached[2] ?? '1'),
      });
      continue;
    }
    const model = /^•\s*(\d+)x\s+(.+?)(?::\s*(.*))?$/.exec(line);
    if (model) {
      const count = Number(model[1]);
      group = { name: model[2] ?? '', count, wargear: [] };
      unit.groups.push(group);
      for (const w of nrItems(model[3] ?? '')) addWargear(group.wargear, w.name, w.count);
      continue;
    }
    const withN = /^(\d+)\s+with\s+(.+)$/i.exec(line);
    if (withN && group) {
      for (const name of (withN[2] ?? '').split(/,\s*/)) {
        addWargear(group.wargear, name, Number(withN[1]));
      }
    }
  }
  // "Attached to Skorpekh Lord[2]" sits under the bodyguard: the second unit of that name attaches.
  for (const { bodyguard, character, nth } of attachments) {
    const named = units.flatMap((u, index) => (u.name === character ? [index] : []));
    const unitOf = units[named[nth - 1] ?? -1];
    if (unitOf) unitOf.attachedTo = bodyguard;
  }
  return units;
}

/** A list's units, read from the GW app or NewRecruit export; other text gives none. */
export function readListUnits(text: string): ListRead {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n');
  const army = parseArmyList(text).army;
  const oneLine = lines.some((line) => NR_UNIT.test(line.trim()));
  if (oneLine && lines.some((line) => /^\+\s*FACTION KEYWORD:/i.test(line))) {
    return { army, units: newRecruit(lines) };
  }
  return { army, units: gwApp(lines) };
}
