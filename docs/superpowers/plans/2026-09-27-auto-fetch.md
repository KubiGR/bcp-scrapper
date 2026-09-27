# Automatic Background Fetching Implementation Plan (plan 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep big finished events of the last 60 days fully loaded (event, pairings, every list) without clicking, through the existing gentle fetch queue, with an on/off switch and a separate count in the header.

**Architecture:** A `AutoFetchPlanner` in the API wakes every 10 minutes (and on start), picks big finished in-window events newest first, and queues what each is missing at priority −10 with `origin = 'auto'`, using the existing enqueue functions (partial unique indexes prevent duplicates). A catalogue refresh (the existing `refreshLatest`) runs every 6 hours. The on/off state lives in a new `app_settings` table; switching off deletes queued auto jobs. The queue state gains an `auto` block so the header can show "auto: N events left".

**Tech Stack:** as plans 1–7 (Hono, Drizzle/Postgres/PGlite, Zod 4, React 19, Mantine 9, TanStack Query, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-26-lists-search-autofetch-design.md` §5.

## Global Constraints

- Node 24, pnpm 12, TypeScript `~6.0.3`, Zod 4; strict ESLint `--max-warnings=0`, no `any`, no non-null assertions; Prettier.
- Tests next to the code; no network, PGlite only; never read, print or source `.env`.
- One queue, one job per `FETCH_QUEUE_INTERVAL_MS` (5 s); the planner only **inserts** jobs, never calls BCP itself (the catalogue refresh goes through the existing SyncRunner and rate limiter).
- Auto jobs: priority **−10**, `origin = 'auto'`; never duplicate an open job; never touch running, upcoming, small (below the big-event rule) or out-of-window events.
- Defaults: `autoFetch` **true**, `AUTO_FETCH_INTERVAL_MS` 600 000, `AUTO_FETCH_DAYS` 60, catalogue refresh every 6 h (`AUTO_CATALOG_INTERVAL_MS` 21 600 000). `AUTO_FETCH_ENABLED=false` turns the planner off entirely (e2e, tests).
- Build in a worktree; migrations via `pnpm --filter @bcp/api db:generate --name <name>`.
- `pnpm vitest run --project api|web|shared <path>`. Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **User request on top of an auto job:** a user queueing a list/pairings that already has an open auto job must get their priority and `origin = 'user'`, so the job isn't stuck at −10 and isn't deleted by switching auto-fetch off. _Task 1 test._
2. **No retry storms:** a list or round whose newest job failed (any failure, incl. NO_LIST) is not re-queued by every planning pass; failures stay for the user's Retry. _Task 1 test._
3. **Events never synced:** the first pass queues the event job (with the pairings follow-up); lists are queued by a later pass once players exist — no errors in between. _Task 1 test._
4. **Switching off mid-flight:** deletes queued auto jobs only; a `fetching` auto job finishes; user jobs untouched; the planner stops planning until switched on. _Task 1 test._
5. **Header counts:** user job totals exclude auto jobs (the user's "~2 min" isn't inflated by thousands of background lists); auto shows as events left. _Tasks 1–2 tests._

---

### Task 1: Settings, origin, planner, catalogue timer (API)

**Files:**

- Modify: `apps/api/src/db/schema.ts` (+ migration `auto-fetch`), `apps/api/src/db/test-db.ts` (`resetDb` truncates `app_settings`), `apps/api/src/config.ts` (+ test), `apps/api/src/repo/fetch-queue.ts` (+ test), `apps/api/src/fetch-queue/worker.ts` (`state()`), `apps/api/src/main.ts`, `packages/shared/src/api.ts`
- Create: `apps/api/src/repo/app-settings.ts` (+ test), `apps/api/src/fetch-queue/auto-fetch.ts` (+ `auto-fetch.test.ts`), `apps/api/src/routes/auto-fetch.ts` (+ test), mount in `apps/api/src/app.ts`

**Interfaces:**

- Schema: `fetch_queue.origin text not null default 'user'` (`'user' | 'auto'`); `app_settings (key text primary key, value jsonb not null, updated_at)`.
- `getAutoFetchEnabled(db): Promise<boolean>` (default true when unset), `setAutoFetchEnabled(db, enabled)`.
- Enqueue functions take `origin?: 'user' | 'auto'` (default `'user'`). When a **user** request meets an open job, the job's priority is raised to the request's if higher and its origin set to `'user'` (all kinds, all priorities — generalising today's single-list raise).
- `deleteQueuedAutoJobs(db): Promise<number>` (status `queued`, origin `auto`).
- `autoJobSummary(db): Promise<{ jobs: number; events: number }>` (open auto jobs; distinct events with one).
- `queueTotals` counts **user** jobs only (origin `user`); `FetchQueueState` gains `auto: { jobs: number; events: number; enabled: boolean }`; `estimatedSeconds` from user jobs only.
- `class AutoFetchPlanner({ db, runner, logger, eventRule, days, intervalMs, catalogIntervalMs, now })` with `start()`, `stop()`, `planOnce(): Promise<{ events: number; jobs: number }>`, `lastPlannedAt: Date | null`.
- `planOnce`: when enabled — events with `isBigEvent`, `eventPhase(...) === 'finished'`, start within `days` of today, newest first; per event:
  1. never synced (`lastSyncedAt` null) → `enqueueEventPairings(rounds: null, priority −10, origin auto)`;
  2. else pairings not synced and no failed pairings job for it (`eventPairingsJobs(...).failed === 0`) → rounds `1..roundCount` via `enqueueEventPairings`;
  3. else-and-also (synced event) → missing lists (`findPlayersMissingLists`) minus players whose newest list job failed → `enqueueLists(..., −10, 'auto')`.
- Routes: `GET /api/auto-fetch` → `{ enabled, lastPlannedAt, eventsPending }`; `POST /api/auto-fetch` `{ enabled: boolean }` (requireJson; admin only when auth is required) → same body; switching off calls `deleteQueuedAutoJobs`, switching on triggers `planOnce()` (not awaited).
- Config: `AUTO_FETCH_ENABLED` (`true|false|1|0`, default true), `AUTO_FETCH_INTERVAL_MS`, `AUTO_FETCH_DAYS`, `AUTO_CATALOG_INTERVAL_MS`.

- [ ] **Step 1: Schema + migration** (`db:generate --name auto-fetch`).
- [ ] **Step 2: Tests first.**
  - `app-settings.test.ts`: default true; set false → false; set true → true.
  - `fetch-queue.test.ts`: an auto list job then a user single-list request → one row, priority 10, origin user; an auto pairings round then a user event-page request (priority 10) → raised and user; a bulk user request (priority 0) over an auto job (−10) → 0 and user; `deleteQueuedAutoJobs` deletes queued auto only (not fetching, not user); `queueTotals` ignores auto; `autoJobSummary` counts jobs and events.
  - `auto-fetch.test.ts` (sample fixtures, fake clock, `ALL_EVENTS` rule and a tiny-event rule): picks only finished big in-window events, newest first; never-synced → one event job with follow-up at −10 auto; synced without pairings → rounds; synced → missing lists; second pass queues nothing new; a failed list job and a failed round are not re-queued; disabled → nothing queued; out-of-window and running events untouched; `AUTO_FETCH_DAYS` respected.
  - `routes/auto-fetch.test.ts`: GET defaults; POST false deletes queued auto jobs and returns enabled false; POST true plans; validation 400; member → 403 when auth is on.
  - `config.test.ts`: defaults and parsing of the four variables.
    Run — expect FAIL.
- [ ] **Step 3: Implement.** `main.ts`: create the planner after the worker; `if (config.AUTO_FETCH_ENABLED) await planner.start()`; stop it in `shutdown` before the worker. The catalogue timer calls `refreshLatest({ db, runner }, now())` every `catalogIntervalMs` while enabled (and once on start), logging failures. `playwright.config.ts` API env: `AUTO_FETCH_ENABLED=false`.
- [ ] **Step 4: Run, check, commit.** `pnpm check`, `pnpm e2e` (2 passed), commit `feat(api): automatic background fetching of big finished events`.

---

### Task 2: Settings switch and header count (web), README

**Files:**

- Create: `apps/web/src/features/settings/AutoFetchCard.tsx` (+ test), `apps/web/src/features/settings/auto-fetch-queries.ts`
- Modify: `apps/web/src/routes/settings.tsx`, `apps/web/src/features/fetch-queue/QueueIndicator.tsx` (+ test), `apps/web/src/test/sample-data.ts` (queue state `auto`), `README.md`

**Interfaces:**

- `autoFetchQuery` (`GET /api/auto-fetch`), `setAutoFetch(enabled)`.
- `AutoFetchCard`: Panel "Automatic fetching" with a Mantine `Switch` (label "Fetch big finished events of the last 60 days in the background"), a line "N events left · last planned 10:42" (or "Nothing left to fetch"), loading/error states; switching invalidates `autoFetchQuery` and the queue query; when auth is on and the user isn't an admin, the switch is disabled with "Only admins can change this".
- `QueueIndicator`: label parts become `Fetching · 3 jobs · ~2 min · auto: 42 events left` (auto part only when `auto.enabled && auto.events > 0`); the indicator also shows when only auto work is left ("Fetching · auto: 42 events left").

- [ ] **Step 1: Tests first.** Card: shows state, toggles off (POST `{enabled:false}`), shows events left, disabled for members; indicator: user jobs and the auto part, auto-only label, hidden when nothing at all. Run — expect FAIL.
- [ ] **Step 2: Implement**; add the card to Settings under the fetch queue card.
- [ ] **Step 3: README** ("Automatic fetching": what it does, the window, priority below your own requests, the switch, the env variables).
- [ ] **Step 4: Run, check, commit.** `pnpm check`, `pnpm e2e`, commit `feat(web): automatic fetching switch and header count`.
