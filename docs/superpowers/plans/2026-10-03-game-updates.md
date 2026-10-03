# Game Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the edition's updates (MFM, Faction Packs, Dataslates, Codexes) from BSData's
commit history, let admins edit them, and filter Tournaments, Meta, Factions, Top lists and
Matchups by one or more updates.

**Architecture:** Pure shared functions group commits into updates, apply admin edits, and turn
updates into date spans and back. The API stores commits and edits and serves the effective list;
the web app's `UpdatePicker` writes the pages' existing `from`/`to`, and labels events from the
same list.

**Tech Stack:** pnpm monorepo; Hono + Drizzle + Postgres/PGlite; React 19 + Mantine 9 + TanStack
Query; Zod 4; Vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-game-updates-design.md`

## Global Constraints

- Update commits match (any case) `MFM`, `Munitorum`, `Faction Pack`, `Dataslate`, `Balance` or
  `Codex`; commits less than 7 days after the previous update commit join its group.
- Automatic name `"<Mon> <YYYY> · <kinds>"`, kinds in order MFM, Faction Packs, Dataslate,
  Codex: <Faction>, joined with " & ".
- An event's update: last effective update starting on or before its first day (UTC); earlier →
  "Before first update".
- Picking updates sets the page's `from`/`to` (earliest start → latest end, gaps filled); no new
  URL parameters.
- Edits keyed by the group's first commit sha.
- No network in tests; GitHub only through `BsdataClient`.
- Commands: `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`; tests
  `pnpm vitest run --project api|web|shared <path>`; gate `pnpm check`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings made while planning

- Event answers don't gain an `update` field: the web app computes each event's update from
  `GET /api/updates` (cached, needed for the picker anyway) with the shared `updateOfDay`. Same
  result, no change to event endpoints.
- `merged_into` is a boolean `merged` (always "into the previous visible update"); merged and
  hidden updates both drop out of the effective list, so their days join the previous update.
- Event counts per update count every stored event whose first day falls in the update's span.

## Review Focus

1. An admin moves an update's start before the previous one's: the API refuses (400) instead of
   producing overlapping spans (Task 3 test "refuses a start out of order").
2. The newest update starts after today (a start override in the future): its span is that one
   day, not a reversed range (Task 1 test "never gives a span ending before it starts").
3. GitHub's commit list fails half-way: commits already stored stay, and the next run continues
   (Task 2 test "keeps what it read when a page fails").
4. A page whose dates span updates exactly shows them ticked even when only some were picked
   (Task 1 test "matches a range back to the run of updates it covers").
5. No updates at all (before the first sync): the picker is hidden, labels are absent, pages work
   as before (Task 4 test "shows no picker without updates").

---

### Task 1: Updates logic (shared)

**Files:**

- Create: `packages/shared/src/game-updates.ts`, `packages/shared/src/game-updates.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './game-updates';`)

**Interfaces:**

- Produces:

```ts
export interface UpdateCommit {
  sha: string;
  day: string;
  message: string;
} // day YYYY-MM-DD
export interface AutoUpdate {
  id: string;
  start: string;
  lastCommit: string;
  name: string;
}
export interface UpdateEdits {
  name: string | null;
  start: string | null;
  merged: boolean;
  hidden: boolean;
}
export interface EffectiveUpdate {
  id: string;
  name: string;
  start: string;
}
export interface UpdateSpan extends EffectiveUpdate {
  from: string;
  to: string;
}
export function isUpdateCommit(message: string): boolean;
export function groupUpdates(commits: UpdateCommit[], gapDays?: number): AutoUpdate[]; // oldest first
export function effectiveUpdates(
  auto: AutoUpdate[],
  edits: Map<string, UpdateEdits>,
): EffectiveUpdate[]; // oldest first
export function updateOfDay(updates: EffectiveUpdate[], day: string): EffectiveUpdate | null;
export function updateSpans(updates: EffectiveUpdate[], today: string): UpdateSpan[]; // oldest first
export function selectionRange(
  spans: UpdateSpan[],
  ids: string[],
): { from: string; to: string } | null;
export function selectedUpdates(spans: UpdateSpan[], from: string, to: string): string[];
// schemas
export const GameUpdateSchema; // { id, name, autoName, start, autoStart, merged, hidden, events }
export const GameUpdatesResponseSchema; // { updates: GameUpdate[] } newest first, all rows
export const GameUpdatePatchSchema; // { name?: string|null, start?: iso date|null, merged?: boolean, hidden?: boolean }
```

- [ ] **Step 1: Failing tests** — `game-updates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  effectiveUpdates,
  groupUpdates,
  isUpdateCommit,
  selectedUpdates,
  selectionRange,
  updateOfDay,
  updateSpans,
  type UpdateCommit,
  type UpdateEdits,
} from './game-updates';

