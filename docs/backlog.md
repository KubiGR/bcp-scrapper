# Backlog

Ideas and follow-ups that aren't scheduled yet. Newest requests first within each section.
Shipped so far: plans 1–8 (catalogue, lists queue, team analysis, matchups, quick wins, reading
lists and Top lists, automatic fetching), hosting with accounts, 40kCompactor, army-name and
detachment-name matching (translations learned from BCP, Settings → Detachment names with links
by faction, names not in English kept out of Meta's detachment rows), the Meta page (archetypes
by default, grouped by popularity; armies view), Top-N list fetching, the phone layout, shareable
list links, the logo, sortable tables, and a sweep of small fixes (lists export army, automatic
fetching card, pairings messages, Matchups order, screen-reader ⚠, iPhone icon).

## Feature ideas

- **Pairing process.** Defender/attacker/refusal picks, if a source for them is ever found (BCP
  records only who played whom, by table). Blocked.

Dropped (2026-09-28): faction pairs in teams and top-team line-ups on the Meta page — the data
exists, but not wanted for now.

## Things a user would notice

- Pairings: a never-synced event's first estimate covers only the event job, not the rounds it
  will queue.
- Finder: a deep search over a future date range offers no Fetch; CoverageNotice and CatalogStatus
  can both toast and poll for the same catalogue run.
- Sync buttons stay disabled after a lost-track error until the next refetch.
- The resume refusal message still says "restart the API, then resume"; a restart alone clears
  the pause.
- Top lists: the default range uses the browser's date and the API's UTC date, so around midnight
  they can differ by a day.
- The header's "auto: N events left" still reads the stored switch when the server runs without
  automatic fetching (it shows nothing then only because no automatic jobs exist).

## Robustness and hygiene

- Accounts: expired sessions are never purged; password change has no limit on wrong current
  passwords; logging in as someone else in the same browser leaves the first session valid; two
  admins demoting each other at the same moment can leave no admin; a duplicate-username race
  returns 500 instead of "taken"; the login limiter map has no hard size cap.
- Hosting: the `cloudflared` image is `:latest`, not pinned.
- List reader: a GW-app title line without "(N points)" and no blank line can be taken as the
  army ("(2 CP)" lines aren't excluded); nested parentheses in a header `DETACHMENT:` line produce
  junk detachments; the template format doesn't straighten curly apostrophes; each save reads every
  list's detachments, and every tidy pass re-reads every list's text (fine at thousands of lists).
- Detachment translations: a translated detachment that only ever appears paired with another
  (e.g. "Blood Legion y Cabalgata del Caos") can't be learned from BCP's single detachment field;
  it stays as written.
- Automatic fetching: an event whose rounds are all done but `pairings_synced_at` is null is
  re-checked every pass and never marked; the 6-hourly catalogue refresh runs even while the
  queue is paused for a rejected login; a list stored under a different id than requested would
  be re-fetched every pass.
- Queue: `queueEventLists` classifies players via the derived list status, so a failed player
  whose BCP list id was later cleared counts as "already fetched"; `countEventParticipants`
  computes the missing-list set twice.
- Matchups: the cross-event page refetches all games every 5 s while any event syncs.
- Analysis: duplicate team or player rows in one round (bad data) silently use the first;
  one-sided missing scores have no test.
- Tests: no integration test of a stored game's team-matchup link; a `delegate()` test helper is
  duplicated.
