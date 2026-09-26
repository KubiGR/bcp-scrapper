# Quick Wins Implementation Plan (plan 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "Open on BCP" link on events, multi-select faction/disposition filters (players and matchups), and picking whole teams to fetch their lists on team events.

**Architecture:** Mostly web changes on existing components. The matchups disposition filter becomes a list across shared/API/web (with the old single value still accepted). The list-queue request gains `teamIds`, resolved server-side to the teams' players.

**Tech Stack:** as plans 1–5.

**Spec:** `docs/superpowers/specs/2026-09-26-lists-search-autofetch-design.md` §2 (plan 6).

**Execution note:** build in a separate git worktree; the user's dev server runs from the main checkout.

## Global Constraints

- Node 24, pnpm 12, TypeScript `~6.0.3`, Zod 4; strict ESLint `--max-warnings=0`, no `any`; Prettier.
- Tests next to the code; no network, PGlite only; never read, print or source `.env`.
- Mantine 9.6.2; minimal dark theme; `numeric` only on figures; keyboard reachable; no manual memoisation; every data view has loading/empty/error states.
- Every API read validated by shared schemas; state-changing routes use `requireJson`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Foreground commands only; `pnpm vitest run --project api|web|shared <path>`, never bare `vitest`.

## Review Focus

1. **Old links keep working.** A cross-event URL with the old `disposition=Take and Hold` still filters (read into the new list); the API still accepts `disposition=`. _Task 2._
2. **Any-of within, AND across.** Two factions selected show players of either; faction + disposition narrows to both; an empty multi-select means no filter. _Task 1._
3. **Team fetch skips what it should.** Ticking a team whose lists are partly fetched, queued or "no list on BCP" queues only the missing ones; an unknown team id is a 400; teams of another event are rejected. _Task 3._
4. **Singles events unchanged.** The X-n options remain on singles events; team events lose them. _Task 3._
5. **Ticks survive refetches.** Players refetch every 5 s while lists are queued; ticked teams stay ticked. _Task 3._

---

### Task 1: "Open on BCP" link and multi-select player filters

**Files:** `apps/web/src/features/event/EventHeader.tsx` (+ test), `apps/web/src/features/event/players-filter.ts` (+ test), `apps/web/src/features/event/PlayersPanel.tsx` (+ test).

**Interfaces:**

- `PlayerFilter` becomes `{ query: string; factions: string[]; dispositions: string[]; maxLosses: number | null }` (empty array = no filter).

- [ ] **Step 1: Tests first.**
  - `EventHeader.test.tsx`: a link named "Open on BCP" with `href="https://www.bestcoastpairings.com/event/EVT1"`, `target="_blank"`, `rel` containing `noreferrer`.
  - `players-filter.test.ts`: `filterPlayers` with `factions: ['Orks', 'Necrons']` keeps both factions' players; `factions: ['Orks'], dispositions: ['Take and Hold']` keeps only Orks who played Take and Hold; empty arrays keep everyone; the existing query/record cases updated to the new shape.
  - `PlayersPanel.test.tsx`: the Faction and Disposition controls are multi-selects (`MultiSelect`, `aria-label` "Faction" / "Disposition"); choosing two factions shows players of both.

  Run: `pnpm vitest run --project web src/features/event` — expect FAIL.

- [ ] **Step 2: Implement.**
  - `EventHeader`: next to the title, `<Anchor href={`https://www.bestcoastpairings.com/event/${encodeURIComponent(event.bcpId)}`} target="_blank" rel="noreferrer" size="sm">Open on BCP ↗</Anchor>` (keep the header layout tidy at phone width).
  - `filterPlayers`: `(factions.length === 0 || (player.faction !== null && factions.includes(player.faction)))`, same for dispositions.
  - `PlayersPanel`: replace the two `Select`s with Mantine `MultiSelect` (`placeholder` "All factions" / "All dispositions" when empty, `clearable`, `searchable` for factions, `renderOption` with `DispositionText` for dispositions; keep widths sensible, e.g. 240), state `string[]`.

- [ ] **Step 3: Run, check, commit.** `pnpm vitest run --project web src/features/event`, `pnpm check`, commit `feat(web): Open on BCP link and multi-select faction/disposition filters`.

---

### Task 2: Multi-select disposition in the matchups

**Files:** `packages/shared/src/analysis/matchups.ts` (+ test), `apps/api/src/routes/matchups.ts` (+ test), `apps/web/src/features/matchups/matrix-view.ts`, `MatrixControls.tsx`, `MatchupsPanel.tsx`, `MatchupsPage.tsx`, `matchups-queries.ts`, `apps/web/src/routes/analysis.matchups.tsx` (+ tests).

**Interfaces:**

