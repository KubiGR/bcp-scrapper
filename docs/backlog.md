# Backlog

Ideas and follow-ups that aren't scheduled yet. Newest requests first within each section.
Shipped so far: plans 1–8 (catalogue, lists queue, team analysis, matchups, quick wins, reading
lists and Top lists, automatic fetching), hosting with accounts, 40kCompactor, army-name and
detachment-name matching (translations learned from BCP, Settings → Detachment names with links
by faction, names not in English kept out of Meta's detachment rows), the Meta page (archetypes
by default, grouped by popularity; armies view), Top-N list fetching, the phone layout, shareable
list links, the logo, sortable tables, account hardening, colour-blind-safe matchup colours with
the event list in a drawer, event sizes on Top lists, and two sweeps of small fixes.

## Feature ideas

- **Pairing process.** Defender/attacker/refusal picks, if a source for them is ever found (BCP
  records only who played whom, by table). Blocked.

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
