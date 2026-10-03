# BSData Detachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read each faction's detachments from BSData's 11th-edition data daily, and use them for
known detachments, automatic name matching and flagging detachments that don't belong to a
list's army.

**Architecture:** A pure shared parser turns all BSData catalogues into faction → detachments; a
pure matcher maps list names to BSData spellings. The API syncs from GitHub daily through an
injectable client, stores pairs, and feeds them into list tidying, Meta and Settings.

**Tech Stack:** pnpm monorepo; Hono + Drizzle + Postgres/PGlite (`apps/api`); React 19 + Mantine 9

- TanStack Query (`apps/web`); Zod 4 (`packages/shared`); Vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-bsdata-detachments-design.md`

## Global Constraints

- Source: `BSData/wh40k-11e`, branch `main`; tree via
  `https://api.github.com/repos/BSData/wh40k-11e/git/trees/main`, files via
  `https://raw.githubusercontent.com/BSData/wh40k-11e/<commit-sha>/<path>`; unauthenticated, one
  request at a time, 30 s timeout, files over 20 MB rejected.
- Daily: a run when the last successful check is 24 h old or more (checked hourly) and on demand
  (admin when accounts are on).
- No BCP requests; no network in tests (fake client, synthetic catalogues).
- Hand links and "Not English" marks always win over automatic matches.
- A failed or empty parse keeps the previous data.
- Commands: `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`; tests
  `pnpm vitest run --project api|web|shared <path>`; gate `pnpm check`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings made while planning (validated on the real repository, 46 files, 2026-10-03)

The spec's reading rule ("first object named Detachment") misses most factions. A prototype over
all 46 files established this rule instead, which yields detachments for every faction (e.g.
Necrons 12, Orks 17, Tyranids 13, Genestealer Cults 11, Drukhari 9, Aeldari 15, Blood Angels 23):

1. Index every `sharedSelectionEntries` and `sharedSelectionEntryGroups` item of every catalogue
   and of the game system (`{ gameSystem: … }`) by `id`.
2. For a non-library catalogue C: its **roots** are C itself if C has a root `entryLinks` item
   named "Detachment" or "Detachments"; otherwise the catalogues C links with
   `importRootEntries: true` that are not libraries and share C's name family (the name without
   its last `-` part, e.g. "Imperium - Adeptus Astartes").
3. From each root's `entryLinks` named Detachment(s), resolve the target and collect entries:
   a node named Detachment(s) with `selectionEntries` contributes them; its `selectionEntryGroups`
   and `entryLinks` named Detachment(s) are followed (targets through the index), recursively.
4. An entry counts for C unless it is `hidden`, or has a modifier `{field: 'hidden', type: 'set',
value: true}` whose conditions (direct or in condition groups) with `scope:
'primary-catalogue'` say `notInstanceOf X` with X ≠ C.id (only for X) or `instanceOf C.id`
   (not for C).
5. Faction: `canonicalArmy` of the last `-` part of C's name. "Space Marines (Astartes)" also
   takes every detachment of every catalogue in the "Imperium - Adeptus Astartes" family (BCP
   counts some chapter players as Space Marines). New aliases: "agents of the imperium" →
   Imperial Agents.

Matcher addition: after loose matching, a name that equals the last words of exactly one
candidate matches it ("Oathband" → "Needgaârd Oathband", 45 local lists). Typo matching follows.

Other rulings: synthetic catalogues in tests (no BSData files committed); the tree check time is
stored in `app_settings` key `bsdataCheckedAt`; Space Marines family rule applies to wrong pairs
too.

## Review Focus

1. A list whose army is a chapter registered as Space Marines with a chapter detachment must not
   be flagged (Task 1 test "Space Marines takes every Adeptus Astartes detachment").
2. GitHub unreachable or a 404 for one file: the previous data stays and the status shows the
   error (Task 4 test "keeps old data when a file fails").
3. BSData renames a detachment: old stored pairs for that faction are replaced, not accumulated
   (Task 4 test "replaces a faction's detachments with the new parse").
4. A hand link to a name that BSData doesn't list must not be flagged as a wrong pair when the
   target is in BSData (Task 7 test "a linked name counts as its target").
5. A list with no readable army and no BCP faction is never flagged (Task 7 test "no army, no
   flag").

---

### Task 1: Read detachments from BSData catalogues (shared)

**Files:**

- Create: `packages/shared/src/bsdata.ts`, `packages/shared/src/bsdata.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './bsdata';`),
  `packages/shared/src/factions.ts` (ALIASES: `'agents of the imperium': 'Imperial Agents',`)

