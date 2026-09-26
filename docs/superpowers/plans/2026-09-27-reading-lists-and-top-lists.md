# Reading Lists and Top Lists Implementation Plan (plan 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read army, detachments and disposition from stored army lists; show a guessed army (⚠) when BCP has none or only an allegiance; show and filter detachments (Players & lists, games, team page, matchups); and add a cross-event **Top lists** search (factions × X-n or better).

**Architecture:** A pure parser in `@bcp/shared` recognises the three list formats seen in stored lists. The API parses on save and re-parses old rows on startup, storing `parsed_army`, `detachments[]`, `parsed_disposition` and `parser_version` on `army_lists`. One shared resolver turns a player's BCP faction plus their parsed list into `{ faction, factionGuessed }`; every repo that returns players (event players, analysis, matchups, top lists) uses it. The web gets a `FactionText` component (⚠ with tooltip), a detachment column/filter, matchups detachment filter, and a new `/analysis/top-lists` page.

**Tech Stack:** as plans 1–6 (Hono, Drizzle/Postgres/PGlite, Zod 4, React 19 + Compiler, Mantine 9, TanStack Router/Query, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-26-lists-search-autofetch-design.md` (§3 and §4).

## Global Constraints

- Node 24, pnpm 12, TypeScript `~6.0.3`, Zod 4; strict ESLint `--max-warnings=0`, no `any`, no non-null assertions; Prettier.
- Tests next to the code; no network, PGlite only; never read, print or source `.env`; never commit `fixtures/bcp/recorded`.
- Parse only army, detachments and disposition — never units, points or wargear. Unknown format → `format: 'unknown'`, all fields null/empty; never guess from free text.
- Test fixtures of list text are **invented/anonymised** (no real player names).
- A guessed faction always carries `factionGuessed: true` and shows ⚠ with the tooltip "From the list — BCP has no army for this player" (keyboard reachable).
- Mantine 9.6.2; minimal dark theme; no manual memoisation; every view has loading/empty/error states; figures `className="numeric"`.
- Migrations via `pnpm --filter @bcp/api db:generate --name <name>`; build in a worktree (the user's dev server runs from the main checkout and applies migrations on restart).
- `pnpm vitest run --project api|web|shared <path>`, never bare `vitest`. Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Allegiance-only BCP factions** ("Chaos", "Xenos", "Imperium", "Forces of the Hive Mind", …) must be replaced by the parsed army when a list exists (guessed), and stay out of the matrix when not. _Task 2 test: resolveFaction + matchups repo._
2. **Stale list:** a stored list whose `list_id` no longer matches the player's current BCP list must not supply army/detachments. _Task 2 test: listEventPlayers with a replaced list._
3. **Detachment names containing "and"** (e.g. a name like "Blood and Iron") must not be split unless every part is a known single detachment. _Task 1 test._
4. **Localised GW-app lists** (Spanish "puntos de destacamento", "y" joiner, points with `2.000`/`2,000`) parse army/detachments; disposition kept only when it is one of the five known English names. _Task 1 test._
5. **Top lists with no faction filter over a wide range** must stay bounded: cap at 500 rows and say "Showing the first 500". _Task 4 test._

---

### Task 1: The list parser (shared)

**Files:**

- Create: `packages/shared/src/army-list-parser.ts`, `packages/shared/src/army-list-parser.test.ts`, `packages/shared/src/factions.ts`, `packages/shared/src/factions.test.ts`
- Modify: `packages/shared/src/index.ts` (export both), `packages/shared/src/analysis/matchups.ts` (use `isAllegiance` from `factions.ts` instead of its local `ALLEGIANCES`)

**Interfaces:**

- Produces:
  - `interface ParsedList { army: string | null; detachments: string[]; disposition: string | null; format: 'gw-app' | 'header' | 'template' | 'unknown' }`
  - `parseArmyList(text: string | null): ParsedList`
  - `PARSER_VERSION = 1`
  - `splitDetachments(detachments: string[], known: ReadonlySet<string>): string[]` — splits a single joined name (`A, B and C`, `A y B`, `A und B`, `A et B`, `A e B`) only when every part is in `known`; otherwise returns the input.
  - `KNOWN_DISPOSITIONS: readonly string[]` (the five English names) and `knownDisposition(value: string | null): string | null` (case-insensitive match → canonical English, else null).
  - `isAllegiance(faction: string): boolean` and `resolveFaction(bcpFaction: string | null, parsedArmy: string | null): { faction: string | null; factionGuessed: boolean }` — BCP faction wins unless it is null or an allegiance; then the parsed army (guessed) if any; else the BCP value unchanged, not guessed.

- [ ] **Step 1: Tests first** (`army-list-parser.test.ts`, one `it` per row of a table; all text invented):

```ts
const GW_EN = `Night Shift (1995 points)

Thousand Sons
Grand Coven (3 Detachment Points)
Priority Assets
Strike Force (2000 points)

Attached Units
Exalted Sorcerer (110 points)`;

const GW_SUBARMY = `Blue Boys (2,000 Points)

Space Marines
Ultramarines
Blade of Ultramar (3 Detachment Points)
Take and Hold
Strike Force (2,000 Points)`;

const GW_NO_TITLE_POINTS = `Anna Example

Adeptus Custodes
Lions of the Emperor (3 Detachment Points)
Take and Hold
Strike Force (2000 points)`;

const GW_PREAMBLE = `NOTE: trike attached to bikes

Speedy Bois (1995 points)

Orks
Flyboyz, Kult of Speed and Wreckas (3 Detachment Points)
Reconnaissance
Strike Force (2000 points)`;

const GW_ES = `La probada 2.0  (2000 puntos)

Legiones Daemónicas
Blood Legion y Cabalgata del Caos (3 puntos de destacamento)
Purgar al enemigo
Fuerza de Choque (2000 Points)`;

const HEADER = `+++++++++++++++++++++++++++
+ PLAYER NAME: Some Body
+ FACTION KEYWORD: Imperium - Grey Knights
+ DETACHMENT: Warpbane Task Force, Brotherhood Strike (Hallowed Ground)
+ FORCE DISPOSITION: Take and Hold
+ TOTAL ARMY POINTS: 2000pts
+++++++++++++++++++++++++++`;

const TEMPLATE = `Name: Some Body
Team: Example Team

Factions used:
Chaos Space Marines

Detachments used: Renegade Raiders

Disposition: Reconnaissance`;

const FREE = `Space Marines – Gladius Task Force

Captain (80 pts)
Intercessor Squad x10 (160 pts)`;
```

Expected:

| text                                                                 | army                  | detachments                                     | disposition                       | format   |
| -------------------------------------------------------------------- | --------------------- | ----------------------------------------------- | --------------------------------- | -------- |
| GW_EN                                                                | `Thousand Sons`       | `['Grand Coven']`                               | `Priority Assets`                 | gw-app   |
| GW_SUBARMY                                                           | `Space Marines`       | `['Blade of Ultramar']`                         | `Take and Hold`                   | gw-app   |
| GW_NO_TITLE_POINTS                                                   | `Adeptus Custodes`    | `['Lions of the Emperor']`                      | `Take and Hold`                   | gw-app   |
| GW_PREAMBLE                                                          | `Orks`                | `['Flyboyz, Kult of Speed and Wreckas']`        | `Reconnaissance`                  | gw-app   |
| GW_ES                                                                | `Legiones Daemónicas` | `['Blood Legion y Cabalgata del Caos']`         | `null` (not a known English name) | gw-app   |
| HEADER                                                               | `Grey Knights`        | `['Warpbane Task Force', 'Brotherhood Strike']` | `Take and Hold`                   | header   |
| TEMPLATE                                                             | `Chaos Space Marines` | `['Renegade Raiders']`                          | `Reconnaissance`                  | template |
| FREE (its "Captain (80 pts)" is not a detachment line), `''`, `null` | `null`                | `[]`                                            | `null`                            | unknown  |
| a template block followed by a GW-app block (both present)           | from the GW-app block | GW-app                                          | GW-app                            | gw-app   |

Plus `splitDetachments`:

- `['Flyboyz, Kult of Speed and Wreckas']` with known `{Flyboyz, Kult of Speed, Wreckas}` → the three names.
- `['Houndpack Lance and Hunting Warpack']` with known `{Houndpack Lance}` only → unchanged.
- `['Blood and Iron']` with known `{Blood, Iron… }` missing → unchanged; `['A y B']` with known `{A, B}` → `['A', 'B']`; already-split `['A', 'B']` → unchanged.

`factions.test.ts`: `isAllegiance` true for `Chaos`, `xenos`, `Forces of the Hive Mind`, false for `Chaos Daemons`, `Imperial Knights`; `resolveFaction('Orks', 'Necrons')` → Orks not guessed; `(null, 'Necrons')` → Necrons guessed; `('Chaos', 'Chaos Space Marines')` → CSM guessed; `('Chaos', null)` → Chaos not guessed; `(null, null)` → null not guessed.

Run: `pnpm vitest run --project shared src/army-list-parser src/factions` — expect FAIL (modules missing).

- [ ] **Step 2: Implement.**

```ts
// packages/shared/src/army-list-parser.ts
export const PARSER_VERSION = 1;

export interface ParsedList {
  army: string | null;
  detachments: string[];
  disposition: string | null;
  format: 'gw-app' | 'header' | 'template' | 'unknown';
}

export const KNOWN_DISPOSITIONS = [
  'Take and Hold',
  'Priority Assets',
  'Purge the Foe',
  'Reconnaissance',
  'Disruption',
] as const;

export function knownDisposition(value: string | null): string | null {
  if (value === null) return null;
  const wanted = value.trim().toLowerCase();
  return KNOWN_DISPOSITIONS.find((name) => name.toLowerCase() === wanted) ?? null;
}

const UNKNOWN: ParsedList = { army: null, detachments: [], disposition: null, format: 'unknown' };

/** `Name (3 Detachment Points)` / `(3 puntos de destacamento)`: a small number then words. */
const DETACHMENT_LINE = /^(.+?)\s*\((\d{1,2})\s+[^\d()]+\)\s*$/;
/** A title or battle-size line: `(2000 points)`, `(2,000 Points)`, `(2.000 puntos)`. */
const POINTS_LINE = /\(\s*\d[\d.,]{2,}\s*[^\d()]*\)\s*$/;

/** The detachment line is followed, within two lines, by the battle size ("Strike Force (2000 points)"),
 * which keeps a unit line like "Captain (80 pts)" in free text from matching. */
const isDetachmentAt = (lines: string[], i: number) =>
  DETACHMENT_LINE.test(lines[i] ?? '') &&
  [lines[i + 1], lines[i + 2]].some((line) => line !== undefined && POINTS_LINE.test(line));

function gwApp(lines: string[]): ParsedList | null {
  const at = lines.findIndex((_, i) => isDetachmentAt(lines, i));
  if (at < 1) return null;
  // The contiguous non-empty block ending at the detachment line: [title?] army [sub-army].
  let start = at;
  while (start > 0 && lines[start - 1]?.trim() !== '') start -= 1;
  const block = lines.slice(start, at).map((line) => line.trim());
  if (block[0] !== undefined && POINTS_LINE.test(block[0])) block.shift();
  if (block.length === 0 || block.length > 2) return null;
  const detachment = DETACHMENT_LINE.exec(lines[at] ?? '')?.[1]?.trim() ?? '';
  const next = lines[at + 1]?.trim() ?? '';
  return {
    army: block[0] ?? null,
    detachments: detachment === '' ? [] : [detachment],
    disposition: next.includes('(') ? null : knownDisposition(next),
    format: 'gw-app',
  };
}

function field(lines: string[], pattern: RegExp): string | null {
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match?.[1] !== undefined) return match[1].trim();
  }
  return null;
}