- Shared `DispositionFilter = { dispositions: string[]; side: 'row' | 'both' }` (empty = no filter). `sidesOf`: `row` → the row side's disposition is any of the list; `both` → both sides' dispositions are in the list (each may differ, e.g. Orks-Take and Hold vs Necrons-Disruption with both selected). Keep the case/whitespace-insensitive matching.
- API filter schema: `dispositions` (comma-separated, trimmed, empty entries dropped) **or** the old `disposition` (single) — merged into one list; `side` as today.
- Web `MatrixSettings.dispositions: string[]` (replaces `disposition`); `matrixParams` sends `dispositions=A,B&side=…` only when the list is non-empty.
- Cross-event URL: `dispositions` (comma-separated string); `validateSearch` also reads an old `disposition` value into `dispositions` (Review Focus 1).

- [ ] **Step 1: Tests first.** Shared: row-side any-of, both-sides with two dispositions, empty list = no filter, cellGames uses the same filter. API: `?dispositions=Take%20and%20Hold,Disruption&side=row` and the old `?disposition=Take%20and%20Hold` both filter. Web: MatrixControls renders a `MultiSelect` "Disposition"; choosing two refetches with `dispositions=…`; the "No games match this disposition filter" empty state and its Clear button clear the list; the cross page reads `?disposition=X` from an old URL. Run — expect FAIL.

- [ ] **Step 2: Implement** per the interfaces; update every use of `settings.disposition` (grep the matchups feature and tests).

- [ ] **Step 3: Run, check, commit.** `pnpm check`, commit `feat: multi-select dispositions in the matchups`.

---

### Task 3: Picking teams to fetch their lists

**Files:** `packages/shared/src/api.ts` (`QueueListsRequestSchema`), `apps/api/src/fetch-queue/queue-lists.ts` (+ route test in `apps/api/src/routes/fetch-queue.test.ts`), `apps/web/src/features/event/PlayersPanel.tsx`, `FetchListsMenu.tsx`, `players-filter.ts` (+ tests), `e2e/team-analysis.spec.ts`.

**Interfaces:**

- `QueueListsRequestSchema` gains `teamIds: z.array(z.string().min(1)).min(1).max(200).optional()`; the refine allows at most one of `maxLosses`, `playerIds`, `teamIds` (message: "Send at most one of `maxLosses`, `playerIds` or `teamIds`").
- `queueEventLists`: `teamIds` → the event's players whose `teamId` is in the list (unknown or other-event team ids → `ValidationError` "Not teams of this event: …"); then treated like `playerIds` (priority `SINGLE_LIST_PRIORITY`, the existing skip rules for fetched/queued/no-list apply, bulk NO_LIST exclusion does not apply to explicit picks — same as `playerIds`).
- Web: `missingListCountFor(players, teamIds: Set<string>)` in `players-filter.ts` (missing lists among those teams' players, same rule as `missingListCount`).

- [ ] **Step 1: Tests first.**
  - API route: queue `{ teamIds: ['TM-ALPHA'] }` for EVTTEAM0001 → queues exactly Alpha's players' missing lists at priority 10 (inspect `fetch_queue` rows); a team id of another event (e.g. `TB-RED` from EVTBRACKET01) → 400; `{ teamIds: [...], maxLosses: 1 }` → 400.
  - Web `players-filter.test.ts`: `missingListCountFor`.
  - Web `PlayersPanel.test.tsx` (team event): each team header has a checkbox "Select Alpha Squad" and a "Fetch team lists" button (not inside the toggle button); the "No team" group has neither; clicking "Fetch team lists" posts `{ teamIds: ['TM-ALPHA'] }`; ticks survive a players refetch (rerender with new data keeps the checkbox checked).
  - Web `FetchListsMenu.test.tsx`: on a team event the menu shows "All missing lists (N)" and "Selected teams (2 teams · 5 lists)" (disabled with none ticked) and **no** X-n items; on a singles event the X-n items remain; choosing "Selected teams" posts `{ teamIds: [...] }`.
    Run — expect FAIL.

- [ ] **Step 2: Implement.**
  - Schema + service as in Interfaces.
  - `PlayersPanel` holds `selectedTeams: Set<string>` state (by team id, so it survives refetches); team header row: `Checkbox` (aria-label "Select <team>") + the existing toggle button + "Team page" link + `Button size="compact-xs" variant="subtle"` "Fetch team lists" (disabled when the team has no missing lists; loading while posting). Pass `selectedTeams` to `FetchListsMenu`.
  - `FetchListsMenu`: prop `selectedTeamIds: string[]` (default `[]`); on team events render "All missing lists" + "Selected teams (T teams · N lists)"; on singles events keep the X-n items. Both team actions use `queueLists(eventId, { teamIds })` and the existing notification.
  - e2e (`e2e/team-analysis.spec.ts`): on Sample Team Open's Players & lists, tick "Select Alpha Squad", open Fetch lists, choose "Selected teams", expect Alpha's players' lists to reach "Fetched" (200 ms per job in e2e).

- [ ] **Step 3: Run, check, commit.** `pnpm check`, `pnpm e2e` (expect 2 passed), commit `feat: pick teams to fetch their lists on team events`.