**Interfaces:**

- Produces:

```ts
export interface BsdataParse {
  /** App faction → its detachments (A→Z). */
  factions: Map<string, string[]>;
  /** Catalogue names with detachments whose faction isn't known to the app. */
  unknownCatalogues: string[];
}
export function parseBsdataCatalogues(files: unknown[]): BsdataParse;
```

- [ ] **Step 1: Failing tests** — `bsdata.test.ts` with small synthetic catalogues that mirror the
      real structure:

```ts
import { describe, expect, it } from 'vitest';
import { parseBsdataCatalogues } from './bsdata';

const entry = (name: string, modifiers?: unknown[]) => ({ name, id: `e-${name}`, modifiers });
const hiddenUnless = (catalogueId: string) => ({
  field: 'hidden',
  type: 'set',
  value: true,
  conditions: [{ childId: catalogueId, scope: 'primary-catalogue', type: 'notInstanceOf' }],
});
const hiddenFor = (catalogueId: string) => ({
  field: 'hidden',
  type: 'set',
  value: true,
  conditions: [{ childId: catalogueId, scope: 'primary-catalogue', type: 'instanceOf' }],
});

/** A catalogue whose root link goes entry → group → detachments (as Orks does). */
const catalogue = (id: string, name: string, detachments: unknown[], extra: object = {}) => ({
  catalogue: {
    id,
    name,
    library: false,
    entryLinks: [{ name: 'Detachment', type: 'selectionEntry', targetId: `${id}-entry` }],
    sharedSelectionEntries: [
      {
        id: `${id}-entry`,
        name: 'Detachment',
        entryLinks: [{ name: 'Detachment', type: 'selectionEntryGroup', targetId: `${id}-group` }],
      },
    ],
    sharedSelectionEntryGroups: [
      { id: `${id}-group`, name: 'Detachment', selectionEntries: detachments },
    ],
    ...extra,
  },
});

describe('parseBsdataCatalogues', () => {
  it('reads a faction’s detachments through its links', () => {
    const { factions } = parseBsdataCatalogues([
      catalogue('nec', 'Xenos - Necrons', [entry('Awakened Dynasty'), entry('Canoptek Court')]),
    ]);
    expect(factions.get('Necrons')).toEqual(['Awakened Dynasty', 'Canoptek Court']);
  });

  it('reads detachments kept in a shared library, minus those hidden for the faction', () => {
    const library = {
      catalogue: {
        id: 'lib',
        name: 'Aeldari - Aeldari Library',
        library: true,
        sharedSelectionEntries: [
          {
            id: 'lib-entry',
            name: 'Detachments',
            selectionEntryGroups: [
              {
                name: 'Detachment',
                selectionEntries: [
                  entry('Warhost', [hiddenFor('dru')]),
                  entry('Realspace Raiders', [hiddenUnless('dru')]),
                ],
              },
            ],
          },
        ],
      },
    };
    const link = (id: string, name: string) => ({
      catalogue: {
        id,
        name,
        library: false,
        entryLinks: [{ name: 'Detachment', type: 'selectionEntry', targetId: 'lib-entry' }],
      },
    });
    const { factions } = parseBsdataCatalogues([
      library,
      link('ael', 'Xenos - Aeldari'),
      link('dru', 'Xenos - Drukhari'),
    ]);
    expect(factions.get('Aeldari')).toEqual(['Warhost']);
    expect(factions.get('Drukhari')).toEqual(['Realspace Raiders']);
  });

  it('gives chapters their own detachments and the open ones of Space Marines', () => {
    const sm = catalogue('sm', 'Imperium - Adeptus Astartes - Space Marines', [
      entry('Gladius Task Force'),
      entry('Rage-Cursed Onslaught', [hiddenUnless('ba')]),
    ]);
    const chapter = (id: string, name: string) => ({
      catalogue: {
        id,
        name,
        library: false,
        catalogueLinks: [{ targetId: 'sm', importRootEntries: true }],
      },
    });
    const { factions } = parseBsdataCatalogues([
      sm,
      chapter('ba', 'Imperium - Adeptus Astartes - Blood Angels'),
      chapter('um', 'Imperium - Adeptus Astartes - Ultramarines'),
    ]);
    expect(factions.get('Blood Angels')).toEqual(['Gladius Task Force', 'Rage-Cursed Onslaught']);
    // Space Marines takes every Adeptus Astartes detachment (BCP counts some chapters there).
    expect(factions.get('Space Marines (Astartes)')).toEqual([
      'Gladius Task Force',
      'Rage-Cursed Onslaught',
    ]);
  });

  it('borrows only from the same family, and leaves out libraries and hidden entries', () => {
    const agents = catalogue('ag', 'Imperium - Agents of the Imperium', [
      entry('Imperialis Fleet'),
    ]);
    const custodes = catalogue('cu', 'Imperium - Adeptus Custodes', [
      entry('Shield Host'),
      { ...entry('Old Host'), hidden: true },
    ]);
    custodes.catalogue = {
      ...custodes.catalogue,
      catalogueLinks: [{ targetId: 'ag', importRootEntries: true }],
    } as typeof custodes.catalogue;
    const { factions } = parseBsdataCatalogues([agents, custodes]);
    expect(factions.get('Adeptus Custodes')).toEqual(['Shield Host']);
    expect(factions.get('Imperial Agents')).toEqual(['Imperialis Fleet']);
  });

  it('lists catalogues with detachments whose faction it doesn’t know, and ignores bad input', () => {
    const result = parseBsdataCatalogues([
      catalogue('x', 'Xenos - Hrud', [entry('Warren Host')]),
      { nonsense: true },
      null,
    ]);
    expect(result.unknownCatalogues).toEqual(['Xenos - Hrud']);
    expect(result.factions.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run --project shared packages/shared/src/bsdata.test.ts` —
      Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `bsdata.ts`:

