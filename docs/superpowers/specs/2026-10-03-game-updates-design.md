# Game Updates (Dataslates, MFM, Codexes) — Design Spec

- **Date:** 2026-10-03
- **Status:** Approved design, pending spec review
- **Builds on:** the BSData sync (`docs/superpowers/specs/2026-10-03-bsdata-detachments-design.md`),
  the date-range filters of Tournaments, Meta, Factions, Top lists and Matchups. Where this spec
  differs from earlier ones, this spec wins.

## 1. Goals

Warhammer 40,000 changes through official updates: points (Munitorum Field Manual, MFM), Faction
Packs, Balance Dataslates and codexes. Every tournament is played under one of them. The owner
wants:

1. **Updates as a concept:** a list of the edition's updates with start dates, built from BSData's
   history and grouped so small changes don't each become an update.
2. **Filter by update:** pick one or more updates on Tournaments, Meta, Factions, Top lists and
   Matchups.
3. **See each event's update** in the Tournaments table and on the event page.

### Non-goals

- Comparing non-adjacent updates side by side (a selection covers a continuous span).
- Reading update information from BCP (BCP has none) or from event descriptions.
- Rankings (Players) by update.

## 2. Where updates come from

- **Source:** the commit history of `BSData/wh40k-11e` (branch `main`), read during the daily
  BSData check (and its Refresh) through the GitHub API
  (`GET https://api.github.com/repos/BSData/wh40k-11e/commits?per_page=100&page=N`), stopping at
  the newest commit already stored. Commits (sha, date as the commit author's UTC day, first line
  of the message) are stored in `bsdata_commits`.
- **Update commits:** messages matching (any case) `MFM`, `Munitorum`, `Faction Pack`,
  `Dataslate`, `Balance` or `Codex`. Others (bug fixes, transports, Legends) are ignored.
- **Grouping:** update commits sorted by day; a commit less than 7 days after the previous update
  commit joins its group, otherwise it starts a new one. A group is an **automatic update**:
  `start` = its first commit's day, `lastCommit` = its last commit's day.
- **Automatic name:** `"<Mon> <YYYY> · <kinds>"` from the start day, where kinds are, in this
  order and deduplicated, "MFM" (MFM/Munitorum), "Faction Packs", "Dataslate"
  (Dataslate/Balance), and "Codex: <Faction>" for each "Codex: X" / "Codex X" named; joined with
  " & ". Example: "Jul 2026 · MFM & Faction Packs".
- **Real history (2026-10-03):** four updates — 9 Jun, 22 Jul, 29 Aug, 30 Sep 2026.

## 3. Admin edits

Stored in `game_updates` per automatic update, keyed by the sha of the group's first commit
(history only grows at its end, so a group's first commit never changes; new commits can only
extend the newest group or start a new one):

- **Rename** (`name`, null = automatic name).
- **Start date** (`start_override`, null = automatic start): e.g. GW's real release day, or a
  week later if TOs wait. It must stay after the previous update's start and before the next's.
- **Merge into previous** (`merged_into`): the update's span joins the previous visible one.
- **Hide**: the update disappears from pickers and labels; its span joins the previous visible
  one (like merging, but undoable separately).

The **effective updates** are the visible, unmerged ones with their effective start
(override, else automatic), newest first.

## 4. Which update an event used

The last effective update whose start is on or before the event's first day (UTC day of
`start_date`). Earlier events: **"Before first update"** (`update: null`).

An update's **span** runs from its start to the day before the next effective update's start; the
newest one runs to today.

## 5. What the owner sees

- **Update picker** on Tournaments, Meta, Factions, Top lists and Matchups, next to Dates: a
  multi-select of effective updates, newest first, the newest labelled "Current: …".
  - Picking updates sets the page's date range from the earliest selected start to the latest
    selected end. Updates between selected ones are included and shown ticked.
  - Clearing the picker leaves the dates as they are.
  - When the page's range equals the span of a run of consecutive updates exactly, those updates
    show as selected; otherwise the picker shows "Custom dates".
  - Nothing new is stored in the URL: the page's `from`/`to` carry the selection.
- **Event labels:** the Tournaments table shows the update name under each event's date (dimmed);
  the event page header shows "Update: <name>".
- **Settings → Updates** (under the BSData card): each update with its start (and "auto: …" when
  overridden), its span's event count, and Rename, Change date, Merge into previous, Hide / Show
  (admin only when accounts are on). An empty state says "No updates read from BSData yet."

## 6. Architecture

- **Shared:** `isUpdateCommit(message)`, `groupUpdates(commits, gapDays = 7)`,
  `effectiveUpdates(automatic, edits)`, `updateOfDay(updates, day)`, `updateSpans(updates, today)`,
  `selectionRange(spans, ids)` and `selectedUpdates(spans, from, to)`; schemas for
  `GameUpdate` (`id`, `name`, `start`, `autoStart`, `autoName`, `hidden`, `mergedInto`, `events`)
  and the event `update` field.
- **API:** `BsdataClient.commits(stopAtSha)`; tables `bsdata_commits` and `game_updates`;
  `syncUpdates(db, client)` (run after the detachment sync, same schedule; failures recorded in the
  BSData status errors as `commits`); `GET /api/updates`, `PATCH /api/updates/:id`; event list and
  event detail answers gain `update`.
- **Web:** `UpdatePicker` (props: `from`, `to`, `onChange(range)`), used on the five pages;
  `UpdatesSection` in Settings; labels in the Tournaments table and event header.

## 7. Testing

- Shared: update-commit detection; grouping with the 7-day gap (6 days joins, 7 starts a new one);
  names with kinds and codex factions; effective updates with rename, start override, merge, hide;
  event assignment including before the first update; spans; selection range with a gap filled;
  matching a range back (exact run → ids; anything else → none).
- API: commit sync with a fake client (first run reads all pages, later runs stop at the stored
  sha); regrouping keeps edits; PATCH validation (start out of order → 400) and admin rule;
  `update` on event answers.
- Web: picker fills dates, shows ticked updates for an exact range and "Custom dates" otherwise;
  Settings rename / merge / hide; Tournaments label.
