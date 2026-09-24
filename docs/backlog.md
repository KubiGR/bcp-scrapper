# Backlog

Ideas and follow-ups that aren't scheduled yet. Newest requests first within each section.

## Next up

- **Plan 5: faction matchups.** The matchup matrix per event (win rate / average game points toggle, min games, drill-down) and the cross-event `/analysis/matchups` page with bulk pairings sync. Designed in `docs/superpowers/specs/2026-09-24-team-analysis-design.md` (§5.5–5.6, §7.5).

## Feature ideas

- **Compact lists with 40kCompactor.** A "Compact on 40kCompactor" button in the list drawer copies the list to the clipboard and opens https://desjani.github.io/40kCompactor/ in a new tab (paste, then Compact). The site takes no URL input and has no license, so we link to it rather than bundle its code. Chosen 2026-09-24: copy + open.
- **Archetypes, team compositions and popular armies.** Analyse which army archetypes are played, how teams are composed (faction mixes per team), and which armies are most popular, per event and across events.
- **The mission played.** Show the mission each game or round was played on, and use it in the analysis (for example, results by mission).
- **Pairing process.** Defender/attacker/refusal picks, if a source for them is ever found (BCP doesn't expose them).
- **Top-N list fetching.** Queue lists by placing (top 8, top 16) in addition to "X-n or better".

## Small follow-ups

From the reviews of plans 2–4; none blocks anything.

- Finder: a deep search over a future date range offers no Fetch.
- Finder: CoverageNotice and CatalogStatus can both toast and poll for the same catalogue run.
- Sync buttons stay disabled after a lost-track error until the next refetch.
- The resume refusal message still says "restart the API, then resume"; a restart alone clears the pause.
- The list drawer says "paused" for a list that is mid-fetch while the queue is paused.
- `queueEventLists` classifies players via the derived list status, so a failed player whose BCP list id was later cleared counts as "already fetched" in the notification.
- `countEventParticipants` computes the missing-list set twice.
- A priority raise from the event page can miss an event job that is being fetched at that moment (matters once plan 5 queues at priority 0).
- Analysis: duplicate team or player rows in one round (bad data) silently use the first; one-sided missing scores have no test.
- Tests: no integration test of a stored game's team-matchup link since the old pairings sync tests were removed; a `delegate()` test helper is duplicated.
- Pairings: the gate says "N rounds failed" rather than naming the round ("Round 4 failed"), and counts a failed event load as a round; expose failed rounds and an event-load flag (fits plan 5).
- Pairings: Retry on the event page re-queues the event's failed list jobs too; add a kinds filter to retry-failed (fits plan 5).
- Pairings: during a refresh the progress shows "6/6 rounds" at once, and a never-synced event's first estimate covers only the event job.
- Pairings: Fetch pairings silently does nothing for a synced event with 0 rounds.
