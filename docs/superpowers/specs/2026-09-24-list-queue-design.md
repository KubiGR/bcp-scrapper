# Smarter List Fetching: Design Spec (plan 3)

- **Date:** 2026-09-24
- **Status:** Approved design, pending spec review
- **Builds on:** `2026-09-23-bcp-analyzer-design.md` (the main spec). This spec changes how army lists are fetched; everything else there still holds.
- **Next:** plan 4, team analysis (rounds, standings, team detail, faction matchups).

## 1. Goals

1. **Fetch lists by result.** Fetch only the lists of players who did well, chosen by **maximum losses**: X-0, X-1 or better, X-2 or better, and so on.
2. **Fetch one specific list.** A "Fetch this list" button in a player's drawer.
3. **Fetch in the background, gently.** List requests go into a persistent queue that a single worker drains at **one list every 5 seconds**, instead of a burst. Queue lists for several events, walk away, and they arrive without flooding BCP.

### Non-goals

- Top-N by placing (can be added later with the same queue).
- Background fetching of anything other than army lists. Event, pairings and catalogue syncs stay as they are.
- Running more than one API process (the queue is safe for it, but this spec doesn't require it).

## 2. Definitions

- **Losses and "X-n or better":** a player qualifies for **max losses n** when `losses ≤ n`. Draws are **not** losses, so 3-1-1 counts as X-1.
  - Players with no recorded games (`wins + losses + draws = 0`) never qualify for a result filter.
  - The rule lives in one shared function, `qualifiesForMaxLosses(player, n)`, used by the API, the menu counts and the table filter.
- **Missing list:** as today (`isMissingList`). The player has a `listId` on BCP, and no stored list exists with that `listId`.

## 3. Data model

New table **`list_queue`**:

| Column                | Type                                           | Meaning                                                          |
| --------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| `id`                  | serial PK                                      |                                                                  |
| `event_id`            | text, FK → events, cascade                     |                                                                  |
| `player_id`           | text, FK → players, cascade                    |                                                                  |
| `list_id`             | text                                           | BCP list id at the time of queueing                              |
| `priority`            | integer, default 0                             | 0 = normal, 10 = single "fetch this list"                        |
| `status`              | enum `queued` · `fetching` · `done` · `failed` |                                                                  |
| `attempts`            | integer, default 0                             |                                                                  |
| `not_before`          | timestamptz, default now                       | Not claimed before this time; used for backoff                   |
| `error`, `error_code` | text, nullable                                 | Failure reason and `ApiErrorCode` (e.g. `BCP_AUTH`) or `NO_LIST` |
| `queued_at`           | timestamptz, default now                       |                                                                  |
| `finished_at`         | timestamptz, nullable                          |                                                                  |

- A **partial unique index** on `player_id` where `status in ('queued','fetching')` allows at most one open row per player, so queueing twice is a no-op.
- An index on `(status, priority desc, queued_at)` serves the worker's claim query, and one on `(event_id, status)` serves per-event counts.
- The worker's pause state lives in memory. A restart clears a pause; a still-rejected login pauses the worker again on its first request.

## 4. The worker (`apps/api/src/list-queue/worker.ts`)

- **One loop per API process**, started in `main.ts` after migrations. It wakes every `LIST_QUEUE_INTERVAL_MS` (config, default **5000**).
- **Each tick** claims at most one row, atomically:
  `UPDATE list_queue SET status='fetching', attempts=attempts+1 WHERE id = (SELECT id FROM list_queue WHERE status='queued' AND not_before <= now() ORDER BY priority DESC, queued_at, id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`
- **Fetch:** it calls `source.getList(listId)`, through the existing rate-limited, authenticated transport. Then:
  - **List returned:** `saveArmyList(player, list)` → the row becomes `done`.
  - **`null` (no list on BCP):** the row becomes `failed` with `error_code = 'NO_LIST'` and `error = 'No list on BCP'`.
  - **`BcpAuthError`:** the row goes back to `queued` (the attempt isn't counted). The worker **pauses** with reason `login-rejected` and sends nothing more until resumed.
  - **`BcpRateLimitedError`:** the row goes back to `queued` (the attempt isn't counted). The worker pauses until `now + retryAfterSeconds`, then resumes by itself.
  - **Any other error:** if `attempts < 3`, the row goes back to `queued` with `not_before = now + [1, 5, 15][attempts-1] minutes`. Otherwise it becomes `failed`, with the error message and code.
- **Startup:** rows left in `fetching` are set back to `queued`, because a restart cut them off.
- **Pausing and stopping:**
  - `pause()` stops claiming new rows. A fetch already in flight finishes.
  - `resume()` clears the pause. `stop()` is used on shutdown and in tests.
- **No overlap:** a tick is skipped while the previous one is still running.
- **Logging:** each fetch logs `{ eventId, playerId, status, durationMs }`, never tokens.

## 5. The retired `lists` sync kind

- `POST /api/sync` with `kind: 'lists'` is **no longer accepted** (400). Old `sync_runs` rows of that kind stay as history.
- `SyncRequestSchema` drops `lists`. `SyncKindSchema` keeps it so old rows still parse.
- `EventDetail.syncs.lists` is removed. Event pages read queue counts instead (§6).

## 6. API

All state changes require a JSON body and pass the Host guard, as today.

| Route                                | Purpose                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/events/:id/lists/queue`   | Body `{ maxLosses?: 0–20, playerIds?: string[] }`, with at most one of the two. Queues missing lists for the event: all of them, those passing `maxLosses`, or exactly `playerIds` (priority 10). The event is synced first if it never was. Returns `{ queued, alreadyQueued, alreadyFetched, noListOnBcp, notQualifying, estimatedSeconds }`. `playerIds` not in the event → 400. |
| `DELETE /api/events/:id/lists/queue` | Deletes this event's `queued` rows. Returns `{ removed }`.                                                                                                                                                                                                                                                                                                                          |
| `POST /api/list-queue/retry-failed`  | Body `{ eventId? }`. Failed rows (except `NO_LIST`) go back to `queued` with `attempts = 0`. Returns `{ requeued }`.                                                                                                                                                                                                                                                                |
| `GET /api/list-queue`                | `{ paused, pausedReason: 'user' \| 'login-rejected' \| 'rate-limited' \| null, pausedUntil, intervalMs, totals: { queued, fetching, failed }, estimatedSeconds }`                                                                                                                                                                                                                   |
| `POST /api/list-queue/pause`         | Pauses (reason `user`). Returns the state.                                                                                                                                                                                                                                                                                                                                          |
| `POST /api/list-queue/resume`        | If the pause was `login-rejected`, checks BCP status first; answers 502 `BCP_AUTH` if the login is still rejected. Otherwise resumes. Returns the state.                                                                                                                                                                                                                            |

**`estimatedSeconds`** = `(queued rows ahead, including this one) × intervalMs / 1000`. Per event, it counts from the event's last queued row.

**Changed responses:**

- `EventCounts` gains `listsQueued` and `listsFailed`, where failed means only rows whose most recent attempt failed and that aren't queued again.
- `EventPlayer.listStatus` becomes `none` · `available` · `queued` · `fetching` · `fetched` · `failed`. The status comes from the stored list first, then from the player's newest queue row.
- `EventPlayer` gains `listError: string | null` (failed only).

## 7. Web

- **Players panel "Fetch lists" menu**, replacing the "Fetch all lists" button:
  - Items: "All missing lists (N)", then "X-0 only (N)" and "X-n or better (N)" for n = 1 … min(roundCount − 1, 5).
  - N counts players with `listStatus === 'available'` who pass the rule, calculated in the browser from the loaded players.
  - Items where N is 0 are disabled.
  - Choosing an item POSTs the queue request and shows a notification built from the response.
- **Event queue line**, shown when `counts.listsQueued > 0` or `listsFailed > 0`:
  - "N queued · M fetched · K failed · about T left", with **Cancel queued** and **Retry failed**.
  - While `listsQueued > 0`, the event and players queries refetch every 5 s.
- **Players table:**
  - Badges for the six list statuses. Failed shows `listError` in a tooltip.
  - A new **Record** filter: All · X-0 · X-1 or better · X-2 or better…, using the same shared rule.
- **List drawer:**
  - Available → **Fetch this list**, which queues it with priority. Failed → the reason plus **Retry**.
  - Queued or fetching → a status line with the estimate. It polls every 2 s until the list is fetched, then shows it.
- **Header queue indicator**, on every page:
  - Hidden when there are no queued, fetching or failed lists.
  - Otherwise "Lists · N queued · ~T". Clicking it opens a popover with totals, **Pause/Resume** and **Retry all failed**.
  - When paused because the login was rejected, it's red with a link to Settings.
  - It polls `GET /api/list-queue` every 5 s while not empty, and every 30 s otherwise.
- **Settings:** a **List queue** card with the same controls.
- **Accessibility and theme:**
  - Every control is keyboard reachable, and progress text is `aria-live="polite"`.
  - Figures use `numeric`. Cyan marks active or queued states; red marks failed or paused-for-login.

## 8. Configuration

- `LIST_QUEUE_INTERVAL_MS` (default 5000, minimum 100) sets the worker pace.
- `.env.example` documents it as "One list request every N ms. Keep it gentle: BCP has no public API."

## 9. Testing

- **Shared:** `qualifiesForMaxLosses`, including draws, no games and boundaries.
- **Worker** (PGlite, fake timers, a fake source):
  - priority, then first-in-first-out order;
  - one claim per tick;
  - pacing;
  - `NO_LIST` handling;
  - retry with backoff, then `failed`;
  - pause on `BcpAuthError`, with no further fetches;
  - a timed pause on a rate limit;
  - reset of rows left `fetching` after a restart;
  - skipping a tick while one is running.
- **Routes:**
  - queueing with each filter, and duplicates being no-ops;
  - `playerIds` validation;
  - cancel, retry-failed, pause and resume (including refusing to resume while the login is rejected);
  - `lists` sync kind → 400.
- **Web:**
  - the menu counts and disabled items;
  - the queue line;
  - the drawer's "Fetch this list" and its queued state;
  - the header indicator's states;
  - the record filter.
- **E2E:** "X-1 or better" → the queue drains (`LIST_QUEUE_INTERVAL_MS=200` in the Playwright env) → open a fetched list.

## 10. Build order

1. Shared rule and schemas; `list_queue` table and migration; config.
2. Worker and repository, with tests.
3. Queue routes; retire the `lists` sync kind; add the queue fields to event and player responses.
4. Web: queue client and hooks; header indicator; Settings card.
5. Web: Fetch lists menu, queue line, record filter, drawer changes.
6. E2E update; README.