const commaList = (value: string | null) =>
  (value ?? '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

function header(lines: string[]): ParsedList | null {
  const keyword = field(lines, /^\+\s*FACTION KEYWORD:\s*(.+)$/i);
  if (keyword === null) return null;
  const army = keyword.split(' - ').at(-1)?.trim() ?? null;
  return {
    army: army === '' ? null : army,
    detachments: commaList(field(lines, /^\+\s*DETACHMENT:\s*(.+)$/i)),
    disposition: knownDisposition(field(lines, /^\+\s*FORCE DISPOSITION:\s*(.+)$/i)),
    format: 'header',
  };
}

function template(lines: string[]): ParsedList | null {
  const at = lines.findIndex((line) => /^\s*Factions? used:/i.test(line));
  if (at < 0) return null;
  // The army is on the same line, or the first non-empty line after it (multi-faction lists
  // name the main army first).
  const inline = lines[at]?.replace(/^\s*Factions? used:/i, '').trim() ?? '';
  const first = inline !== '' ? inline : (lines.slice(at + 1).find((l) => l.trim() !== '') ?? '');
  const army = first.split(',')[0]?.trim() ?? '';
  return {
    army: army === '' ? null : army,
    detachments: commaList(field(lines, /^\s*Detachments?(?: used)?(?:\(s\))?:\s*(.+)$/i)),
    disposition: knownDisposition(field(lines, /^\s*(?:Force )?Disposition:\s*(.+)$/i)),
    format: 'template',
  };
}

/** Army, detachments and disposition from a list's text; never guesses from free text. */
export function parseArmyList(text: string | null): ParsedList {
  if (text === null || text.trim() === '') return UNKNOWN;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return gwApp(lines) ?? header(lines) ?? template(lines) ?? UNKNOWN;
}

const JOINERS = /\s*,\s*|\s+(?:and|y|und|et|e)\s+/;

/** Splits one joined detachment name when every part is a detachment seen on its own. */
export function splitDetachments(detachments: string[], known: ReadonlySet<string>): string[] {
  const [only] = detachments;
  if (detachments.length !== 1 || only === undefined) return detachments;
  const parts = only
    .split(JOINERS)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 && parts.every((part) => known.has(part)) ? parts : detachments;
}
```

`factions.ts`:

```ts
const ALLEGIANCES = new Set(
  [
    'Imperium',
    'Chaos',
    'Xenos',
    'Forces of the Imperium',
    'Forces of Chaos',
    'Forces of Xenos',
    'Forces of the Hive Mind',
  ].map((n) => n.toLowerCase()),
);

/** Allegiances a player can pick on BCP instead of an army; not factions. */
export function isAllegiance(faction: string): boolean {
  return ALLEGIANCES.has(faction.trim().toLowerCase());
}

/** BCP's faction, or the army read from the list (guessed) when BCP has none or only an allegiance. */
export function resolveFaction(
  bcpFaction: string | null,
  parsedArmy: string | null,
): { faction: string | null; factionGuessed: boolean } {
  const vague = bcpFaction === null || isAllegiance(bcpFaction);
  if (vague && parsedArmy !== null) return { faction: parsedArmy, factionGuessed: true };
  return { faction: bcpFaction, factionGuessed: false };
}
```

In `analysis/matchups.ts`, replace the local `ALLEGIANCES` set with `isAllegiance` (keep behaviour; its tests stay green).

- [ ] **Step 3: Run** the Step 1 command — expect PASS; then `pnpm vitest run --project shared` — all green.
- [ ] **Step 4: Commit** `feat(shared): parse army, detachments and disposition from list text`.

---

### Task 2: Storage, re-parse, inferred army and detachments in the API

**Files:**

- Modify: `apps/api/src/db/schema.ts` (+ migration `pnpm --filter @bcp/api db:generate --name parsed-lists`), `apps/api/src/repo/lists.ts` (+ test), `apps/api/src/repo/participants.ts` (+ test), `apps/api/src/repo/analysis.ts`, `apps/api/src/repo/matchups.ts` (+ test), `apps/api/src/routes/matchups.ts` (+ test), `apps/api/src/main.ts`
- Modify shared schemas: `packages/shared/src/api.ts` (`EventPlayerSchema`), `packages/shared/src/analysis/schemas.ts` (`PlayerRefSchema`), `packages/shared/src/analysis/inputs.ts` (`PlayerRow`), `packages/shared/src/analysis/matchups.ts` (`MatchupSide`, `DispositionFilter` → `MatchupFilter`), `packages/shared/src/analysis/matchup-schemas.ts` (`CellGame` sides, `MatchupsResponse.detachments`)

**Interfaces:**

- Consumes: Task 1's `parseArmyList`, `PARSER_VERSION`, `splitDetachments`, `resolveFaction`, `knownDisposition`.
- Produces:
  - `army_lists`: `parsed_army text`, `detachments text[] not null default '{}'`, `parsed_disposition text`, `parser_version integer not null default 0`.
  - `knownDetachments(db): Promise<Set<string>>` — distinct names from rows whose `detachments` has exactly one element containing no joiner, plus every element of rows with 2+ elements.
  - `saveArmyList` parses (current version) and splits with `knownDetachments`.
  - `reparseLists(db, logger): Promise<number>` — re-parses rows with `parser_version < PARSER_VERSION` in batches of 200, then re-splits every row with one joined detachment; returns rows updated. `main.ts` awaits it after migrations.
  - `EventPlayer` gains `factionGuessed: boolean`, `detachments: string[]`; `disposition` falls back to the list's `parsed_disposition` when BCP has none.
  - `PlayerRef`/`PlayerRow` and `MatchupSide` gain `factionGuessed: boolean` and `detachments: string[]`.
  - Shared: `MatchupFilter { dispositions: string[]; detachments: string[]; side: 'row' | 'both' }` (replaces `DispositionFilter`; keep `export type DispositionFilter = MatchupFilter` for one release). A side matches when every non-empty list matches (disposition any-of AND detachment any-of); `side` applies to both.
  - Matchups routes accept `detachments=A,B`; `MatchupsResponse` gains `detachments: string[]` (every detachment of the loaded games, A→Z, before filtering). `CellGame.row/col` gain `factionGuessed`, `detachments`.

Every repo that returns players joins the current stored list with the existing `storedCurrentList` condition (never a stale list) and maps with `resolveFaction(players.faction, armyLists.parsedArmy)`.

- [ ] **Step 1: Schema + migration.** Add the four columns; generate `0008_parsed-lists`; add `resetDb` nothing new (same table).
- [ ] **Step 2: Tests first.**
  - `repo/lists.test.ts`: saving a GW-app text stores army/detachments/disposition/version; `reparseLists` updates a row inserted with `parser_version = 0` and leaves current ones; a joined `A and B` is split after another list stores `A` and `B` alone, and not split otherwise.
  - `repo/participants.test.ts`: a player with `faction = null` and a fetched GW-app list → `faction` = parsed army, `factionGuessed: true`, `detachments` filled; `faction = 'Chaos'` + list → guessed army; a player whose `listId` changed after the list was stored → no guess, `detachments: []`; BCP faction present → not guessed.
  - `repo/matchups.test.ts`: `loadMatchupGames` returns guessed factions and detachments for sides with lists.
  - `routes/matchups.test.ts`: `detachments=X` keeps only games whose row side played X; `side=both` requires both; players without a list never match; the response lists the event's detachments; `disposition=` legacy still works.
  - `analysis/matchups.test.ts` (shared): detachment filter row vs both, combined with dispositions (AND).
    Run the api and shared projects for those files — expect FAIL.
- [ ] **Step 3: Implement** per Interfaces. `main.ts`: after `migrate()`, `const reparsed = await reparseLists(database.db, logger); if (reparsed > 0) logger.info({ reparsed }, 'Re-read stored army lists');`.
- [ ] **Step 4: Run, check, commit.** `pnpm check`, `pnpm e2e` (2 passed), commit `feat(api): store parsed lists; guessed army and detachments for players and matchups`.

---

### Task 3: Web — ⚠ guessed army, detachments column/filter, games lines, matchups detachment filter

**Files:**

- Create: `apps/web/src/components/FactionText.tsx` (+ test), `apps/web/src/components/PlayerLine.tsx` (+ test)
- Modify: `apps/web/src/features/event/players-filter.ts` (+ test), `PlayersPanel.tsx` (+ test), `features/analysis/GamesTable.tsx`, `TeamPage.tsx` (+ tests), `features/matchups/matrix-view.ts`, `matchups-queries.ts`, `MatrixControls.tsx`, `MatchupsPanel.tsx`, `MatchupsPage.tsx`, `CellDrawer.tsx` (+ tests), `apps/web/src/routes/analysis.matchups.tsx`
- Test data: `apps/web/src/test/fixtures.ts` (`aPlayer` gains `factionGuessed: false, detachments: []`)

**Interfaces:**

- `FactionText({ faction, guessed })`: `faction ?? 'Unknown faction'`, plus when `guessed` a ⚠ in a Mantine `Tooltip` with label "From the list — BCP has no army for this player", the icon wrapped in a focusable `<span tabIndex={0} aria-label="Guessed from the list">`.
- `PlayerLine({ faction, factionGuessed, detachments, disposition, extra? })`: "Army · Detachment + Detachment · Disposition" (coloured via `DispositionText`), missing parts omitted; `extra` appended (e.g. "went first").
- `PlayerFilter` gains `detachments: string[]`; `detachmentsOf(players): string[]` (A→Z).
- `MatrixSettings.detachments: string[]`; `matrixParams` adds `detachments` (comma-joined) when non-empty; the cross-event URL stores `detachments`.

- [ ] **Step 1: Tests first.** FactionText shows the icon and tooltip text on focus only when guessed; PlayersPanel shows a Detachment column ("A + B"), filters by a chosen detachment (any-of) combined with faction (AND), and ⚠ next to a guessed faction; GamesTable/TeamPage lines render "Orks · Kult of Speed · Reconnaissance"; MatrixControls offers a Detachment multi-select from `matchups.detachments` and sends `detachments=…`; the cross-event page round-trips `detachments` in the URL; the cell drawer shows ⚠ for guessed sides. Run — expect FAIL.
- [ ] **Step 2: Implement**; faction cells everywhere use `FactionText`; the matchups Detachment multi-select sits next to Disposition and shares its row/both switch.
- [ ] **Step 3: Run, check, commit.** `pnpm check`, `pnpm e2e`, commit `feat(web): guessed armies, detachments column and filters, matchups detachment filter`.

---

### Task 4: Top lists — API, page, e2e, README

**Files:**

- Create: `apps/api/src/repo/top-lists.ts` (+ test), `apps/api/src/routes/players-search.ts` (+ test), `apps/web/src/features/top-lists/` (`top-lists-queries.ts`, `TopListsPage.tsx`, test), `apps/web/src/routes/analysis.top-lists.tsx`
- Modify: `packages/shared/src/api.ts` (schemas), `apps/api/src/app.ts` (mount), `apps/web/src/components/AppLayout.tsx` (nav "Top lists"), `apps/web/src/features/event/ListDrawer.tsx` (accept an `eventId` per player — already a prop; no change expected), `e2e/finder-to-list.spec.ts`, `README.md`

**Interfaces:**

- Shared: `PlayerSearchQuerySchema` (`factions?`, `dispositions?`, `detachments?` comma-separated; `from?`/`to?` ISO days, default last 90 days; `maxLosses` 0–5 default 1), `TopListPlayerSchema = EventPlayerSchema.extend({ eventId, eventName, eventStartDate })`, `PlayerSearchResponseSchema = { players: TopListPlayer[]; truncated: boolean; eventsInRange: number; eventsLoaded: number }`.
- `searchTopLists(db, query, rule, today): Promise<PlayerSearchResponse>` — big events (`isBigEvent`) starting in range (singles and teams); `eventsInRange` = those events, `eventsLoaded` = those with stored players; candidates = their players with `qualifiesForMaxLosses(player, maxLosses)`, resolved with `resolveFaction` and the current stored list; then filtered in TS by factions (any-of, on the resolved faction), dispositions (any-of), detachments (any-of, only parsed lists); sorted by event start desc, losses asc, wins desc, name; capped at 500 (`truncated`).
- `GET /api/players/search` → `PlayerSearchResponse`.
- Page `/analysis/top-lists`: search params `factions`, `from`, `to`, `maxLosses`, `dispositions`, `detachments`; controls (Faction multi-select from the result's factions plus the current selection, date range, "X-n or better" select 0–5, Disposition and Detachment multi-selects); table (Player, Team, Event · date → `/events/$eventId?tab=players`, W-L-D, `PlayerLine`, List button → `ListDrawer` with the row's `eventId`); notices "N big events in this range aren't loaded yet" and "Showing the first 500 — narrow the search".

- [ ] **Step 1: Tests first.** Repo: qualifying rule (no games excluded, draws aren't losses), sort order, faction filter matches a guessed army, detachment filter only matches parsed lists, `eventsInRange`/`eventsLoaded`, cap at 500 (insert 501 qualifying players) → `truncated: true`. Route: validation (maxLosses 6 → 400, `from > to` → 400). Web: renders rows, List opens the drawer, notices appear, URL state round-trips. Run — expect FAIL.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: e2e + README.** Extend `e2e/finder-to-list.spec.ts` (after the lists are fetched): open `/analysis/top-lists?from=2026-01-01&to=2026-12-31&maxLosses=5`, expect a sample player row and open their list. README "Using it": Top lists, detachments, ⚠ guessed armies.
- [ ] **Step 4: Run, check, commit.** `pnpm check`, `pnpm e2e` (2 passed), commit `feat: Top lists search across events`.
