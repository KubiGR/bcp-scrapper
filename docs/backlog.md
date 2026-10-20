# Backlog

Ideas and follow-ups that aren't scheduled yet. Newest requests first within each section.
Shipped so far: plans 1–8 (catalogue, lists queue, team analysis, matchups, quick wins, reading
lists and Top lists, automatic fetching), hosting with accounts, 40kCompactor, army-name and
detachment-name matching (translations learned from BCP, Settings → Detachment names with links
by faction, names not in English kept out of Meta's detachment rows), the Meta page (archetypes
by default, ranked by a reliable win rate; armies view), Top-N list fetching, the phone layout, shareable
list links, the logo, sortable tables, account hardening, colour-blind-safe matchup colours with
the event list in a drawer, event sizes on Top lists, and two sweeps of small fixes.

## Feature ideas

- **Standings that weigh opponent strength** (requested 2026-10-20). An event's player table
  follows BCP's placing, so a 5-0 who beat only weak players sits above a 4-1 who met the top
  tables. Two measures, both shown on that event's players:
  - **Strength of schedule at this event only:** how the player's opponents did in the same
    tournament (their wins/win rate there), nothing from other events.
  - **By Elo:** the average wh40k-elo rating of the opponents they met at this event.

Dropped (2026-09-28): faction pairs in teams and top-team line-ups on the Meta page — the data
exists, but not wanted for now.

## Things a user would notice

Nothing open.

## Robustness and hygiene

- List reader: each save reads every list's detachments, and every tidy pass re-reads every
  list's text (fine at thousands of lists; revisit past tens of thousands).
- Detachment translations: a translated detachment that only ever appears paired with another
  (e.g. "Blood Legion y Cabalgata del Caos") can't be learned from BCP's single detachment field;
  link it by hand in Settings → Detachment names.
- Analysis: duplicate team or player rows in one round (bad BCP data) silently use the first.