```ts
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
  typeof value === 'object' && value !== null ? (value as Node) : null;

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
    const root = asNode(file);
    const node =
      asNode(root?.['catalogue' as keyof Node]) ?? asNode(root?.['gameSystem' as keyof Node]);
    if (node === null) continue;
    for (const shared of [
      ...(node.sharedSelectionEntries ?? []),
      ...(node.sharedSelectionEntryGroups ?? []),
    ]) {
      if (shared.id !== undefined) index.set(shared.id, shared);
    }
    if ('catalogue' in (root ?? {})) catalogues.push(node);
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
```

Add the alias in `factions.ts` ALIASES (English variants block):
`'agents of the imperium': 'Imperial Agents',`.

- [ ] **Step 4: Run** the test, then `pnpm vitest run --project shared` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: read each faction's detachments from BSData catalogues`.

### Task 2: Match list names to BSData detachments (shared)

**Files:**

- Modify: `packages/shared/src/bsdata.ts`, `packages/shared/src/bsdata.test.ts`

**Interfaces:**

- Produces: `matchDetachment(name: string, candidates: readonly string[]): string | null`.

- [ ] **Step 1: Failing tests** (append):

```ts
describe('matchDetachment', () => {
  const candidates = ['Needgaârd Oathband', 'Hearthband', "The Phaeron's Armoury", 'War Horde'];

  it('matches exactly, then ignoring case, spacing, accents, apostrophes and hyphens', () => {
    expect(matchDetachment('Hearthband', candidates)).toBe('Hearthband');
    expect(matchDetachment('needgaard  oathband', candidates)).toBe('Needgaârd Oathband');
    expect(matchDetachment('The Phaerons Armoury', candidates)).toBe("The Phaeron's Armoury");
    expect(matchDetachment('War-Horde', candidates)).toBe('War Horde');
  });

  it('matches a short name that ends exactly one candidate', () => {
    expect(matchDetachment('Oathband', candidates)).toBe('Needgaârd Oathband');
    expect(matchDetachment('Band', ['Hearthband', 'Oath Band', 'War Band'])).toBeNull();
  });

  it('allows up to 2 letters off on names of 8+ letters, only with one clear match', () => {
    expect(matchDetachment('Hearthbnad', candidates)).toBe('Hearthband');
    expect(matchDetachment('Wor Hord', candidates)).toBeNull(); // short: no typo matching
    expect(matchDetachment('Blood Legion', ['Blood Legions', 'Blood Legian'])).toBeNull();
    expect(matchDetachment('Something Else', candidates)).toBeNull();
  });
});
```

(Import `matchDetachment` alongside `parseBsdataCatalogues`.)

- [ ] **Step 2: Run** — Expected: FAIL (`matchDetachment` not exported).
- [ ] **Step 3: Implement** (append to `bsdata.ts`):

