import { canonicalArmy } from './factions';

/** One BattleScribe node, as far as reading detachments needs. */
interface Node {
  id?: string;
  name?: string;
  hidden?: boolean;
  library?: boolean;
  targetId?: string;
  importRootEntries?: boolean;
  modifiers?: Modifier[];
  selectionEntries?: Node[];
  selectionEntryGroups?: Node[];
  entryLinks?: Node[];
  catalogueLinks?: Node[];
  sharedSelectionEntries?: Node[];
  sharedSelectionEntryGroups?: Node[];
}
interface Condition {
  childId?: string;
  scope?: string;
  type?: string;
}
interface Modifier {
  field?: string;
  type?: string;
  value?: unknown;
  conditions?: Condition[];
  conditionGroups?: { conditions?: Condition[] }[];
}

export interface BsdataParse {
  /** App faction → its detachments (A→Z). */
  factions: Map<string, string[]>;
  /** Catalogue names with detachments whose faction isn't known to the app. */
  unknownCatalogues: string[];
}

const SPACE_MARINES_FAMILY = 'Imperium - Adeptus Astartes';
const isDetachmentNode = (name: string | undefined) =>
  name === 'Detachment' || name === 'Detachments';
const family = (name: string) => name.split(' - ').slice(0, -1).join(' - ');
const lastPart = (name: string) => name.split(' - ').at(-1) ?? name;
const asNode = (value: unknown): Node | null =>
  typeof value === 'object' && value !== null ? value : null;

/** Which catalogues an entry is only for, and which it's hidden for (BattleScribe modifiers). */
function visibility(entry: Node): { only: string[]; never: string[] } {
  const only: string[] = [];
  const never: string[] = [];
  for (const modifier of entry.modifiers ?? []) {
    if (modifier.field !== 'hidden' || modifier.type !== 'set') continue;
    if (modifier.value !== true && modifier.value !== 'true') continue;
    const conditions = [
      ...(modifier.conditions ?? []),
      ...(modifier.conditionGroups ?? []).flatMap((group) => group.conditions ?? []),
    ];
    for (const condition of conditions) {
      if (condition.scope !== 'primary-catalogue' || condition.childId === undefined) continue;
      if (condition.type === 'notInstanceOf') only.push(condition.childId);
      if (condition.type === 'instanceOf') never.push(condition.childId);
    }
  }
  return { only, never };
}

