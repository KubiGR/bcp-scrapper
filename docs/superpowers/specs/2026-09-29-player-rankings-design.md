# Player Rankings — Design Spec

- **Date:** 2026-09-29
- **Status:** Approved design, pending spec review
- **Builds on:** the catalogue, players with placings, teams with placings, lists read for army and
  detachments, the big-event rule, Top lists and Meta. Where this spec differs from earlier ones,
  this spec wins.

## 1. Goals

The owner wants to:

1. **Know the top players:** a ranking of players across recent big events, by tournament points.
2. **Follow a player:** their results event by event, with the lists they played.
3. **Spot top players elsewhere:** a rank badge next to top-100 players wherever players are listed.

### Non-goals

- Changing any Meta or Factions number by player strength (possible later, built on these ranks).
- Game-by-game ratings (Elo); scores come from placings only.
- New BCP requests: everything is read from what is stored.
- Stored rankings: computed on request, like Meta.

## 2. Definitions

- **Player:** a BCP account, identified by its account id (`user.id` in BCP's player data). The
  same account at different events is one player. Entries without an account id aren't ranked.
  The name shown is the one from the player's most recent counted event.
- **Counted event:** a big event (`isBigEvent`) that has finished (`eventPhase = 'finished'`) and
  started within the last 12 months (start date after today minus 365 days).
- **Counted result:** a stored player of a counted event with an account id and a placing:
  - **Singles:** the player's own placing among the event's players.
  - **Teams:** the team's placing among the event's teams; every member of the team gets it.
  - Dropped players count with their placing. A result without a placing (player or team) isn't
    counted.

## 3. Scoring

For one counted result:

- **Field:** N = the number of placed entries of that event (players for singles, teams for team
  events).
- **Placing score:** `(N − placing) / (N − 1)`: 1 for 1st, 0 for last; 1 when N = 1. Clamped to
  0–1 (a placing above N gives 0).
- **Size factor:** `sqrt(players / 100)`, where players is the event's player count (for a team
  event, all team members): 20 players ≈ 0.45, 40 ≈ 0.63, 100 = 1, 400 = 2, 1,000 ≈ 3.16. No cap:
  bigger events count more (changed 2026-09-29 from `min(1, ln(players) / ln(100))`, which
  counted every event of 100+ players the same).
- **Event score:** `100 × placing score × size factor`, rounded to one decimal for display
  (computed unrounded).

A player's **points** are the sum of their 5 best event scores among their counted results.
Players are ranked by points (high first), then by more counted results, then by their best
single event score, then by name (A→Z). Ranks are the positions 1, 2, 3… in that order, so no
two players share a rank.

## 4. What the owner sees

### Players page (`/players`, header link "Players")

- A table: rank, player (link to their page), points, events ("5 of 8": counted of all counted
  results), best result ("1st of 96 · London GT", singles or team), and the factions they played
  most (up to 2, by counted results).
- A name search (case-insensitive substring) and a faction filter (players with at least one
  counted result with that faction). Filters keep each player's overall rank.
- The top 100 first, with "Show more" loading 100 more at a time. Columns sort like the other
  tables (default: rank).
- An explanation line: "Points: the 5 best results of the last 12 months at big events. 1st place
  at a 100-player event scores 100; bigger events score more (400 players: 200), smaller ones less
  (20 players: 45)."

### Player page (`/players/$userId`)

- Name, rank ("#12 of 3,456") and points; when their oldest counted result drops out of the
  12 months.
- History, newest first: date, event (link to its players tab), team name (team events), faction
  and detachments with a List button (the same list dialog as elsewhere), placing ("3rd of 64";
  team events "2nd of 20 teams"), event score, and a mark on the (up to) 5 results that count.
- Events outside the 12 months or not counted (small, running) are listed too, dimmed, with no
  score, so the history is complete.

### Rank badges

- Players ranked 1–100 get a small badge ("#12") next to their name in: Top lists, the event
  page's players and teams tables, and the Meta players drawer. The badge links to their page.
- The site asks for the top 100 once and keeps it for 5 minutes.

## 5. Architecture

- **Schema:** `players.bcp_user_id` (text, nullable, indexed). Set by the player mapper from
  `user.id`. A migration fills it for stored players from `raw -> 'user' ->> 'id'`.
- **Shared:** `computeRankings(results, today)`, a pure function from counted-result rows
  (account id, name, event id and name, start date, team or singles, placing, field size, player
  count, faction, detachments) to ranked players with their event scores. Scoring helpers
  (`placingScore`, `sizeFactor`, `eventScore`) exported for tests.
- **API:**
  - `GET /api/players?search=&faction=&offset=&limit=`: ranked players (rank, account id, name,
    points, counted/all results, best result, top factions) and the total count.
  - `GET /api/players/:userId`: the player's rank, points, oldest counted date and full history
    (404 for an unknown account).
  - `GET /api/players/top`: `{ userId: rank }` for the top 100.
  - Event players, team players, Top lists and the Meta players drawer answers gain each
    player's `bcpUserId` (nullable).
- **Web:** `PlayersPage`, `PlayerPage`, `RankBadge` (reads the top-100 query), routes
  `/players` and `/players/$userId`, "Players" in the header.

## 6. Testing

- Shared: placing score (1st, last, N = 1, beyond N), size factor (20, 40, 100, 300), event score,
  best 5 of more, the 12-month cut-off, team results shared by members, ties, no account id left
  out.
- API: the migration backfill from raw; mapper sets the account id; ranking, player and top
  endpoints (search, faction, paging, 404); running and small events not counted.
- Web: Players page (rows, search, faction filter, show more), player page (history, counted
  marks, dimmed uncounted), badges in Top lists and the event players table.