```ts
/** Lower-case, no accents, apostrophes or hyphens, single spaces. */
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
export function matchDetachment(name: string, candidates: readonly string[]): string | null {
  if (candidates.includes(name)) return name;
  const key = loose(name);
  if (key === '') return null;
  const exactLoose = candidates.filter((candidate) => loose(candidate) === key);
  if (exactLoose.length === 1) return exactLoose[0] ?? null;
  const ending = candidates.filter((candidate) => loose(candidate).endsWith(` ${key}`));
  if (ending.length === 1) return ending[0] ?? null;
  if (key.replace(/ /g, '').length < 8) return null;
  const scored = candidates
    .map((candidate) => ({ candidate, d: distance(key, loose(candidate)) }))
    .filter((entry) => entry.d <= 2)
    .sort((a, b) => a.d - b.d);
  const [best, next] = scored;
  if (best === undefined || (next !== undefined && next.d === best.d)) return null;
  return best.candidate;
}
```

Note: the apostrophe is replaced by a space and `" s"` is folded back to `"s"`, so
"Phaeron's" and "Phaerons" compare equal.

- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat: match list detachment names to BSData's spellings`.

### Task 3: Tables for BSData detachments, files and kept pairs

**Files:**

- Modify: `apps/api/src/db/schema.ts`
- Create: migration via `pnpm --filter @bcp/api exec drizzle-kit generate --name bsdata`
- Test: covered by Task 4's tests (tables are exercised there)

**Interfaces:**

- Produces: `bsdataDetachments` (`faction` text, `name` text, PK both), `bsdataFiles` (`path`
  text PK, `sha` text, `checkedAt` timestamptz, `error` text nullable), `detachmentKeeps`
  (`faction` text, `nameKey` text, `name` text, PK faction + nameKey, `createdAt`).

- [ ] **Step 1: Add the tables** to `schema.ts` (after `detachmentLinks`):

```ts
/** Each faction's detachments, read from BSData (replaced per faction on every sync). */
export const bsdataDetachments = pgTable(
  'bsdata_detachments',
  { faction: text('faction').notNull(), name: text('name').notNull() },
  (t) => [primaryKey({ columns: [t.faction, t.name] })],
);

/** BSData files read, with the version read (git blob sha) and the last error. */
export const bsdataFiles = pgTable('bsdata_files', {
  path: text('path').primaryKey(),
  sha: text('sha').notNull(),
  checkedAt: timestamptz('checked_at').notNull().defaultNow(),
  error: text('error'),
});

/** A detachment kept for a faction although BSData doesn't list it there ("Keep anyway"). */
export const detachmentKeeps = pgTable(
  'detachment_keeps',
  {
    faction: text('faction').notNull(),
    nameKey: text('name_key').notNull(),
    name: text('name').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.faction, t.nameKey] })],
);
```

