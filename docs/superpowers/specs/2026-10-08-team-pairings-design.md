# Team pairings — design

## Purpose

Before a round of a 5-player team event, a team rates how each of its players does against each player of
the opposing team, and sees how the pairing procedure is likely to play out: the expected team score, which
defender to put up, which attackers to send, and every chain of decisions down to the final line-up, drawn
as a flow diagram. It replaces the team's Google Sheet matrix plus the one-off analysis done for
Balkan Team Championship 2026, R1 v Mighty Ducks Heresy.

Prep only: nothing is recorded while the real pairing happens.

## Decisions (agreed)

- **Ratings are entered by hand**, one chip per game. No suggestions from the app's win-rate data.
- **Shared by the team**: ratings are saved in the app; every signed-in user sees and edits the same matrix.
  The app has no team membership, so there are no per-team permissions.
- **5-player format only** (see Procedure).
- **Flow diagram (option B)** for the chain: left to right, one column per decision, line thickness = how likely.
- **Layout**: ratings table on top (compact, with clear gaps between cells), a summary, then the defender grid
  beside the chain.
- **Unrated games count as Y (10)**, with an "N of 25 rated" notice.
- **One chip per cell**; the sheet's multi-chip cells and "+"/"?" modifiers are left out.

## Scale

| Chip           | BOUYA | GG  | G   | Y   | R   | RR  | F   |
| -------------- | ----- | --- | --- | --- | --- | --- | --- |
| Points (of 20) | 20    | 17  | 13  | 10  | 7   | 2.5 | 10  |

Colours as in the sheet: BOUYA cyan, GG blue, G green, Y yellow, R orange, RR red, F purple.

A game is worth 20 points between the two players; the ratings are from our side. A line-up's score is the
sum of its five games, **out of 100; 50 is even**. The page always labels these as "Expected team score
(of 100)". Where a branch is not yet decided, its number is the expected (probability-weighted) score.

## Procedure (5 players)

1. Both teams secretly pick a defender.
2. Each team secretly offers two attackers to the other team's defender.
3. Each defender picks one of the two attackers offered to it. Two games are locked; the refused attackers
   go back.
4. With three players each, repeat 1–3 (both remaining players attack).
5. The two attackers refused in round 2 play the last game.

## Model

- Our rating of a game is `r`; the opponents value the same game as `20 − r` (zero-sum).
- Every simultaneous choice (defenders; attacker pairs; the two defenders' picks) is a zero-sum matrix game,
  solved exactly (mixed strategies allowed), from the end of the procedure backwards.
- "Best" means the equilibrium; "safe" means the best worst case of a pure choice.
- Size: round 1 has 5×5 defender pairs, 6×6 attacker pairs, 2×2 picks; round 2 is 3×3 and 2×2. Solving the
  whole tree takes a few milliseconds, so it runs in the browser on every rating change.

## Architecture

- **`packages/shared/src/pairing/`** (pure, tested):
  - `scale.ts` — chips, points, colours.
  - `matrix-game.ts` — exact zero-sum solver (simplex on the standard reduction): value plus both strategies.
  - `pairing.ts` — the procedure as a game: `analysePairing(ratings)` returns the expected score, our and
    their defender strategies, the 5×5 defender grid, the safe defender, and for each defender pair the six
    attacker pairs with their value against the opponent's likely send and their worst case.
  - `chain.ts` — `pairingChain(ratings, ourDefender, theirDefender, ourAttackers)`: the tree of what follows
    (their send, the picks, round-2 defenders, picks, last game) with probabilities, values and final
    line-ups; branches below 2% of their parent are folded into "other".
- **API**: ratings only.
  - Table `pairing_ratings`: `event_id`, `team_id`, `opponent_team_id`, `player_id`, `opponent_player_id`,
    `chip`, `updated_at`; primary key over the first five. Players are the event's stored players.
  - `GET /api/events/:id/teams/:teamId/pairings/:opponentTeamId` → both rosters (player, army, detachment,
    list) and the stored ratings.
  - `PUT` the same path `/:playerId/:opponentPlayerId` with `{ chip }` (or `null` to clear) → the saved cell.
  - Checks: the event exists; both teams are in it and are different; both players belong to the right team.
    Not a 5-player team → the GET returns the rosters with a reason, and the page shows it instead of analysing.
- **Web**: `/events/$eventId/teams/$teamId/pairings` with the opponent as a search param; a **Pairings** link
  on the team page.
  - `RatingsTable` — compact grid with gaps between cells; clicking a cell opens the chip picker; each change
    is saved at once (optimistic, last change wins); the page refetches every few seconds and on focus so
    teammates' edits appear. Opponent names show their list on hover/focus.
  - `PairingSummary` — expected team score, safe defender (and the unpredictable mix), their likely defender,
    "N of 25 rated".
  - `DefenderGrid` — 5×5, coloured above/below 50, values shown; click selects a square.
  - `ChainFlow` — SVG flow diagram for the selected square: "you send" picker (defaults to the best pair);
    columns Round 1 defenders → their send and the picks → round-2 defenders and picks → final line-up;
    edge thickness by probability; clicking a final box shows its five games (chips) and score. Scrolls
    sideways in its own box on a phone.

## Errors and edge cases

- Fewer or more than 5 players on either team: say which team and how many; no analysis.
- Opponent team not chosen: show the event's other teams to pick from.
- A saved cell fails: the cell shows the error and keeps the previous chip.
- All cells unrated: analysis still runs (everything is even, 50) with the notice.

## Testing

- `matrix-game`: matching pennies (0, 50/50), rock-paper-scissors (thirds), a dominant row, a 1×N game.
- `pairing`: the R1 v Mighty Ducks ratings give 49.7 expected and World Eaters as the safe defender (≥ 49.1);
  all-equal ratings give 50 everywhere; a team better in every game scores above 50.
- `chain`: probabilities of each level sum to 1 before folding; every final line-up has five distinct games;
  the World Eaters v Custodes chain matches the spreadsheet analysis.
- Speed: a full analysis under 100 ms.
- API: save, clear and read a cell; wrong event, team, opponent or player are refused; a 4-player team gets
  the reason.
- Web: rating a cell saves it; the summary and grid update; choosing a square and an attacker pair redraws
  the chain; clicking a final box shows its line-up; the non-5-player message.

## Out of scope

- 3- and 8-player formats.
- Following the real pairing live at the table.
- Suggested ratings from the app's matchup data; importing the Google Sheet.
- Multi-chip cells and "+"/"?" modifiers.
- Per-team permissions.