/** Each faction's detachments, read from all of BSData's catalogue files together. */
export function parseBsdataCatalogues(files: unknown[]): BsdataParse {
  const catalogues: Node[] = [];
  const index = new Map<string, Node>();
  for (const file of files) {
    const root =
      typeof file === 'object' && file !== null
        ? (file as { catalogue?: unknown; gameSystem?: unknown })
        : null;
    const catalogue = asNode(root?.catalogue);
    const node = catalogue ?? asNode(root?.gameSystem);
    if (node === null) continue;
    for (const shared of [
      ...(node.sharedSelectionEntries ?? []),
      ...(node.sharedSelectionEntryGroups ?? []),
    ]) {
      if (shared.id !== undefined) index.set(shared.id, shared);
    }
    if (catalogue !== null) catalogues.push(catalogue);
  }
  const byId = new Map(catalogues.flatMap((c) => (c.id === undefined ? [] : [[c.id, c] as const])));

  const collect = (node: Node, seen: Set<Node>): Node[] => {
    if (seen.has(node)) return [];
    seen.add(node);
    const found = isDetachmentNode(node.name) ? [...(node.selectionEntries ?? [])] : [];
    for (const child of [...(node.selectionEntryGroups ?? []), ...(node.entryLinks ?? [])]) {
      if (!isDetachmentNode(child.name)) continue;
      const target = child.targetId === undefined ? child : (index.get(child.targetId) ?? child);
      found.push(...collect(target, seen));
    }
    return found;
  };

  const detachmentsOf = (catalogue: Node): string[] => {
    const name = catalogue.name ?? '';
    const ownLinks = (catalogue.entryLinks ?? []).filter((link) => isDetachmentNode(link.name));
    const roots =
      ownLinks.length > 0
        ? [catalogue]
        : (catalogue.catalogueLinks ?? []).flatMap((link) => {
            const linked = link.targetId === undefined ? undefined : byId.get(link.targetId);
            return link.importRootEntries === true &&
              linked !== undefined &&
              linked.library !== true &&
              family(linked.name ?? '') === family(name)
              ? [linked]
              : [];
          });
    const names = new Set<string>();
    for (const root of roots) {
      for (const link of (root.entryLinks ?? []).filter((l) => isDetachmentNode(l.name))) {
        const target = link.targetId === undefined ? undefined : index.get(link.targetId);
        if (target === undefined) continue;
        for (const entry of collect(target, new Set())) {
          const { only, never } = visibility(entry);
          if (entry.hidden === true || entry.name === undefined) continue;
          if (only.length > 0 && !only.includes(catalogue.id ?? '')) continue;
          if (never.includes(catalogue.id ?? '')) continue;
          names.add(entry.name);
        }
      }
    }
    return [...names];
  };

  const factions = new Map<string, Set<string>>();
  const unknownCatalogues: string[] = [];
  const add = (faction: string, names: string[]) => {
    const set = factions.get(faction) ?? new Set<string>();
    names.forEach((n) => set.add(n));
    factions.set(faction, set);
  };
  const spaceMarines = canonicalArmy('Space Marines');
  for (const catalogue of catalogues) {
    if (catalogue.library === true || catalogue.name === undefined) continue;
    const names = detachmentsOf(catalogue);
    if (names.length === 0) continue;
    const faction = canonicalArmy(lastPart(catalogue.name));
    if (faction === null) {
      unknownCatalogues.push(catalogue.name);
      continue;
    }
    add(faction, names);
    if (family(catalogue.name) === SPACE_MARINES_FAMILY && spaceMarines !== null) {
      add(spaceMarines, names);
    }
  }
  return {
    factions: new Map(
      [...factions].map(([faction, names]) => [
        faction,
        [...names].sort((a, b) => a.localeCompare(b)),
      ]),
    ),
    unknownCatalogues: unknownCatalogues.sort((a, b) => a.localeCompare(b)),
  };
}

/** Lower-case, no accents, apostrophes or hyphens, single spaces: names compare in this form. */
export const looseDetachmentKey = (name: string) => loose(name);
const loose = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`-]/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/ s\b/g, 's');

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length] ?? 0;
}

/**
 * The candidate a list's detachment name means: the same name, the same ignoring case, spacing,
 * accents, apostrophes and hyphens, the last words of exactly one candidate ("Oathband"), or
 * (8+ letters) at most 2 letters off with a single closest candidate; else null.
 */
export function matchDetachment(
  name: string,
  candidates: readonly string[],
  /** `fuzzy: false`: exact and loose matches only (no last words, no typos). */
  options: { fuzzy?: boolean } = {},
): string | null {
  if (candidates.includes(name)) return name;
  const key = loose(name);
  if (key === '') return null;
  const exactLoose = candidates.filter((candidate) => loose(candidate) === key);
  if (exactLoose.length === 1) return exactLoose[0] ?? null;
  if (options.fuzzy === false) return null;
  const letters = key.replace(/ /g, '').length;
  if (letters >= 6) {
    const ending = candidates.filter((candidate) => loose(candidate).endsWith(` ${key}`));
    if (ending.length === 1) return ending[0] ?? null;
  }
  if (letters < 8) return null;
  const scored = candidates
    .map((candidate) => ({ candidate, d: distance(key, loose(candidate)) }))
    .filter((entry) => entry.d <= 2)
    .sort((a, b) => a.d - b.d);
  const [best, next] = scored;
  if (best === undefined || next?.d === best.d) return null;
  return best.candidate;
}