const commit = (day: string, message: string, sha = `${day}-${message}`): UpdateCommit => ({
  sha,
  day,
  message,
});
const noEdits = new Map<string, UpdateEdits>();

describe('isUpdateCommit', () => {
  it('knows official update commits from fixes', () => {
    expect(isUpdateCommit('20260930 MFM and Faction Packs')).toBe(true);
    expect(isUpdateCommit('Aeldari Faction Pack updates')).toBe(true);
    expect(isUpdateCommit('Balance Dataslate Oct 2026')).toBe(true);
    expect(isUpdateCommit('Codex: Orks')).toBe(true);
    expect(isUpdateCommit('Transport fixes and author updates')).toBe(false);
    expect(isUpdateCommit('Gunwagon points fixes')).toBe(false);
  });
});

describe('groupUpdates', () => {
  it('groups update commits less than 7 days apart, ignoring other commits', () => {
    const updates = groupUpdates([
      commit('2026-06-09', 'Updated to Faction Pack'),
      commit('2026-06-12', 'Bug fixes'),
      commit('2026-06-15', 'MFM'), // 6 days after: same update
      commit('2026-06-22', 'Aeldari MFM updates'), // 7 days after: a new one
      commit('2026-09-30', '20260930 MFM and Faction Packs'),
    ]);
    expect(updates.map((u) => [u.start, u.lastCommit])).toEqual([
      ['2026-06-09', '2026-06-15'],
      ['2026-06-22', '2026-06-22'],
      ['2026-09-30', '2026-09-30'],
    ]);
    expect(updates[0]?.id).toBe('2026-06-09-Updated to Faction Pack');
  });

  it('names an update by month and what changed', () => {
    const [update] = groupUpdates([
      commit('2026-07-22', 'Codex: Orks release'),
      commit('2026-07-23', 'Orks MFM changes'),
      commit('2026-07-24', 'Balance Dataslate'),
      commit('2026-07-25', 'SM Faction Pack'),
    ]);
    expect(update?.name).toBe('Jul 2026 · MFM & Faction Packs & Dataslate & Codex: Orks');
  });
});