(Import `primaryKey` from `drizzle-orm/pg-core` if it isn't already.)

- [ ] **Step 2: Generate** the migration — Expected: `0013_bsdata.sql` with three `CREATE TABLE`.
- [ ] **Step 3: Run** `pnpm vitest run --project api apps/api/src/repo/app-settings.test.ts` —
      Expected: PASS (migrations apply on PGlite).
- [ ] **Step 4: Commit** `feat: tables for BSData detachments, files and kept pairs`.

### Task 4: Sync from GitHub

**Files:**

- Create: `apps/api/src/bsdata/client.ts`, `apps/api/src/repo/bsdata.ts`,
  `apps/api/src/repo/bsdata.test.ts`

**Interfaces:**

- Consumes: `parseBsdataCatalogues` (Task 1); tables (Task 3).
- Produces:

```ts
// client.ts
export interface BsdataTreeFile {
  path: string;
  sha: string;
}
export interface BsdataClient {
  /** The commit sha of main and its root *.json files. */
  tree(): Promise<{ commit: string; files: BsdataTreeFile[] }>;
  /** A file's parsed JSON at that commit. */
  file(commit: string, path: string): Promise<unknown>;
}
export function httpBsdataClient(options?: { timeoutMs?: number; maxBytes?: number }): BsdataClient;

// repo/bsdata.ts
export interface BsdataStatus {
  checkedAt: string | null;
  factions: { faction: string; detachments: number }[];
  errors: { path: string; error: string }[];
}
export async function syncBsdata(db: Db, client: BsdataClient, now: Date): Promise<BsdataStatus>;
export async function bsdataStatus(db: Db): Promise<BsdataStatus>;
export async function bsdataDue(db: Db, now: Date): Promise<boolean>; // 24 h since checkedAt
/** Faction → its BSData detachments; a faction missing here isn't covered. */
export async function bsdataByFaction(db: Db): Promise<Map<string, string[]>>;
```

- [ ] **Step 1: Failing tests** — `repo/bsdata.test.ts` with a fake client built from the
      synthetic `catalogue(...)` helper (copy it from Task 1's test into the file):

```ts
const fakeClient = (files: Record<string, { sha: string; body: unknown }>) => {
  const fetched: string[] = [];
  const client: BsdataClient = {
    tree: () =>
      Promise.resolve({
        commit: 'c1',
        files: Object.entries(files).map(([path, { sha }]) => ({ path, sha })),
      }),
    file: (_commit, path) => {
      fetched.push(path);
      const file = files[path];
      return file === undefined || file.body instanceof Error
        ? Promise.reject(file?.body ?? new Error('404'))
        : Promise.resolve(file.body);
    },
  };
  return { client, fetched };
};
```

Tests (each against a fresh PGlite):

- **stores each faction's detachments and the status**: Necrons file → `bsdataByFaction` has
  Necrons → ['Awakened Dynasty', 'Canoptek Court']; status `checkedAt` is now; no errors.
- **downloads only changed files**: second sync with the same shas fetches nothing new
  (`fetched` length unchanged) and keeps the data; a changed sha fetches that file again.
- **keeps old data when a file fails**: after a good sync, a sync where the Necrons file
  rejects keeps Necrons' detachments and lists `{ path: 'Necrons.json', error: '404' }`.
- **replaces a faction's detachments with the new parse**: a new sha where Canoptek Court is
  renamed Canoptek Conclave → Necrons is exactly ['Awakened Dynasty', 'Canoptek Conclave'].
- **keeps the old list when a file parses to nothing**: a new sha with no detachments keeps the
  old Necrons list and records the error "no detachments found".
- **is due after 24 hours**: `bsdataDue` true before any sync, false right after, true 24 h
  later.
- [ ] **Step 2: Run** `pnpm vitest run --project api apps/api/src/repo/bsdata.test.ts` —
      Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** `client.ts`:

```ts
const TREE = 'https://api.github.com/repos/BSData/wh40k-11e/git/trees/main';
const RAW = 'https://raw.githubusercontent.com/BSData/wh40k-11e';

/** Root *.json files of BSData's 11th edition repository, read over HTTPS without a token. */
export function httpBsdataClient(
  options: { timeoutMs?: number; maxBytes?: number } = {},
): BsdataClient {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBytes = options.maxBytes ?? 20 * 1024 * 1024;
  const get = async (url: string) => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json', 'user-agent': 'bcp-analyzer' },
    });
    if (!response.ok) throw new Error(`GitHub answered ${String(response.status)}`);
    const text = await response.text();
    if (text.length > maxBytes) throw new Error('File too large');
    return JSON.parse(text) as unknown;
  };
  return {
    async tree() {
      const body = (await get(TREE)) as {
        sha?: string;
        tree?: { path?: string; sha?: string; type?: string }[];
      };
      if (typeof body.sha !== 'string' || !Array.isArray(body.tree)) {
        throw new Error('Unexpected answer from GitHub');
      }
      return {
        commit: body.sha,
        files: body.tree.flatMap((item) =>
          item.type === 'blob' &&
          typeof item.path === 'string' &&
          typeof item.sha === 'string' &&
          item.path.endsWith('.json') &&
          !item.path.includes('/')
            ? [{ path: item.path, sha: item.sha }]
            : [],
        ),
      };
    },
    file: (commit, path) => get(`${RAW}/${commit}/${encodeURIComponent(path)}`),
  };
}
```

`repo/bsdata.ts`: `syncBsdata` reads the tree; for each file whose sha differs from
`bsdataFiles`, downloads it (one at a time), keeping the parsed JSON in memory; files whose sha
is unchanged are downloaded too **only if** any file changed (the parser needs every catalogue
together for links) — so a no-change run downloads nothing, a change run downloads all (~47 MB,
once a day at most). Parse with `parseBsdataCatalogues`; for each parsed faction with at least
one detachment, replace its rows in `bsdataDetachments` (delete + insert in a transaction);
factions that parse to nothing keep their rows. Upsert each file's sha, `checkedAt`, and
`error` (`null` on success, the message on failure — a failed file keeps its old sha so it is
retried). If the parse yields no detachments at all while rows exist, keep everything and set
the error "no detachments found" on every changed file. Store `bsdataCheckedAt` in
`app_settings` (ISO string) after a tree check that didn't throw. `bsdataStatus` returns
`checkedAt` from `app_settings`, faction counts (A→Z) and files with errors. `bsdataDue` is
true when `bsdataCheckedAt` is missing or ≥ 24 h before `now`.

- [ ] **Step 4: Run** the tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat: sync BSData detachments from GitHub, keeping old data on errors`.

### Task 5: BSData routes and the daily timer

**Files:**

- Create: `apps/api/src/routes/bsdata.ts`, `apps/api/src/routes/bsdata.test.ts`
- Modify: `apps/api/src/app.ts` (deps gain `bsdata?: BsdataClient`; register routes),
  `apps/api/src/main.ts` (client + hourly timer), `packages/shared/src/api.ts`
  (`BsdataStatusSchema`)

**Interfaces:**

- Consumes: Task 4.
- Produces: `GET /api/bsdata` → `BsdataStatus`; `POST /api/bsdata/refresh` → `BsdataStatus`
  (403 for non-admins when accounts are on; 503 `{ code: 'BSDATA_UNAVAILABLE' }`-style error via
  `AppError` when no client is configured).

- [ ] **Step 1: Failing route tests** (createApp as in `routes/meta.test.ts`, with
      `bsdata: fakeClient(...)` from Task 4): GET answers `{ checkedAt: null, factions: [], errors:
[] }` before a sync; POST refresh stores and answers Necrons with 2 detachments.
- [ ] **Step 2: Run** — Expected: FAIL (404).
- [ ] **Step 3: Implement** the routes like `detachmentLinkRoutes` (same `adminOnly` check);
      `BsdataStatusSchema` in shared:

```ts
export const BsdataStatusSchema = z.object({
  checkedAt: z.iso.datetime().nullable(),
  factions: z.array(z.object({ faction: z.string(), detachments: z.number().int() })),
  errors: z.array(z.object({ path: z.string(), error: z.string() })),
});
export type BsdataStatus = z.infer<typeof BsdataStatusSchema>;
```

(Use this type in `repo/bsdata.ts` instead of its local interface.) In `main.ts`, after the
account backfill: `const bsdata = httpBsdataClient();`, pass it to `createApp`, and start

```ts
const syncBsdataIfDue = async () => {
  try {
    if (await bsdataDue(database.db, new Date())) {
      await syncBsdata(database.db, bsdata, new Date());
      await tidyDetachments(database.db);
    }
  } catch (error) {
    logger.warn({ err: error }, 'BSData sync failed; will try again');
  }
};
void syncBsdataIfDue();
const bsdataTimer = setInterval(() => void syncBsdataIfDue(), 60 * 60 * 1000);
```

and `clearInterval(bsdataTimer)` in the shutdown handler. The refresh route also calls
`tidyDetachments` after syncing.

- [ ] **Step 4: Run** the tests, then `pnpm vitest run --project api` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: BSData status and refresh routes, synced daily`.

### Task 6: Auto-match during list tidying

**Files:**

- Modify: `apps/api/src/repo/lists.ts` (vocabulary, `tidy`, `sourceRows`, `saveArmyList`,
  `parsedColumns`, `tidyDetachments`)
- Test: `apps/api/src/repo/lists.test.ts`

**Interfaces:**

- Consumes: `matchDetachment` (Task 2), `bsdataByFaction` (Task 4).
- Produces: `DetachmentVocabulary.bsdata: Map<string, string[]>` and `bsdataAll: string[]`;
  `tidy(detachments, vocabulary, bcpDetachment, army: string | null)`.

- [ ] **Step 1: Failing tests** in `lists.test.ts` (use `storeList`/`gwList` helpers and insert
      rows into `bsdataDetachments` directly):
  - **stores BSData's spelling**: BSData Orks has 'War Horde'; a list `gwList('Orks',
'War-horde')` stores `['War Horde']`.
  - **a hand link wins**: link 'War-horde' → 'Kult of Speed'; the list stores `['Kult of
Speed']`.
  - **an army without BSData data matches against all**: BSData only has Necrons 'Awakened
    Dynasty'; a list `gwList('Tyranids', 'awakened dynasty')` stores `['Awakened Dynasty']`.
  - **re-tidies stored lists after a sync**: store the list first, then add the BSData row and
    call `tidyDetachments(db)` — the stored detachments change to BSData's spelling.
- [ ] **Step 2: Run** `pnpm vitest run --project api apps/api/src/repo/lists.test.ts` — Expected:
      the new tests FAIL.
- [ ] **Step 3: Implement**:
  - `detachmentVocabulary` loads `bsdataByFaction(db)` into `bsdata`, sets `bsdataAll` (unique
    names), and adds every BSData name to `known` (so joined lines split on them).
  - `tidy(..., army)`: for each cleaned, split name: if `vocabulary.links` has its key → the link
    (as now); else translation or `canonicalDetachment(name)` → then
    `matchDetachment(result, candidates)` where `candidates` is
    `vocabulary.bsdata.get(army) ?? vocabulary.bsdataAll` when `army` is not null, else
    `vocabulary.bsdataAll`; a match is final (skip `spellings`); otherwise `spellings` as now.
  - `sourceRows` also selects the player's BCP faction (join `players` on `armyLists.playerId`).
  - The army passed is `parseArmyList(text).army ?? countedFaction(bcpFaction, null).faction`.
  - `saveArmyList` reads the player's faction (`select faction from players where id =
playerId`) for the same rule.
- [ ] **Step 4: Run** `pnpm vitest run --project api apps/api/src/repo` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: lists use BSData's spelling of their detachments`.

### Task 7: Wrong pairs in Meta and Settings, and Keep anyway

**Files:**

- Modify: `apps/api/src/repo/detachment-links.ts` (`wrongPairCheck`, `detachmentNames`,
  `keepDetachment`, `unkeepDetachment`), `apps/api/src/repo/meta.ts`,
  `apps/api/src/routes/detachment-links.ts`, `packages/shared/src/api.ts`
- Test: `apps/api/src/repo/detachment-links.test.ts`, `apps/api/src/repo/meta.test.ts`

**Interfaces:**

- Produces:

```ts
/** (army, detachment) → whether it's a wrong pair: army covered by BSData, name not in it, not kept. */
export async function wrongPairCheck(
  db: Db,
): Promise<(army: string | null, name: string) => boolean>;
export async function keepDetachment(db: Db, faction: string, name: string): Promise<void>;
export async function unkeepDetachment(db: Db, faction: string, name: string): Promise<void>;
```

`DetachmentNamesResponseSchema` gains:

```ts
  /** Factions BSData covers: their known detachments are BSData's. */
  bsdataFactions: z.array(z.string()),
  /** Detachments lists use for an army BSData covers but doesn't list them for. */
  wrong: z.array(
    z.object({
      faction: z.string(),
      name: z.string(),
      lists: z.number().int().nonnegative(),
      /** Factions BSData lists this detachment for. */
      bsdataFactions: z.array(z.string()),
    }),
  ),
  /** Pairs kept anyway. */
  kept: z.array(z.object({ faction: z.string(), name: z.string() })),
```

and each `targets` item gains `bsdata: z.boolean()` (BSData lists it for at least one of its
factions). Routes: `POST /api/detachments/keeps` body `{ faction, name }` and
`DELETE /api/detachments/keeps` body `{ faction, name }` (admin), both answering
`detachmentNames`.

- [ ] **Step 1: Failing tests**:
  - `detachment-links.test.ts`: with BSData rows (World Eaters: 'Berzerker Warband'), a World
    Eaters list with 'Cult of Blood' appears in `wrong` with `lists: 1` and `bsdataFactions: []`;
    after `keepDetachment(db, 'World Eaters', 'Cult of Blood')` it's gone from `wrong` and listed
    in `kept`; `bsdataFactions` includes 'World Eaters'; targets from BSData have `bsdata: true`.
  - **a linked name counts as its target**: link 'Gore Band' → 'Berzerker Warband'; a World
    Eaters list with 'Gore Band' isn't in `wrong`.
  - **no army, no flag**: `wrongPairCheck(db)` returns false for `(null, 'Anything')` and for an
    uncovered army.
  - `meta.test.ts`: with BSData Orks = ['War Horde'], an Orks player whose list says 'Wreckas'
    counts under the archetype with `detachments: null`; after keeping ('Orks', 'Wreckas') it
    counts under 'Wreckas'.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**:
  - `wrongPairCheck`: loads `bsdataByFaction` and keeps; returns `(army, name) =>
army !== null && covered.has(army) && !bsdata.get(army).includes(name) &&
!kept.has(`${army}\u0000${name.toLowerCase()}`)`. Names are compared after tidying (stored
    detachments are already BSData spellings or link targets).
  - `meta.ts` `loadMetaRows`: also select `parsedArmy` (already) and compute
    `army = row.parsedArmy ?? faction`; detachments become `[]` when any is foreign **or**
    `wrongPair(army, name)`.
  - `detachmentNames`: `bsdataFactions` = covered factions; for every stored list row
    (`storedRows`, army via `armyOf`), collect wrong pairs with counts of distinct players;
    `bsdataFactions` per wrong name = factions whose BSData list includes it; `kept` from the
    keeps table; targets: add every BSData (faction, name) to `targets` with `bsdata: true`
    (merge factions with BCP's), BCP-only targets `bsdata: false`.
  - `keepDetachment` upserts (faction, `name.toLowerCase()`, name); `unkeepDetachment` deletes.
- [ ] **Step 4: Run** `pnpm vitest run --project api` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: flag detachments outside their army's BSData list, with keep anyway`.

### Task 8: Settings: BSData card, known detachments, Not in this faction

**Files:**

- Create: `apps/web/src/features/settings/BsdataCard.tsx`,
  `apps/web/src/features/settings/BsdataCard.test.tsx`
- Modify: `apps/web/src/features/settings/DetachmentNamesCard.tsx` (+ its test),
  `apps/web/src/routes/settings.tsx` (BsdataCard in the left column after AutoFetchCard),
  `apps/web/src/features/settings/settings-queries.ts` or the card's query module (follow where
  `detachmentNames` is queried today)

**Interfaces:**

- Consumes: `BsdataStatusSchema`, the extended `DetachmentNamesResponse`.

- [ ] **Step 1: Failing tests**:
  - `BsdataCard.test.tsx`: with `GET /api/bsdata` answering `{ checkedAt:
'2026-10-03T10:00:00.000Z', factions: [{ faction: 'Necrons', detachments: 12 }, { faction:
'Orks', detachments: 17 }], errors: [{ path: 'Tyranids.json', error: 'GitHub answered 500' }]
}`, shows "2 factions · 29 detachments", the formatted check time, "Tyranids.json: GitHub
    answered 500", and a "Refresh" button that POSTs `/api/bsdata/refresh`; before any sync
    ("checkedAt": null) it says "Not read from BSData yet."
  - `DetachmentNamesCard.test.tsx`: for a covered faction the "Known … detachments" chips list
    only targets with `bsdata: true`; a "Not in this faction" section lists `wrong` rows as
    "Cult of Blood · World Eaters · 1 list" with "BSData has it for: …" (or "BSData doesn’t list
    it") and a "Keep anyway" button posting `{ faction, name }` to `/api/detachments/keeps`;
    kept pairs show with an "Undo" button sending DELETE.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the card (Mantine `Card` like `AutoFetchCard`: title "BSData",
      description "Each faction's detachments, from BSData's Warhammer 40,000 11th edition data
      (github.com/BSData/wh40k-11e). Checked daily.", stats line, errors list in red, Refresh button
      with loading state that invalidates the bsdata and detachment-names queries); in
      `DetachmentNamesCard`, compute known chips as `targets.filter(t => t.factions.includes(faction)
&& (!bsdataFactions.includes(faction) || t.bsdata))`, order the link picker's options with
      `bsdata` first, and add the "Not in this faction" section filtered by the selected faction
      (all when "All").
- [ ] **Step 4: Run** the web tests, then `pnpm check` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: Settings shows BSData, its detachments and pairs outside a faction`.

### Task 9: Real-data check

- [ ] **Step 1:** Start `api` against the local database (temporarily
      `DATABASE_URL=postgres://bcp:bcp@localhost:5434/bcp` in `.claude/launch.json`, restored right
      after start) and `web`. In Settings press Refresh (one real GitHub sync, ~47 MB).
- [ ] **Step 2:** Check: factions covered ≈ 30; Necrons known chips = 12 incl. Annihilation
      Legion; World Eaters list doesn't show under Genestealer Cult; "Oathband" lists now read
      "Needgaârd Oathband"; "Not in this faction" shows Chaos Cult under Chaos Daemons and More Dakka!
      under Orks.
- [ ] **Step 3:** Stop both servers.
