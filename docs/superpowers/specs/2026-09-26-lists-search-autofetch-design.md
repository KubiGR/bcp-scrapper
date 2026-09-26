# Quick Wins, Reading Lists, Top Lists and Auto-fetch: Design Spec (plans 6–8)

- **Date:** 2026-09-26
- **Status:** Approved design, pending spec review
- **Builds on:** the main spec (`2026-09-23-bcp-analyzer-design.md`), plan 3 (`2026-09-24-list-queue-design.md`) and plans 4–5 (`2026-09-24-team-analysis-design.md`). Where this spec differs from them, this spec wins.
- **Delivery:**
  - **Plan 6 — quick wins:** §2 (BCP link, multi-select filters, picking teams).
  - **Plan 7 — reading lists:** §3 (list parser, detachments, inferred army) and §4 (Top lists search).
  - **Plan 8 — auto-fetch:** §5.

## 1. Goals

User requests of 2026-09-26:

1. When BCP has no army for a player, read it from their list and show it with a warning, since it's a guess.
2. Multi-select faction and disposition filters.
3. Search across events for players of chosen factions who went X-1 or better.
4. Fetch events, pairings and lists in the background, automatically.
5. A link to the event's BCP page.
6. On team events, fetch whole teams' lists by picking teams (instead of X-n result filters).

Plus the backlog item: detachments read from lists, shown and filterable.

### Non-goals

- Parsing units, points or wargear from lists (only army, detachments and disposition).
- Auto-fetching running events, small events (below the big-event rule), or events outside the window.
- Changing the queue's pace (one job every 5 s stays).

## 2. Plan 6 — quick wins

### 2.1 BCP link

The event page header shows **Open on BCP ↗** linking to `https://www.bestcoastpairings.com/event/{id}` (new tab, `rel="noreferrer"`).

### 2.2 Multi-select filters

- **Players & lists:** Faction and Disposition become multi-selects (`MultiSelect`). Within one filter any selected value matches; filters combine with AND (and with search and record).
- **Matchups** (event tab and cross-event page): Disposition becomes a multi-select, keeping _row side / both sides_: row side = the row player played any selected disposition; both sides = both players did.
- **API:** matchups routes take `dispositions=A,B`; the old single `disposition=` still works. Shared: `DispositionFilter` becomes `{ dispositions: string[]; side: 'row' | 'both' }` (an empty list = no filter).
- **URL:** the cross-event page stores `dispositions` (comma-separated); an old `disposition=` value is read into it.

### 2.3 Picking teams (team events)

- On Players & lists (team events are always grouped), each team header gets a **tick box** (`aria-label="Select <team>"`) and a small **Fetch team lists** button, next to the team-page link. The "No team" group has neither.
- The **Fetch lists** menu on team events offers **All missing lists (N)** and **Selected teams (T teams · N lists)** (disabled when none ticked). The X-0/X-1… options are removed on team events; singles events keep them.
- The queue request gains `teamIds: string[]` (1–200; at most one of `maxLosses`, `playerIds`, `teamIds`). It queues the missing lists of every player of those teams at the user-waiting priority (10); fetched, queued and "no list on BCP" players are skipped as today. Unknown team ids → 400.

## 3. Plan 7 — reading lists

### 3.1 The parser

`parseArmyList(text): ParsedList` in `@bcp/shared`, pure and tested against real-list samples (anonymised):

```ts
interface ParsedList {
  army: string | null; // e.g. "T'au Empire"
  detachments: string[]; // one or two names; [] when unknown
  disposition: string | null; // e.g. "Purge the Foe" (English or as written)
  format: 'gw-app' | 'header' | 'template' | 'unknown';
}
```

Formats (seen in stored lists):

- **GW app:** `Name (2000 points)` / blank / army line / optional sub-army line (e.g. "Ultramarines") / detachment line ending in `(N <word(s)>)` — e.g. `Blade of Ultramar (3 Detachment Points)` or localised `(3 puntos de destacamento)` / disposition line / `Strike Force (…)`. The detachment line is recognised by position and the trailing `(<number> <words>)`, not by English words. The army is the first non-empty line after the title; when the next line is not the detachment line it is a sub-army and ignored.
- **Header:** `+ FACTION KEYWORD: <Grand faction> - <Army>` (army = after the last `-`), `+ DETACHMENT: A, B (enhancements…)` (detachments comma-separated, the trailing parenthesis dropped), `+ FORCE DISPOSITION: X`.
- **Template:** `Factions Used: <Army>`, `Detachment(s): A, B`, `Disposition: X`.
- Anything else → `format: 'unknown'`, all fields null/empty. Never guess from free text.

**Two detachments in the GW-app format** are joined with " and " (e.g. `Houndpack Lance and Hunting Warpack`). The parser returns the joined string; the API splits it only when **both halves are known detachments** (a detachment appearing alone in some stored list). Otherwise the joined name is kept as one detachment. Header/template formats are split on commas.

### 3.2 Storage

- `army_lists` gains `parsed_army text`, `detachments text[] not null default '{}'`, `parsed_disposition text`, `parser_version integer not null default 0`.
- `saveArmyList` parses on save (current `PARSER_VERSION`).
- **Re-parse on startup:** lists with `parser_version < PARSER_VERSION` are re-parsed in batches after migrations (no BCP requests). The two-detachment split runs after, using the full set of known single detachments.

### 3.3 Inferred army (#1)

