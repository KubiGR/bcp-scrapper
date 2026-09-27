# Meta: Popular Armies, Archetypes and What Top Teams Bring — Design Spec

- **Date:** 2026-09-28
- **Status:** Approved design, pending spec review
- **Builds on:** plans 1–8 (catalogue, players with W-L-D records, lists read for army and
  detachments, guessed armies, Top lists search, automatic fetching). Where this spec differs from
  earlier ones, this spec wins.

## 1. Goals

The owner wants to:

1. **Read the meta:** which factions and archetypes are played most across recent big events.
2. **See how they perform:** play rate next to results.
3. **Build a team:** which factions (and archetypes) top teams bring more often than teams overall.

### Non-goals

- Scouting a single event (no per-event breakdown page).
- Unit-based archetypes (lists are read for army, detachments and disposition only).
- Faction pairs, whole team line-ups, per-faction records inside team events (possible later).
- Pre-computed statistics tables; everything is computed on request.
- Any new BCP requests: this reads what is stored (automatic fetching fills it).

## 2. Definitions

- **Big event in range:** an event meeting the big-event rule (`isBigEvent`) whose start date is
  in the chosen range (default: the last 90 days, like Top lists). Event type filter: all, singles
  (`isTeamEvent = false`) or teams.
- **Counted player:** a stored player of such an event with at least one game played
  (wins + losses + draws > 0). Players of events whose players aren't stored yet aren't counted;
  the page says how many big events in the range aren't loaded yet.
- **Faction:** `resolveFaction(bcpFaction, parsedArmy)` as elsewhere (BCP's faction, or the army
  read from the current list when BCP has none or only an allegiance; marked guessed). A player
  still without a faction (null, or only an allegiance and no readable list) counts under
  **"Unknown faction"**, shown last and dimmed.
- **Archetype:** faction + detachments of the player's current, read list, e.g. "Orks · War
  Horde" or "Orks · Kult of Speed + Wreckas" (detachments in the order the list gives them).
  Players without a read list with detachments count under their faction as **"Detachment
  unknown"**.
- **Win rate:** (wins + ½ draws) ÷ games, summed over the counted players of a row (each game
  counts once per player).
- **X-1 or better:** players of the row with `losses ≤ 1` (draws aren't losses); count and share of
  the row's players.
- **Share:** a row's players ÷ all counted players in the range (for archetypes: of all counted
  players too, so shares are comparable across factions).
- **Minimum players:** rows with fewer players than the minimum (default 5, 1–50) are dimmed and
  sort after the others; they are never hidden.

## 3. The Meta page

- New header item **Meta** at `/analysis/meta`. URL search: `from`, `to`, `type`
  (`all|singles|teams`, default all), `minPlayers`, `sort` (`players|winRate|x1`, default
  players), `expanded` (comma-separated factions whose archetypes are open).
- Controls: date range, event type (segmented control), minimum players (number input).
- Notice: "N big events in this range aren't loaded yet" when `eventsInRange > eventsLoaded`.
- **Faction table:** Faction, Players, Share, Win rate, X-1 or better (count · %). Players with a
  guessed army count in that faction without a marker (the drill-down shows the ⚠ per player). Sorted by the chosen column descending (ties: more players,
  then name A→Z); rows below the minimum and "Unknown faction" last. Win rate coloured like the
  matchups heatmap: red below 45 %, neutral 45–55 %, green above 55 %.
- **Archetypes:** each faction row has an expand toggle (keyboard reachable) showing its
  archetypes with the same columns, "Detachment unknown" last.
- **Drill-down:** the Players figure is a button opening a drawer with the row's players: player,
  team, event (link to its players tab) and date, W-L-D, army line (`PlayerLine`), and **List**
  (the existing list drawer). It uses the Top lists search (§5).
- States: loading skeleton, error with Retry, empty ("No big events in this range" / "No
  players with games yet").

## 4. What top teams bring

Shown below the faction table when the range (with the type filter allowing teams) has at least
one counted team event.

- **Counted team event:** a team event in range whose stored teams have BCP placings (non-null
  for every team). Others (running, or no placings) are left out; the section says "Based on N
  team events".
- **Top teams:** per event, the teams with placing ≤ `ceil(teams × 0.25)` (a 7-team event keeps
  2, a 32-team event 8).
- **Slots:** each counted player of a counted team event is one slot of their team.
- **Per faction (and per archetype, expandable):** top-team slots (count), share of top-team
  slots, share of all team slots, and the **difference** in percentage points (top − all), green
  when positive, red when negative. Sorted by difference, largest first; rows with fewer than the
  minimum slots in all teams are dimmed and sort last.
- Each slot counts once, so bigger events weigh more by their number of players, but every event
  uses its own top 25 %.

## 5. API

- `GET /api/meta?from&to&type` →

  ```ts
  {
    factions: MetaRow[];            // with archetypes
    teams: TeamMetaRow[] | null;    // null when no counted team event
    totals: { players: number; games: number };
    eventsInRange: number;
    eventsLoaded: number;
    teamEventsCounted: number;
  }
  MetaRow = { faction: string | null; players; share; games; winRate; x1; x1Share;
              archetypes: ArchetypeRow[] }   // faction null = Unknown faction
  ArchetypeRow = { detachments: string[] | null; players; share; games; winRate; x1; x1Share }
                                             // null = Detachment unknown
  TeamMetaRow = { faction: string | null; topSlots; topShare; allSlots; allShare; difference;
                  archetypes: { detachments: string[] | null; topSlots; topShare; allSlots;
                                allShare; difference }[] }
  ```

  Minimum-players dimming and sorting are display concerns (web), not API.

- One query over stored players of big events in range (joined with events, teams and the
  current stored list), selecting only needed columns, like the Top lists search; aggregation in
  pure shared functions `computeMeta(rows)` and `computeTeamMeta(rows)`.
- **Top lists search** (`GET /api/players/search`) gains optional `type=all|singles|teams` and a
  detachments value `(unknown)` matching players without read detachments, and accepts
  `faction=(unknown)` via `factions` for the Unknown faction row; the drill-down calls it with
  the row's faction/detachments, the range and type, and `maxLosses=5` (everyone with games; the
  500-row cap applies).

## 6. Testing

- **Shared:** shares; win rate with draws; X-1 count and share; players without games excluded;
  Unknown faction and Detachment unknown rows; archetype keys from detachment arrays; top-25 %
  per event (7 teams → 2, 32 → 8); events without placings excluded; difference and its sort.
- **API:** range and type filters; unloaded-events count; guessed armies counted in their
  faction; `teams` null without team events; the search's `type` and `(unknown)` values.
- **Web:** table, expand/collapse by keyboard, sorting, dimming, the team section only with team
  data, the drill-down drawer and its List button, URL state round-trip.
- **E2E:** extend an existing spec: the Meta page shows the sample events' factions.

## 7. Build order

1. Shared aggregation (`computeMeta`, `computeTeamMeta`) + API route + search additions.
2. Web page (table, archetypes, team section, drill-down) + header item + e2e + README.
