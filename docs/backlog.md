# Backlog

Ideas and follow-ups that aren't scheduled yet. Newest requests first within each section.
Shipped so far: plans 1–8 (catalogue, lists queue, team analysis, matchups, quick wins, reading
lists and Top lists, automatic fetching) and hosting with accounts.

## Feature ideas

- **More team views on the Meta page.** Factions that go together in teams, whole top-team
  line-ups, and each faction's record inside team events (left out of the first Meta page).
- **Pairing process.** Defender/attacker/refusal picks, if a source for them is ever found (BCP
  doesn't expose them).
- **Top-N list fetching.** Queue lists by placing (top 8, top 16) in addition to "X-n or better".

## Things a user would notice

- Lists export shows BCP's faction, not the army guessed from the list.
- Automatic fetching: the Settings label always says "last 60 days"; with
  `AUTO_FETCH_ENABLED=false` the switch still shows as on.
- Pairings: the gate says "N rounds failed" rather than naming the round, and counts a failed
  event load as a round; Retry on the event page also re-queues the event's failed list jobs.
- Pairings: during a refresh the progress shows "6/6 rounds" at once; a never-synced event's first
  estimate covers only the event job; Fetch pairings silently does nothing for a synced event with
  0 rounds.
- Finder: a deep search over a future date range offers no Fetch; CoverageNotice and CatalogStatus
  can both toast and poll for the same catalogue run.
- Sync buttons stay disabled after a lost-track error until the next refetch.
- The list drawer says "paused" for a list that is mid-fetch while the queue is paused.
- The resume refusal message still says "restart the API, then resume"; a restart alone clears
  the pause.
- Top lists: the default range uses the browser's date and the API's UTC date, so around midnight
  they can differ by a day.
- Matchups: the cross-event drill-down lists games by event name; order by event date instead.
- The ⚠ "guessed from the list" icon isn't announced by screen readers (`role="img"` + label).

- Meta: archetype sub-rows don't follow the chosen sort or minimum-players dimming (team
  archetypes are never dimmed); the drill-down briefly shows the previous row's players; typing
  0 in Min players jumps back to 5; the difference can read "−0.0 pp" in red; sort headers lack
  `aria-sort`.

## Robustness and hygiene

- Accounts: expired sessions are never purged; password change has no limit on wrong current
  passwords; logging in as someone else in the same browser leaves the first session valid; two
  admins demoting each other at the same moment can leave no admin; a duplicate-username race
  returns 500 instead of "taken"; the login limiter map has no hard size cap.
- Hosting: the `cloudflared` image is `:latest`, not pinned.
- List reader: a GW-app title line without "(N points)" and no blank line can be taken as the
  army ("(2 CP)" lines aren't excluded); nested parentheses in a header `DETACHMENT:` line produce
  junk detachments; the template format doesn't straighten curly apostrophes; an "A and B" saved
  before A and B are known is only split on the next restart; each save reads every list's
  detachments.
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
- Meta: running team events are excluded only because BCP gives them no placings (also require
  `ended`); the top-quarter cutoff counts teams with a counted player, not all teams; no tests for
  3 teams → top 1 or for partially placed events.
- Tests: no integration test of a stored game's team-matchup link; a `delegate()` test helper is
  duplicated.