- `EventPlayer`, analysis `PlayerRow`/`PlayerRef` and `MatchupSide` gain `factionGuessed: boolean`. When `players.faction` is null and the stored current list has `parsed_army`, the player's faction is that army and `factionGuessed = true`.
- UI: wherever the faction shows, a guessed one has a small ⚠ icon with the tooltip "From the list — BCP has no army for this player" (keyboard reachable). Guessed factions count in filters and matchups; the matchup drill-down shows the icon too.

### 3.4 Detachments shown and filtered

- `EventPlayer.detachments: string[]` (from the current stored list; empty when not fetched).
- **Players & lists:** a Detachment column (joined with " + ") and a Detachment multi-select filter (any selected detachment matches).
- **Games tables and team page:** under each player, "Army · Detachment · Disposition" (disposition coloured as today; missing parts omitted).
- **Matchups:** a Detachment multi-select next to Disposition, same row/both semantics (`detachments=A,B`); players without a fetched list never match a detachment filter.

## 4. Plan 7 — Top lists search (#3)

- New page **Top lists** (`/analysis/top-lists`, header nav) with URL state.
- **Inputs:** Factions (multi; empty = all factions), date range (default last 90 days), **max losses** (default 1 = X-1 or better; 0–5), optional Dispositions and Detachments (multi).
- **Results:** one row per player at a big event in the range with `losses ≤ max` and at least one game played (the `qualifiesForMaxLosses` rule): player, team, event (link to the event page, players tab) and date, record, army (⚠ when guessed) · detachments · disposition, and a **List** button (opens the list drawer; "Fetch this list" when not fetched). Sorted by event date (newest first), then fewest losses, then most wins.
- **API:** `GET /api/players/search?factions&from&to&maxLosses&dispositions&detachments` → `{ players: [...], eventsInRange, eventsLoaded }`. Only events whose players are stored count; `eventsInRange − eventsLoaded` is shown as "N big events in this range aren't loaded yet" (plan 8 fills them).
- Detachment filtering only matches players whose list is fetched and parsed.

## 5. Plan 8 — auto-fetch (#4)

- **Planner:** every 10 minutes (`AUTO_FETCH_INTERVAL_MS`, default 600 000) while enabled, it picks **big events** (`isBigEvent`) whose phase is **finished** (`eventPhase`) and whose start date is within **`AUTO_FETCH_DAYS`** (default 60) of today, newest first, and queues what is missing, in this order per event:
  1. an `event` job if never synced;
  2. its pairings (`pairings-round` jobs, or an event job with the pairings follow-up) if `pairings_synced_at` is null;
  3. every missing list (as "All missing lists").
- **Priority:** auto-fetch jobs use priority **−10** (below normal 0 and user-waiting 10), and carry `origin = 'auto'` so they can be counted and cleared. The same partial unique indexes prevent duplicates with user jobs.
- **Catalogue:** the latest-window catalogue sync runs automatically every 6 hours while enabled (existing sync, same rate limiter), so new events appear.
- **Setting:** an `app_settings` table (key/value) holds `autoFetch: boolean` (default **true**). **Settings** gets an **Automatic fetching** switch; turning it off stops planning and deletes queued (not fetching) `origin = 'auto'` jobs. `POST /api/auto-fetch` `{ enabled }`, `GET /api/auto-fetch` → `{ enabled, lastPlannedAt, eventsPending }`.
- **Header:** the queue indicator shows user jobs as today and auto-fetch separately, e.g. "Fetching · 3 jobs · auto: 42 events left" (events with open auto jobs). Pause/resume covers both.
- **Safety:** one queue, one job per 5 s, pauses on rejected login / rate limit as today; no running or out-of-window events; no events smaller than the big-event rule.

## 6. Testing

- **Parser:** a table of anonymised list samples per format (English GW app, Spanish GW app, header, template, free text, two detachments), asserting army/detachments/disposition/format.
- **Split rule:** joined detachments split only when both halves are known; otherwise kept.
- **Re-parse on startup:** lists with an old `parser_version` are updated; no network.
- **Inferred army:** a player without a BCP faction but with a parsed list shows the army with `factionGuessed`.
- **Filters:** multi-select any-of within a filter, AND across; matchups `dispositions`/`detachments` row vs both; old `disposition=` still accepted.
- **Teams:** `teamIds` queues exactly those teams' missing lists at priority 10; unknown team → 400.
- **Top lists:** qualifying rule, sorting, unloaded-events count, detachment filter only matching parsed lists.
- **Auto-fetch:** planner picks only big finished in-window events, queues in order at priority −10 with origin auto, never duplicates, respects the off switch (and clears queued auto jobs); the catalogue refresh timer; the header's separate auto count.
- **E2E:** extend an existing spec: tick a team → Selected teams fetch; Top lists page shows a qualifying sample player.

## 7. Build order

- **Plan 6:** 1) BCP link + multi-select filters (players & matchups, API `dispositions`); 2) teams: `teamIds` queueing, ticks, menu, per-team button; e2e.
- **Plan 7:** 1) parser + tests; 2) storage, re-parse, split rule, inferred army, API fields; 3) UI: detachments column/filter, army ⚠, games/team lines, matchups detachment filter; 4) Top lists API + page; e2e and README.
- **Plan 8:** 1) `app_settings`, `origin`, priority −10, planner + catalogue timer; 2) API + Settings switch + header count; e2e/README.