describe('effectiveUpdates and spans', () => {
  const auto = groupUpdates([
    commit('2026-06-09', 'MFM', 'a'),
    commit('2026-07-22', 'MFM', 'b'),
    commit('2026-08-29', 'MFM', 'c'),
    commit('2026-09-30', 'MFM', 'd'),
  ]);

  it('applies renames, start dates, merges and hides', () => {
    const edits = new Map<string, UpdateEdits>([
      ['a', { name: 'Edition launch', start: null, merged: false, hidden: false }],
      ['b', { name: null, start: '2026-07-25', merged: false, hidden: false }],
      ['c', { name: null, start: null, merged: true, hidden: false }],
      ['d', { name: null, start: null, merged: false, hidden: true }],
    ]);
    expect(effectiveUpdates(auto, edits)).toEqual([
      { id: 'a', name: 'Edition launch', start: '2026-06-09' },
      { id: 'b', name: 'Jul 2026 · MFM', start: '2026-07-25' },
    ]);
  });

  it('gives each update’s days, the newest to today', () => {
    const spans = updateSpans(effectiveUpdates(auto, noEdits), '2026-10-03');
    expect(spans.map((s) => [s.id, s.from, s.to])).toEqual([
      ['a', '2026-06-09', '2026-07-21'],
      ['b', '2026-07-22', '2026-08-28'],
      ['c', '2026-08-29', '2026-09-29'],
      ['d', '2026-09-30', '2026-10-03'],
    ]);
  });

  it('never gives a span ending before it starts', () => {
    const spans = updateSpans(effectiveUpdates(auto, noEdits), '2026-09-01');
    expect(spans.at(-1)).toMatchObject({ from: '2026-09-30', to: '2026-09-30' });
  });

  it('finds the update in force on a day', () => {
    const updates = effectiveUpdates(auto, noEdits);
    expect(updateOfDay(updates, '2026-07-21')?.id).toBe('a');
    expect(updateOfDay(updates, '2026-07-22')?.id).toBe('b');
    expect(updateOfDay(updates, '2026-06-01')).toBeNull();
  });

  it('turns picked updates into one range, filling gaps', () => {
    const spans = updateSpans(effectiveUpdates(auto, noEdits), '2026-10-03');
    expect(selectionRange(spans, ['d', 'a'])).toEqual({ from: '2026-06-09', to: '2026-10-03' });
    expect(selectionRange(spans, [])).toBeNull();
  });

  it('matches a range back to the run of updates it covers', () => {
    const spans = updateSpans(effectiveUpdates(auto, noEdits), '2026-10-03');
    expect(selectedUpdates(spans, '2026-06-09', '2026-10-03')).toEqual(['a', 'b', 'c', 'd']);
    expect(selectedUpdates(spans, '2026-07-22', '2026-08-28')).toEqual(['b']);
    expect(selectedUpdates(spans, '2026-07-23', '2026-08-28')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run --project shared packages/shared/src/game-updates.test.ts`
      — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `game-updates.ts`:

```ts
import { z } from 'zod';
import { addDays } from './catalog';
import { canonicalArmy } from './factions';

export interface UpdateCommit {
  sha: string;
  /** The commit's UTC day (YYYY-MM-DD). */
  day: string;
  /** Its message's first line. */
  message: string;
}
/** An update as BSData's history shows it: a burst of update commits. */
export interface AutoUpdate {
  /** The sha of its first commit: stable as history grows. */
  id: string;
  start: string;
  lastCommit: string;
  name: string;
}
export interface UpdateEdits {
  name: string | null;
  start: string | null;
  merged: boolean;
  hidden: boolean;
}
export interface EffectiveUpdate {
  id: string;
  name: string;
  start: string;
}
export interface UpdateSpan extends EffectiveUpdate {
  from: string;
  to: string;
}

const UPDATE_COMMIT = /mfm|munitorum|faction ?packs?|dataslate|balance|codex/i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A commit for an official update (points, Faction Packs, Dataslate, a codex), not a fix. */
export const isUpdateCommit = (message: string) => UPDATE_COMMIT.test(message);

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

/** The faction a "Codex: X …" message names, if it's a faction the app knows. */
function codexFaction(message: string): string | null {
  const match = /codex:?\s+([a-z' -]+)/i.exec(message);
  if (match?.[1] === undefined) return null;
  const words =
    match[1]
      .split(/\s+(?:and|&|\+)\s+|,/i)[0]
      ?.trim()
      .split(/\s+/) ?? [];
  for (let n = Math.min(words.length, 4); n > 0; n -= 1) {
    const faction = canonicalArmy(words.slice(0, n).join(' '));
    if (faction !== null) return faction;
  }
  return null;
}

function nameOf(start: string, messages: string[]): string {
  const [year, month] = start.split('-');
  const kinds: string[] = [];
  const add = (kind: string) => {
    if (!kinds.includes(kind)) kinds.push(kind);
  };
  if (messages.some((m) => /mfm|munitorum/i.test(m))) add('MFM');
  if (messages.some((m) => /faction ?packs?/i.test(m))) add('Faction Packs');
  if (messages.some((m) => /dataslate|balance/i.test(m))) add('Dataslate');
  for (const message of messages) {
    const faction = codexFaction(message);
    if (faction !== null) add(`Codex: ${faction}`);
  }
  const label = `${MONTHS[Number(month) - 1] ?? ''} ${year ?? ''}`;
  return kinds.length === 0 ? label : `${label} · ${kinds.join(' & ')}`;
}

/** Update commits less than `gapDays` apart form one update; oldest first. */
export function groupUpdates(commits: UpdateCommit[], gapDays = 7): AutoUpdate[] {
  const updates: { commits: UpdateCommit[] }[] = [];
  const sorted = commits
    .filter((c) => isUpdateCommit(c.message))
    .sort((a, b) => a.day.localeCompare(b.day));
  for (const commit of sorted) {
    const current = updates.at(-1);
    const last = current?.commits.at(-1);
    if (
      current !== undefined &&
      last !== undefined &&
      dayNumber(commit.day) - dayNumber(last.day) < gapDays
    ) {
      current.commits.push(commit);
    } else {
      updates.push({ commits: [commit] });
    }
  }
  return updates.flatMap(({ commits: group }) => {
    const first = group[0];
    const last = group.at(-1);
    if (first === undefined || last === undefined) return [];
    return [
      {
        id: first.sha,
        start: first.day,
        lastCommit: last.day,
        name: nameOf(
          first.day,
          group.map((c) => c.message),
        ),
      },
    ];
  });
}

/** The updates people pick from: edits applied, merged and hidden ones left out; oldest first. */
export function effectiveUpdates(
  auto: AutoUpdate[],
  edits: Map<string, UpdateEdits>,
): EffectiveUpdate[] {
  return auto
    .flatMap((update) => {
      const edit = edits.get(update.id);
      if (edit?.merged === true || edit?.hidden === true) return [];
      return [
        { id: update.id, name: edit?.name ?? update.name, start: edit?.start ?? update.start },
      ];
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** The update in force on a day: the last one starting on or before it; null before the first. */
export function updateOfDay(updates: EffectiveUpdate[], day: string): EffectiveUpdate | null {
  let found: EffectiveUpdate | null = null;
  for (const update of updates) if (update.start <= day) found = update;
  return found;
}

/** Each update's days: to the day before the next one, the newest to today (never before its start). */
export function updateSpans(updates: EffectiveUpdate[], today: string): UpdateSpan[] {
  return updates.map((update, index) => {
    const next = updates[index + 1];
    const to = next === undefined ? today : addDays(next.start, -1);
    return { ...update, from: update.start, to: to < update.start ? update.start : to };
  });
}

/** The date range of the picked updates: earliest start to latest end (updates between included). */
export function selectionRange(
  spans: UpdateSpan[],
  ids: string[],
): { from: string; to: string } | null {
  const picked = spans.filter((span) => ids.includes(span.id));
  const first = picked[0];
  const last = picked.at(-1);
  return first === undefined || last === undefined ? null : { from: first.from, to: last.to };
}

/** The run of updates a range covers exactly; none when it doesn't line up with update days. */
export function selectedUpdates(spans: UpdateSpan[], from: string, to: string): string[] {
  const start = spans.findIndex((span) => span.from === from);
  const end = spans.findIndex((span) => span.to === to);
  if (start < 0 || end < start) return [];
  return spans.slice(start, end + 1).map((span) => span.id);
}

const isoDay = z.iso.date();

export const GameUpdateSchema = z.object({
  id: z.string(),
  name: z.string(),
  autoName: z.string(),
  start: isoDay,
  autoStart: isoDay,
  merged: z.boolean(),
  hidden: z.boolean(),
  /** Stored events whose first day falls in this update's days (0 when merged or hidden). */
  events: z.number().int().nonnegative(),
});
export type GameUpdate = z.infer<typeof GameUpdateSchema>;

/** GET /api/updates: every update read from BSData, newest first. */
export const GameUpdatesResponseSchema = z.object({ updates: z.array(GameUpdateSchema) });
export type GameUpdatesResponse = z.infer<typeof GameUpdatesResponseSchema>;

/** PATCH /api/updates/:id: null name/start go back to BSData's. */
export const GameUpdatePatchSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  start: isoDay.nullable().optional(),
  merged: z.boolean().optional(),
  hidden: z.boolean().optional(),
});
export type GameUpdatePatch = z.infer<typeof GameUpdatePatchSchema>;
```

- [ ] **Step 4: Run** the test, then `pnpm vitest run --project shared` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: group BSData's update commits into game updates`.

### Task 2: Store commits and update edits; read the history

**Files:**

- Modify: `apps/api/src/db/schema.ts` (+ migration `--name game-updates`),
  `apps/api/src/db/test-db.ts` (truncate the new tables), `apps/api/src/bsdata/client.ts`
- Create: `apps/api/src/repo/game-updates.ts`, `apps/api/src/repo/game-updates.test.ts`

**Interfaces:**

- Consumes: Task 1.
- Produces: tables `bsdataCommits` (`sha` PK, `day` text, `message` text) and `gameUpdates`
  (`id` PK = first sha, `name` nullable, `startOverride` text nullable, `merged` bool default
  false, `hidden` bool default false, `updatedAt`); `BsdataClient.commits(stopAtSha: string |
null): Promise<UpdateCommit[]>` (newest first, stopping before `stopAtSha`); repo
  `syncUpdateCommits(db, client): Promise<number>` (commits added), `listGameUpdates(db, today):
Promise<GameUpdatesResponse>`, `editGameUpdate(db, id, patch, today): Promise<'ok' |
'not-found' | 'out-of-order'>`, `effectiveGameUpdates(db): Promise<EffectiveUpdate[]>`.

- [ ] **Step 1: Failing tests** (`repo/game-updates.test.ts`, fresh PGlite per test; a fake
      client whose `commits(stopAtSha)` returns its list newest first up to `stopAtSha`, recording
      calls):
  - **reads the history once, then only new commits**: first sync stores 4 commits; second sync
    with one more commit asks with the newest stored sha and adds 1.
  - **keeps what it read when a page fails**: a client that throws after returning nothing new →
    `syncUpdateCommits` rejects, stored commits unchanged.
  - **lists updates newest first with event counts**: commits on 2026-06-09 (MFM, sha a),
    2026-07-22 (MFM, b); events stored with start days 2026-06-20 and 2026-07-30 (insert rows
    into `events` with the minimal columns) → `[{ id: 'b', events: 1, start: '2026-07-22', … },
{ id: 'a', events: 1, … }]`.
  - **edits stick across new commits**: rename 'a', then sync a new commit → 'a' keeps its name.
  - **refuses a start out of order**: `editGameUpdate(db, 'b', { start: '2026-06-01' })` →
    'out-of-order'; unknown id → 'not-found'.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**:
  - Schema:

```ts
/** BSData's commits (first line of each message), for building game updates. */
export const bsdataCommits = pgTable('bsdata_commits', {
  sha: text('sha').primaryKey(),
  day: text('day').notNull(),
  message: text('message').notNull(),
});

/** Admin edits to a game update, keyed by its first commit's sha. */
export const gameUpdates = pgTable('game_updates', {
  id: text('id').primaryKey(),
  name: text('name'),
  startOverride: text('start_override'),
  merged: boolean('merged').notNull().default(false),
  hidden: boolean('hidden').notNull().default(false),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});
```

- Client `commits(stopAtSha)`: pages `https://api.github.com/repos/BSData/wh40k-11e/commits?per_page=100&page=N`
  (N from 1, at most 30 pages); maps each to `{ sha, day: commit.author.date.slice(0, 10),
message: first line }`; stops at the first sha equal to `stopAtSha` (not included) or an
  empty page.
- `syncUpdateCommits`: `stopAtSha` = the stored commit with the latest `day` (then sha), or
  null; insert new commits with `onConflictDoNothing`; return the count.
- `listGameUpdates`: load commits → `groupUpdates`; load edits → map; effective → spans with
  `today`; event counts: select every event's UTC start day, count per span; merged/hidden
  rows `events: 0`; answer every automatic update newest first with `name` (edited or auto),
  `autoName`, `start` (override or auto), `autoStart`, `merged`, `hidden`, `events`.
- `editGameUpdate`: unknown id (not in grouped updates) → 'not-found'; a new `start` must be
  after the previous effective update's start and before the next's (by effective order without
  this update's current position) → else 'out-of-order'; upsert the row with the given fields
  (`undefined` fields unchanged).
- `effectiveGameUpdates(db)`: grouped + edits → `effectiveUpdates`.
- [ ] **Step 4: Run** `pnpm vitest run --project api apps/api/src/repo/game-updates.test.ts` —
      Expected: PASS.
- [ ] **Step 5: Commit** `feat: store BSData's commits and game update edits`.

### Task 3: Updates routes and sync schedule

**Files:**

- Create: `apps/api/src/routes/game-updates.ts`, `apps/api/src/routes/game-updates.test.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/routes/bsdata.ts` (refresh also syncs commits),
  `apps/api/src/main.ts` (the daily BSData run also syncs commits)

**Interfaces:**

- Produces: `GET /api/updates` → `GameUpdatesResponse`; `PATCH /api/updates/:id` (admin when
  logins are on; 400 invalid body or start out of order; 404 unknown) → `GameUpdatesResponse`.

- [ ] **Step 1: Failing tests** (createApp with a fake `bsdata` client that also has
      `commits`): refresh then GET lists updates newest first; PATCH renames; PATCH with a start out
      of order → 400; unknown id → 404; with logins on, a member gets 403 (copy the admin-test setup
      from `routes/detachment-links.test.ts`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the routes (`now` → today as `toIsoDate`), register in `app.ts`
      after the BSData routes. In `routes/bsdata.ts` refresh: after `syncBsdata`, `await
syncUpdateCommits(db, client).catch(() => 0)` (a commit failure doesn't fail the refresh). In
      `main.ts`'s `syncBsdataIfDue`, the same after `syncBsdata`. Update the fake clients in existing
      tests (`routes/bsdata.test.ts`, `repo/bsdata.test.ts`) with `commits: () => Promise.resolve([])`.
- [ ] **Step 4: Run** `pnpm vitest run --project api` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: game updates API, read with BSData daily`.

### Task 4: Update picker on the five pages

**Files:**

- Create: `apps/web/src/features/updates/updates-queries.ts`,
  `apps/web/src/features/updates/UpdatePicker.tsx`,
  `apps/web/src/features/updates/UpdatePicker.test.tsx`
- Modify: `MetaPage.tsx`, `FactionsPage.tsx` (features/meta), `TopListsPage.tsx`,
  `MatchupsPage.tsx`, `finder/AdvancedSearch.tsx` — add `<UpdatePicker from=… to=… onChange=… />`
  next to each Dates input, wired to the same write the dates use.

**Interfaces:**

- Produces: `updatesQuery` (GET /api/updates, staleTime 5 min); `useUpdateSpans(): UpdateSpan[]`
  (effective spans from the query, today from `toIsoDate(new Date())`); `UpdatePicker({ from, to,
onChange })`.

- [ ] **Step 1: Failing tests** (`UpdatePicker.test.tsx`, stub `GET /api/updates` with 3
      updates a/b/c starting 2026-06-09, 2026-07-22, 2026-09-30, none merged or hidden):
  - picking b calls `onChange({ from: '2026-07-22', to: '2026-09-29' })`;
  - with `from='2026-06-09'` and `to` = today, a/b/c are shown selected (pills);
  - picking a and c (simulate the MultiSelect change with both) calls onChange with the full
    range;
  - with a custom range the placeholder reads "Custom dates";
  - **shows no picker without updates** (`{ updates: [] }` → nothing rendered).
    Also extend one page test (MetaPage) to stub `/api/updates` and assert the "Update" picker is
    present.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `UpdatePicker`: Mantine `MultiSelect` labelled "Update", data newest
      first (`Current: <name>` for the newest), value `selectedUpdates(spans, from, to)`, placeholder
      "Custom dates" when nothing matches; `onChange(ids)` → when `ids` non-empty,
      `onChange(selectionRange(spans, ids))`; renders null while loading, on error, or without
      updates. Add `GET /api/updates` stubs to any page test that now fails because of the extra
      request.
- [ ] **Step 4: Run** `pnpm vitest run --project web` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: pick one or more game updates on every page with dates`.

### Task 5: Update labels and Settings

**Files:**

- Create: `apps/web/src/features/updates/UpdatesSection.tsx` (+ test),
  `apps/web/src/features/updates/use-update-of.ts`
- Modify: `apps/web/src/features/finder/EventsTable.tsx`, `apps/web/src/features/event/EventHeader.tsx`,
  `apps/web/src/routes/settings.tsx` (UpdatesSection after BsdataCard)

**Interfaces:**

- Produces: `useUpdateOf(startDate: string): string | null | undefined` (the update name;
  null = before the first; undefined = no updates known).

- [ ] **Step 1: Failing tests**: EventsTable shows "Jul 2026 · MFM" under an event dated
      2026-07-30 and "Before first update" for 2026-05-01 (stub `/api/updates`); EventHeader shows
      "Update: Jul 2026 · MFM"; `UpdatesSection` lists updates with start and event count,
      Rename (opens an input, PATCH `{ name }`), Change date (date input, PATCH `{ start }`), Merge
      into previous (PATCH `{ merged: true }`; not on the oldest), Hide / Show (PATCH `{ hidden }`),
      "No updates read from BSData yet." when empty.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**: the hook uses `updatesQuery` + `effectiveUpdates`-equivalent data
      (the response's non-merged, non-hidden rows) and `updateOfDay(updates, startDate.slice(0,
10))`; the table line is a dimmed `Text size="xs"`; the header line `Update: …`. Settings
      section is a `Panel` titled "Game updates" with one row per update (newest first): name
      (dimmed "(auto: …)" when renamed), start (dimmed "auto …" when moved), events, buttons; admin
      only when logins are on (as other cards).
- [ ] **Step 4: Run** `pnpm check` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: show each event's game update, and edit updates in Settings`.

### Task 6: Real-data check

- [ ] **Step 1:** Start `api` against the local database (temporary `DATABASE_URL` in
      `.claude/launch.json`, restored right after start) and `web`; press BSData Refresh.
- [ ] **Step 2:** Settings shows 4 updates (9 Jun, 22 Jul, 29 Aug, 30 Sep 2026) with event
      counts; Meta's picker selecting "Aug 2026" sets dates 29 Aug – 29 Sep; Tournaments shows update
      labels.
- [ ] **Step 3:** Stop both servers.
