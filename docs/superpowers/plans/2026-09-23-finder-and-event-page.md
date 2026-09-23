# Finder & Event Page Implementation Plan (plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build feature 1 end to end:

- a tournament finder: size presets, a "Latest" default view, deep search, and fetching date ranges that haven't been fetched from BCP yet;
- an event page: players, list status, a list drawer, "Fetch all lists" with progress, and `.txt`/`.json` export.

Also: the read API these screens need, catalogue freshness, and a Playwright smoke test.

**Architecture:**

- The API gets:
  - catalogue coverage and a server-side "keep the latest window fresh" rule (`POST /api/catalog/latest`);
  - an event detail read model (counts, freshness, the latest sync run of each kind);
  - player, list and export routes.
- Pure date-range logic (`latestWindow`, `mergeRanges`, `findGaps`) lives in `@bcp/shared`, so the API and the web app compute coverage the same way.
- The web app:
  - keeps finder state in the URL (TanStack Router `validateSearch`);
  - follows sync runs by polling inside a TanStack mutation, so there are no effects for polling;
  - renders tables with `mantine-datatable` inside the existing `Panel`.

**Tech Stack:** as plan 1, plus `@mantine/dates` 9.6.2, `@mantine/notifications` 9.6.2, `mantine-datatable` 9, `dayjs`, and `@playwright/test` 1.63.

**Spec:** `docs/superpowers/specs/2026-09-23-bcp-analyzer-design.md` (§7 freshness and coverage, §8 routes, §10 web app, §11 errors, §12 testing).

**Deliberate refinements of the spec (apply when reading it):**

- The finder's automatic refresh is a server rule: `POST /api/catalog/latest` checks whether the latest window (the last 30 days plus the next 7) was synced within 6 hours, and only then starts a catalogue run. The finder calls it once per visit.
- The **Rounds** tab and the other analysis tabs are plan 3. The event page gets a `Tabs` container with just "Players & lists", so plan 3 can add tabs.
- The Playwright smoke test covers: finder → fetch a coverage gap → open an event → fetch all lists → read a list. Plan 3 extends it with the heatmap.
- `DATABASE_URL=pglite://memory` runs an in-memory Postgres (PGlite). The e2e test uses it, which keeps the "tests never touch a real Postgres" rule.
- The finder shows 25 events per page.

## Global Constraints

Everything in plan 1's Global Constraints still holds (Node 24, pnpm 12, TypeScript `~6.0.3`, Zod 4 APIs, strict type-checked ESLint with `--max-warnings=0`, no `any`, tests next to code, Prettier style, no network or real Postgres in tests). In addition:

- **Mantine versions:** every `@mantine/*` package is pinned to the installed `@mantine/core` version, **9.6.2**.
- **Theme:** dark only, minimal sci-fi.
  - Every content block sits in `Panel`.
  - Cyan (`neon`) is the only accent in the interface chrome; magenta is reserved for data.
  - Every figure uses the global `numeric` class.
  - No glow, no decorative animation.
- **React:** React Compiler is on, so there's no manual `useMemo`/`useCallback`/`React.memo`.
- **API data:** everything the web app reads from the API is validated by a `@bcp/shared` schema through `apiGet`/`apiPost`.
- **Dates:** event dates are calendar days, formatted in **UTC** (`formatEventDates`), so a date never shifts with the viewer's time zone.
- **UI states:** every data view has a loading state, an empty state, and an error state with Retry.
- **Commits:** every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

The inputs most likely to bite a real user that no feature test would otherwise hit. Each one has a pinned test in its owning task.

1. **Opening an event that has only been seen in the catalogue, or isn't in the catalogue at all.** The page must load it from BCP (auto event sync, or a "Fetch from BCP" button), not crash or show an empty table. Tested in Task 5 (a catalogue-only detail has `stale: true` and zero counts) and Task 7 (the not-in-catalogue state).
2. **A hand-edited URL with a maximum below the minimum, or garbage values.** The finder must open with sensible defaults rather than an API 400. Tested in Task 8 (`finder-search.test.ts`).
3. **A deep-search date range that is partly fetched.** Only the unfetched part is offered, and ranges that touch day to day merge. Tested in Task 4 (`catalog.test.ts`).
4. **Event names with accents, quotes or slashes in export filenames.** The download must get a safe filename and a valid `Content-Disposition`. Tested in Task 5 (`lists-export.test.ts`).
5. **Events whose lists BCP hides, or lists that fail.** The user sees why the fetch count is short. Tested in Task 7 (`FetchListsButton.test.tsx`).

## File Map

```
packages/shared/src/
  sync.ts            + SyncRun.range
  api.ts             + DateRange, CatalogCoverage, LatestRefresh, EventDetail, EventPlayer, PlayerList, ListExportFormat
  catalog.ts         (new) toIsoDate, addDays, latestWindow, mergeRanges, findGaps, estimateCatalogRequests
apps/api/src/
  lib/sleep.ts                    (new) shared sleep
  bcp/auth.ts                     token endpoint retries; fallback access token stays usable
  db/client.ts, db/test-db.ts     pglite://memory support
  freshness.ts                    (new) isLatestFresh, isEventStale
  catalog.ts                      (new) getCoverage, refreshLatest
  event-detail.ts                 (new) getEventDetail
  lists-export.ts                 (new) listsToText, exportFileName
  repo/sync-runs.ts               + range, listSucceededCatalogRuns, latestEventSyncRuns
  repo/participants.ts            + listEventPlayers, countEventParticipants
  repo/lists.ts                   + findPlayerList, listEventArmyLists, ExportedList
  routes/require-json.ts          (new) JSON content-type middleware
  routes/catalog.ts               (new) coverage + latest
  routes/events.ts                detail, players, export, player list
apps/web/src/
  api/client.ts                   + apiPost, schema failures → ApiError
  lib/format.ts                   + formatEventDates, formatIsoDay, formatEventSize
  components/ErrorState.tsx, RouteError.tsx, EventStatusBadges.tsx
  features/sync/follow-sync.ts, use-sync.ts
  features/finder/*               finder-search, finder-queries, FinderPage, SizeFilter, AdvancedSearch,
                                  CatalogStatus, CoverageNotice, EventsTable
  features/event/*                event-queries, players-filter, EventPage, EventHeader, PlayersPanel,
                                  ListDrawer, FetchListsButton, ExportMenu, ListStatusBadge
  routes/index.tsx, routes/events.$eventId.tsx
  test/render.tsx (+ stubFetchRoutes), test/sample-data.ts
e2e/finder-to-list.spec.ts, playwright.config.ts
```

---

### Task 1: BCP token endpoint resilience (plan-1 follow-ups)

**Files:**

- Create: `apps/api/src/lib/sleep.ts`
- Modify: `apps/api/src/bcp/auth.ts`, `apps/api/src/bcp/rate-limiter.ts`, `apps/api/src/bcp/http-transport.ts`
- Test: `apps/api/src/bcp/auth.test.ts`, `apps/api/src/bcp/auth-transport.test.ts` (adjust only as described in Step 5)

**Interfaces:**

- Consumes: `retryDelayMs(attempt, retryAfterHeader)` and `parseRetryAfterSeconds(header)` from `http-transport.ts`; `settle()` from `test/helpers.ts`.
- Produces: `sleep(ms): Promise<void>` in `apps/api/src/lib/sleep.ts`. `BcpAuth`'s public API is unchanged.

The three items parked at the end of plan 1:

1. A 5xx, 429 or network failure on `/oauth/token` isn't retried.
2. A network error from `status()` becomes a 500 instead of a 502.
3. A still-valid access token becomes unusable once its refresh token is rejected.

- [ ] **Step 1: Write the failing tests** (append to `apps/api/src/bcp/auth.test.ts`; add `afterEach`, `beforeEach` to the vitest import, `BcpRateLimitedError` to the errors import, and `import { settle } from '../test/helpers';`)

```ts
describe('BcpAuth token endpoint resilience', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a transient 503 and then refreshes', async () => {
    const fresh = fakeJwt(NOW + 3_600_000);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(tokenResponse(fresh));
    const auth = makeAuth({ envRefreshToken: 'r1', fetch: fetchMock });

    await expect(settle(auth.getAccessToken())).resolves.toBe(fresh);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after three network errors with BcpUnavailableError, also from status()', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    const auth = makeAuth({ envRefreshToken: 'r1', fetch: fetchMock });

    await expect(settle(auth.getAccessToken())).rejects.toBeInstanceOf(BcpUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // An AppError, so /api/bcp/status answers 502 BCP_UNAVAILABLE instead of 500 INTERNAL.
    await expect(settle(auth.status())).rejects.toBeInstanceOf(BcpUnavailableError);
  });

  it('maps a persistent 429 to BcpRateLimitedError', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          new Response('slow down', { status: 429, headers: { 'retry-after': '2' } }),
        ),
      );
    const auth = makeAuth({ envRefreshToken: 'r1', fetch: fetchMock });

    const error = await settle(auth.getAccessToken()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BcpRateLimitedError);
    expect((error as BcpRateLimitedError).retryAfterSeconds).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps a still-valid access token usable after BCP rejects the refresh token', async () => {
    const valid = fakeJwt(NOW + 3_600_000);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('no', { status: 401 }));
    const auth = makeAuth({ envRefreshToken: 'dead', envAccessToken: valid, fetch: fetchMock });

    await expect(auth.refresh()).rejects.toBeInstanceOf(BcpAuthError);
    expect(await auth.getAccessToken()).toBe(valid);
    expect((await auth.status()).state).toBe('connected');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run --project api src/bcp/auth.test.ts`
Expected: the four new tests FAIL. There's only one POST per refresh, a 429 becomes `BcpUnavailableError`, and after a rejection `getAccessToken()` throws.

- [ ] **Step 3: Add the shared `sleep` and use it everywhere**

`apps/api/src/lib/sleep.ts`:

```ts
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
```

In `rate-limiter.ts` and `http-transport.ts`, delete the local `const sleep = …` line and add `import { sleep } from '../lib/sleep';`.

- [ ] **Step 4: Change `BcpAuth`**

In `apps/api/src/bcp/auth.ts`:

1. Imports and a constant:

```ts
import { BcpAuthError, BcpRateLimitedError, BcpUnavailableError } from '../errors';
import { sleep } from '../lib/sleep';
import { parseRetryAfterSeconds, retryDelayMs } from './http-transport';
```

```ts
/** Network errors, 5xx and 429 from the token endpoint are retried this many times in total. */
const REFRESH_ATTEMPTS = 3;
const DEFAULT_RATE_LIMIT_SECONDS = 60;
```

2. Replace `#needsRefresh` with:

```ts
  /**
   * Refresh only when the access token is missing or (nearly) expired. A still-valid access token
   * keeps working after BCP refused the refresh token, so a pasted BCP_ACCESS_TOKEN fallback stays
   * usable; a dead one fails on its first 401, and the transport's refresh() then fails fast.
   */
  #needsRefresh(session: BcpSession): boolean {
    return session.refreshToken !== null && this.#isExpiring(session);
  }
```

3. Add this method to the class:

```ts
  /** POSTs the refresh, retrying network errors, 5xx and 429 with backoff. */
  async #postRefresh(refreshToken: string): Promise<Response> {
    for (let attempt = 1; ; attempt += 1) {
      let response: Response;
      try {
        // Unlike the data endpoints, BCP's token endpoint has no /v1 prefix.
        response = await this.#fetch(new URL('/oauth/token', this.#options.apiUrl), {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'client-id': 'web-app' },
          body: JSON.stringify({ refresh_token: refreshToken, grant_type: 'refresh_token' }),
          signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
        });
      } catch (error) {
        if (attempt >= REFRESH_ATTEMPTS) {
          throw new BcpUnavailableError('Could not reach BCP to refresh the login', error);
        }
        await sleep(retryDelayMs(attempt, null));
        continue;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) return response;
      const retryAfter = response.headers.get('retry-after');
      if (attempt >= REFRESH_ATTEMPTS) {
        if (response.status === 429) {
          throw new BcpRateLimitedError(
            parseRetryAfterSeconds(retryAfter) ?? DEFAULT_RATE_LIMIT_SECONDS,
          );
        }
        throw new BcpUnavailableError(`BCP could not refresh the login (HTTP ${response.status})`);
      }
      await sleep(retryDelayMs(attempt, retryAfter));
    }
  }
```

4. In `#doRefresh`, replace everything from the `// Unlike the data endpoints…` comment down to and including the `429 || >= 500` block with:

```ts
const response = await this.#postRefresh(session.refreshToken);
```

The following `if (!response.ok) { this.#rejectedRefreshToken = …; throw new BcpAuthError(…) }` stays unchanged.

- [ ] **Step 5: Run the auth tests; reconcile older tests with the intended behaviour**

Run: `pnpm vitest run --project api src/bcp`

The four new tests must PASS. Some older tests pinned the behaviour this task deliberately changes. Update only those, keeping each one's intent:

- **A test that expected one POST for a single 503/429:** it now needs `vi.useFakeTimers()` plus `settle()`, and expects 3 POSTs and the new error type.
- **A C1 test in `auth-transport.test.ts` whose access token is still valid by its expiry and which counted data requests** (as opposed to POSTs to `/oauth/token`): the second `get()` now sends one data request, gets a 401, and fails fast without a POST. Keep the "zero further POSTs to /oauth/token" assertion, and adjust only the data-request count.
- **A test asserting that a rejected refresh token makes a still-valid access token unusable:** invert it. That was the parked defect.

List every test you changed, and why, in the report.

- [ ] **Step 6: Check and commit**

```bash
pnpm check
git add -A
git commit -m "fix(api): retry transient BCP token-endpoint failures and keep a valid fallback token usable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: In-memory Postgres option (`pglite://memory`)

**Files:**

- Modify: `apps/api/src/db/client.ts`, `apps/api/src/db/test-db.ts`, `apps/api/package.json` (move `@electric-sql/pglite` to `dependencies`), `.env.example`
- Test: `apps/api/src/db/client.test.ts`

**Interfaces:**

- Produces:
  - `PGLITE_MEMORY_URL = 'pglite://memory'`
  - `interface Database { db: Db; migrate(): Promise<void>; close(): Promise<void> }`
  - `createDb(url): Database`, which now accepts `pglite://memory`
  - `createTestDb()`, which is unchanged for callers

- [ ] **Step 1: Write the failing test**

`apps/api/src/db/client.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDb, PGLITE_MEMORY_URL } from './client';
import { events } from './schema';

describe('createDb', () => {
  it('runs an in-memory Postgres for pglite://memory', async () => {
    const database = createDb(PGLITE_MEMORY_URL);
    await database.migrate();
    await database.db.insert(events).values({
      id: 'E1',
      name: 'In memory',
      startDate: new Date('2026-01-01T00:00:00Z'),
      playerCount: 1,
      isTeamEvent: false,
      isOnline: false,
      roundCount: 1,
      ended: true,
      hideLists: false,
    });
    expect(await database.db.$count(events)).toBe(1);
    await database.close();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --project api src/db/client.test.ts`
Expected: FAIL, because `PGLITE_MEMORY_URL` is not exported.

- [ ] **Step 3: Implement**

```bash
pnpm --filter @bcp/api remove @electric-sql/pglite && pnpm --filter @bcp/api add @electric-sql/pglite
```

Replace `apps/api/src/db/client.ts` with:

```ts
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

/** Driver-agnostic database handle: node-postgres in production, PGlite in tests and e2e. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** An in-process, in-memory Postgres: end-to-end tests and zero-setup demos. Data is lost on exit. */
export const PGLITE_MEMORY_URL = 'pglite://memory';

export interface Database {
  db: Db;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export function createDb(url: string): Database {
  if (url === PGLITE_MEMORY_URL) {
    const client = new PGlite();
    const db = drizzlePglite({ client, schema });
    return {
      db,
      migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS_DIR }),
      close: () => client.close(),
    };
  }
  const db = drizzle({ connection: url, schema });
  return {
    db: db as Db,
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
    close: () => db.$client.end(),
  };
}
```

(If ESLint flags the `as Db` or the missing cast on the PGlite branch, as it did in plan 1, keep whichever form passes `--max-warnings=0`.)

Replace `createTestDb` in `apps/api/src/db/test-db.ts`, keeping `resetDb` as it is:

```ts
/** An in-process Postgres with all migrations applied. Create one per test file. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const database = createDb(PGLITE_MEMORY_URL);
  await database.migrate();
  return { db: database.db, close: database.close };
}
```

Fix the imports: `import { createDb, PGLITE_MEMORY_URL, type Db } from './client';`. Remove the imports of PGlite, drizzle-pglite, migrate and schema if they're now unused.

In `.env.example`, under `DATABASE_URL`, add the comment line `# pglite://memory runs an in-memory Postgres (no Docker; data is lost on restart).`

- [ ] **Step 4: Run all API tests**

Run: `pnpm vitest run --project api`
Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): support an in-memory Postgres via DATABASE_URL=pglite://memory

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Shared API schemas for the finder and event page

**Files:**

- Modify: `packages/shared/src/sync.ts`, `packages/shared/src/api.ts`, `apps/api/src/repo/sync-runs.ts` (`toSyncRun` fills `range`)
- Test: `packages/shared/src/schemas.test.ts`, `apps/api/src/repo/sync-runs.test.ts`

**Interfaces:**

- Produces (`@bcp/shared`):
  - `SyncRun.range: { from: string; to: string } | null`, set only for catalogue runs
  - `DateRangeSchema`/`DateRange`, `CoveredRangeSchema`/`CoveredRange`
  - `CatalogCoverageSchema`/`CatalogCoverage` `{ ranges, lastSyncedAt, activeRun }`
  - `LatestRefreshSchema`/`LatestRefresh` `{ window, run }`
  - `EventCountsSchema`/`EventCounts` `{ players, teams, listsAvailable, listsFetched }`
  - `EventSyncsSchema`/`EventSyncs` `{ event, pairings, lists }`
  - `EventDetailSchema`/`EventDetail`, which is `EventListItem` plus `{ stale, counts, syncs }`
  - `ListStatusSchema`/`ListStatus` (`'none' | 'available' | 'fetched'`)
  - `EventPlayerSchema`/`EventPlayer`, `EventPlayersResponseSchema`/`EventPlayersResponse`
  - `PlayerListSchema`/`PlayerList`
  - `ListExportFormatSchema`/`ListExportFormat` (`'txt' | 'json'`)

- [ ] **Step 1: Write the failing tests** (append to `packages/shared/src/schemas.test.ts`, and extend its import from `./index` with `EventDetailSchema, SyncRunSchema`)

```ts
const aRun = {
  id: 1,
  kind: 'catalog',
  eventId: null,
  status: 'succeeded',
  total: null,
  done: 3,
  failed: 0,
  error: null,
  startedAt: '2026-09-23T10:00:00.000Z',
  finishedAt: '2026-09-23T10:01:00.000Z',
  range: { from: '2026-08-24', to: '2026-09-30' },
};

describe('SyncRunSchema', () => {
  it('carries the date range of catalogue runs', () => {
    expect(SyncRunSchema.parse(aRun).range).toEqual({ from: '2026-08-24', to: '2026-09-30' });
    expect(SyncRunSchema.safeParse({ ...aRun, range: undefined }).success).toBe(false);
  });
});

describe('EventDetailSchema', () => {
  it('parses detail with counts, freshness and the latest run per kind', () => {
    const detail = {
      bcpId: 'E1',
      name: 'Open',
      startDate: '2026-03-28T09:00:00.000Z',
      endDate: null,
      country: null,
      city: null,
      playerCount: 8,
      teamCount: 4,
      isTeamEvent: true,
      isOnline: false,
      roundCount: 2,
      ended: true,
      hideLists: false,
      lastSyncedAt: null,
      stale: true,
      counts: { players: 0, teams: 0, listsAvailable: 0, listsFetched: 0 },
      syncs: {
        event: { ...aRun, kind: 'event', eventId: 'E1', range: null },
        pairings: null,
        lists: null,
      },
    };
    expect(EventDetailSchema.parse(detail).syncs.event?.kind).toBe('event');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run --project shared`
Expected: FAIL, because `EventDetailSchema` is not exported and `range` is unknown.

- [ ] **Step 3: Implement the schemas**

In `packages/shared/src/sync.ts`, add to `SyncRunSchema` (after `finishedAt`):

```ts
  /** The requested date range of a catalogue run; null for event-scoped runs. */
  range: z.object({ from: z.iso.date(), to: z.iso.date() }).nullable(),
```

Append to `packages/shared/src/api.ts` (and add `import { SyncRunSchema } from './sync';` at the top):

```ts
/** Inclusive range of calendar days, `YYYY-MM-DD`. */
export const DateRangeSchema = z.object({ from: z.iso.date(), to: z.iso.date() });
export type DateRange = z.infer<typeof DateRangeSchema>;

/** A date range already fetched from BCP, and when (the oldest sync, if merged). */
export const CoveredRangeSchema = DateRangeSchema.extend({ syncedAt: z.iso.datetime() });
export type CoveredRange = z.infer<typeof CoveredRangeSchema>;

export const CatalogCoverageSchema = z.object({
  ranges: z.array(CoveredRangeSchema),
  lastSyncedAt: z.iso.datetime().nullable(),
  /** Only one catalogue run can be active at a time, whatever its range. */
  activeRun: SyncRunSchema.nullable(),
});
export type CatalogCoverage = z.infer<typeof CatalogCoverageSchema>;

/** POST /api/catalog/latest: `run` is null when the latest window is still fresh. */
export const LatestRefreshSchema = z.object({
  window: DateRangeSchema,
  run: SyncRunSchema.nullable(),
});
export type LatestRefresh = z.infer<typeof LatestRefreshSchema>;

export const EventCountsSchema = z.object({
  players: z.number().int().nonnegative(),
  teams: z.number().int().nonnegative(),
  /** Players with a list on BCP. */
  listsAvailable: z.number().int().nonnegative(),
  /** Lists stored locally. */
  listsFetched: z.number().int().nonnegative(),
});
export type EventCounts = z.infer<typeof EventCountsSchema>;

/** The most recent run of each event-scoped kind, whatever its status. */
export const EventSyncsSchema = z.object({
  event: SyncRunSchema.nullable(),
  pairings: SyncRunSchema.nullable(),
  lists: SyncRunSchema.nullable(),
});
export type EventSyncs = z.infer<typeof EventSyncsSchema>;

export const EventDetailSchema = EventListItemSchema.extend({
  /** True when the page should (re)load the event from BCP: never synced, or running and > 10 min old. */
  stale: z.boolean(),
  counts: EventCountsSchema,
  syncs: EventSyncsSchema,
});
export type EventDetail = z.infer<typeof EventDetailSchema>;

export const ListStatusSchema = z.enum(['none', 'available', 'fetched']);
export type ListStatus = z.infer<typeof ListStatusSchema>;

export const EventPlayerSchema = z.object({
  bcpId: z.string().min(1),
  name: z.string(),
  teamName: z.string().nullable(),
  faction: z.string().nullable(),
  parentFaction: z.string().nullable(),
  placing: z.number().int().nullable(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  dropped: z.boolean(),
  listStatus: ListStatusSchema,
});
export type EventPlayer = z.infer<typeof EventPlayerSchema>;

export const EventPlayersResponseSchema = z.object({ items: z.array(EventPlayerSchema) });
export type EventPlayersResponse = z.infer<typeof EventPlayersResponseSchema>;

export const PlayerListSchema = z.object({
  playerId: z.string().min(1),
  playerName: z.string(),
  teamName: z.string().nullable(),
  faction: z.string().nullable(),
  listId: z.string().min(1),
  text: z.string().nullable(),
  fetchedAt: z.iso.datetime(),
});
export type PlayerList = z.infer<typeof PlayerListSchema>;

export const ListExportFormatSchema = z.enum(['txt', 'json']);
export type ListExportFormat = z.infer<typeof ListExportFormatSchema>;
```

- [ ] **Step 4: Fill `range` in the API**

In `apps/api/src/repo/sync-runs.ts`, add `import { z } from 'zod';` and:

```ts
const CatalogParamsSchema = z.object({ from: z.iso.date(), to: z.iso.date() });

/** A catalogue run's requested range, read back from its stored params. */
function rangeOf(row: SyncRunRow): { from: string; to: string } | null {
  if (row.kind !== 'catalog') return null;
  const parsed = CatalogParamsSchema.safeParse(row.params);
  return parsed.success ? parsed.data : null;
}
```

In `toSyncRun`, add `range: rangeOf(row),` after `finishedAt`.

Add a test to `apps/api/src/repo/sync-runs.test.ts`:

```ts
it('exposes the date range of catalogue runs only', async () => {
  const catalog = await createSyncRun(db, {
    kind: 'catalog',
    from: '2026-01-01',
    to: '2026-01-31',
  });
  const event = await createSyncRun(db, { kind: 'event', eventId: 'E1' });
  expect(catalog?.range).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  expect(event?.range).toBeNull();
});
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS. If any API test compares a whole `SyncRun` with `toEqual` against a literal, add `range` to that literal.

- [ ] **Step 6: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(shared): add finder and event-page API schemas and catalogue run ranges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Catalogue coverage and the automatic "latest" refresh

**Files:**

- Create: `packages/shared/src/catalog.ts`, `apps/api/src/freshness.ts`, `apps/api/src/catalog.ts`, `apps/api/src/routes/require-json.ts`, `apps/api/src/routes/catalog.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/src/repo/sync-runs.ts`, `apps/api/src/routes/sync.ts` (use `requireJson`), `apps/api/src/app.ts` (optional `now`, mount the catalogue routes)
- Test: `packages/shared/src/catalog.test.ts`, `apps/api/src/freshness.test.ts`, `apps/api/src/routes/catalog.test.ts`

**Interfaces:**

- Consumes: `DateRange`, `CoveredRange`, `CatalogCoverage`, `LatestRefresh` (Task 3); `SyncRunner.start`; `findActiveSyncRun`.
- Produces:
  - In `@bcp/shared`: `toIsoDate(date: Date): string`, `addDays(day: string, days: number): string`, `LATEST_DAYS_BACK = 30`, `LATEST_DAYS_AHEAD = 7`, `latestWindow(now: Date): DateRange`, `mergeRanges(ranges: CoveredRange[]): CoveredRange[]`, `findGaps(window: DateRange, covered: DateRange[]): DateRange[]`, `daysIn(range: DateRange): number`, `estimateCatalogRequests(range: DateRange): number`
  - In the API: `isLatestFresh(window, runs, now): boolean`, `isEventStale(event, now): boolean`, `CATALOG_MAX_AGE_MS`, `RUNNING_EVENT_MAX_AGE_MS`, `listSucceededCatalogRuns(db): Promise<CatalogRunRange[]>`, `getCoverage(db): Promise<CatalogCoverage>`, `refreshLatest({ db, runner }, now): Promise<LatestRefresh>`, `requireJson` middleware, and `AppDeps.now?: () => Date`
  - Routes: `GET /api/catalog/coverage` and `POST /api/catalog/latest` (the latter needs a JSON content type; its body is ignored)

- [ ] **Step 1: Write the failing shared tests**

`packages/shared/src/catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysIn,
  estimateCatalogRequests,
  findGaps,
  latestWindow,
  mergeRanges,
  toIsoDate,
} from './catalog';

describe('dates', () => {
  it('formats and shifts calendar days in UTC, across month ends', () => {
    expect(toIsoDate(new Date('2026-09-23T23:30:00Z'))).toBe('2026-09-23');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysIn({ from: '2026-09-01', to: '2026-09-01' })).toBe(1);
    expect(daysIn({ from: '2026-09-01', to: '2026-09-30' })).toBe(30);
  });

  it('builds the latest window: 30 days back, 7 ahead', () => {
    expect(latestWindow(new Date('2026-09-23T12:00:00Z'))).toEqual({
      from: '2026-08-24',
      to: '2026-09-30',
    });
  });
});

describe('mergeRanges', () => {
  it('merges overlapping and touching ranges, keeping the oldest sync time', () => {
    expect(
      mergeRanges([
        { from: '2026-09-10', to: '2026-09-20', syncedAt: '2026-09-22T10:00:00.000Z' },
        { from: '2026-09-01', to: '2026-09-09', syncedAt: '2026-09-23T10:00:00.000Z' },
        { from: '2026-09-15', to: '2026-09-25', syncedAt: '2026-09-21T10:00:00.000Z' },
        { from: '2026-10-05', to: '2026-10-06', syncedAt: '2026-09-23T10:00:00.000Z' },
      ]),
    ).toEqual([
      { from: '2026-09-01', to: '2026-09-25', syncedAt: '2026-09-21T10:00:00.000Z' },
      { from: '2026-10-05', to: '2026-10-06', syncedAt: '2026-09-23T10:00:00.000Z' },
    ]);
  });

  it('returns nothing for nothing', () => {
    expect(mergeRanges([])).toEqual([]);
  });
});

describe('findGaps', () => {
  const window = { from: '2026-01-01', to: '2026-12-31' };

  it('is the whole window when nothing is covered', () => {
    expect(findGaps(window, [])).toEqual([window]);
  });

  it('returns only the uncovered parts of a partly fetched range', () => {
    expect(
      findGaps(window, [
        { from: '2025-12-01', to: '2026-01-31' },
        { from: '2026-03-01', to: '2026-03-31' },
        { from: '2026-12-01', to: '2027-01-31' },
      ]),
    ).toEqual([
      { from: '2026-02-01', to: '2026-02-28' },
      { from: '2026-04-01', to: '2026-11-30' },
    ]);
  });

  it('is empty when the window is fully covered', () => {
    expect(
      findGaps({ from: '2026-09-05', to: '2026-09-06' }, [
        { from: '2026-09-01', to: '2026-09-30' },
      ]),
    ).toEqual([]);
  });
});

describe('estimateCatalogRequests', () => {
  it('estimates about one request per two days, at least one', () => {
    expect(estimateCatalogRequests({ from: '2026-09-01', to: '2026-09-01' })).toBe(1);
    expect(estimateCatalogRequests({ from: '2026-01-01', to: '2026-12-31' })).toBe(183);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run --project shared`
Expected: FAIL, because `./catalog` does not exist.

- [ ] **Step 3: Implement the shared date-range logic**

`packages/shared/src/catalog.ts`:

```ts
import type { CoveredRange, DateRange } from './api';

const DAY_MS = 86_400_000;

/** The finder's default window, and what the automatic refresh keeps current. */
export const LATEST_DAYS_BACK = 30;
export const LATEST_DAYS_AHEAD = 7;

/** Observed on BCP in 2026-09: roughly 50 new 40k events a day, 100 per search page. */
const EVENTS_PER_DAY_ESTIMATE = 50;
const EVENTS_PER_PAGE = 100;

/** `YYYY-MM-DD` of a moment, in UTC. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Shifts a `YYYY-MM-DD` calendar day by whole days. */
export function addDays(day: string, days: number): string {
  return toIsoDate(new Date(dayStart(day) + days * DAY_MS));
}

/** Number of calendar days in an inclusive range. */
export function daysIn(range: DateRange): number {
  return Math.round((dayStart(range.to) - dayStart(range.from)) / DAY_MS) + 1;
}

export function latestWindow(now: Date): DateRange {
  const today = toIsoDate(now);
  return { from: addDays(today, -LATEST_DAYS_BACK), to: addDays(today, LATEST_DAYS_AHEAD) };
}

/**
 * Merges overlapping or touching (next-day) ranges. A merged range keeps the OLDEST `syncedAt`,
 * so "synced at" never overstates how fresh the data is.
 */
export function mergeRanges(ranges: CoveredRange[]): CoveredRange[] {
  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
  const merged: CoveredRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.from <= addDays(last.to, 1)) {
      if (range.to > last.to) last.to = range.to;
      if (range.syncedAt < last.syncedAt) last.syncedAt = range.syncedAt;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** The parts of `window` that none of `covered` includes, in date order. */
export function findGaps(window: DateRange, covered: DateRange[]): DateRange[] {
  const gaps: DateRange[] = [];
  let cursor = window.from;
  for (const range of [...covered].sort((a, b) => a.from.localeCompare(b.from))) {
    if (range.to < cursor) continue;
    if (range.from > window.to) break;
    if (range.from > cursor) gaps.push({ from: cursor, to: addDays(range.from, -1) });
    const next = addDays(range.to, 1);
    if (next > cursor) cursor = next;
    if (cursor > window.to) return gaps;
  }
  if (cursor <= window.to) gaps.push({ from: cursor, to: window.to });
  return gaps;
}

/** Rough number of BCP search requests a catalogue sync of `range` costs. */
export function estimateCatalogRequests(range: DateRange): number {
  return Math.max(1, Math.ceil((daysIn(range) * EVENTS_PER_DAY_ESTIMATE) / EVENTS_PER_PAGE));
}
```

Add `export * from './catalog';` to `packages/shared/src/index.ts`.

Run: `pnpm vitest run --project shared`. Expected: PASS.

- [ ] **Step 4: Write the failing freshness tests**

`apps/api/src/freshness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isEventStale, isLatestFresh } from './freshness';

const now = new Date('2026-09-23T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const window = { from: '2026-08-24', to: '2026-09-30' };

describe('isLatestFresh', () => {
  it('is fresh when one run covering the whole window finished under 6 hours ago', () => {
    expect(isLatestFresh(window, [{ ...window, finishedAt: hoursAgo(5) }], now)).toBe(true);
  });

  it('is stale when the covering run is 6+ hours old or does not cover the whole window', () => {
    expect(isLatestFresh(window, [{ ...window, finishedAt: hoursAgo(6) }], now)).toBe(false);
    expect(
      isLatestFresh(
        window,
        [{ from: '2026-08-25', to: '2026-09-30', finishedAt: hoursAgo(1) }],
        now,
      ),
    ).toBe(false);
    expect(isLatestFresh(window, [], now)).toBe(false);
  });
});

describe('isEventStale', () => {
  it('is stale when never synced', () => {
    expect(isEventStale({ ended: true, lastSyncedAt: null }, now)).toBe(true);
    expect(isEventStale({ ended: false, lastSyncedAt: null }, now)).toBe(true);
  });

  it('never goes stale once an ended event is synced (only an explicit Refresh reloads it)', () => {
    expect(isEventStale({ ended: true, lastSyncedAt: hoursAgo(24 * 30) }, now)).toBe(false);
  });

  it('goes stale 10 minutes after a running event was synced', () => {
    expect(
      isEventStale({ ended: false, lastSyncedAt: new Date(now.getTime() - 9 * 60_000) }, now),
    ).toBe(false);
    expect(
      isEventStale({ ended: false, lastSyncedAt: new Date(now.getTime() - 10 * 60_000) }, now),
    ).toBe(true);
  });
});
```

- [ ] **Step 5: Implement freshness**

`apps/api/src/freshness.ts`:

```ts
import type { DateRange } from '@bcp/shared';

/** The latest window counts as fresh this long after a covering catalogue sync (spec §7). */
export const CATALOG_MAX_AGE_MS = 6 * 3_600_000;
/** A running event's data counts as fresh this long after its last sync (spec §7). */
export const RUNNING_EVENT_MAX_AGE_MS = 10 * 60_000;

export interface FinishedRange extends DateRange {
  finishedAt: Date;
}

/** True when one succeeded catalogue run covers the whole window and finished under 6 hours ago. */
export function isLatestFresh(window: DateRange, runs: FinishedRange[], now: Date): boolean {
  return runs.some(
    (run) =>
      run.from <= window.from &&
      run.to >= window.to &&
      now.getTime() - run.finishedAt.getTime() < CATALOG_MAX_AGE_MS,
  );
}

/**
 * Whether the event page should (re)load the event from BCP: never synced, or still running and
 * synced 10+ minutes ago. Ended events stay cached until the user presses Refresh.
 */
export function isEventStale(
  event: { ended: boolean; lastSyncedAt: Date | null },
  now: Date,
): boolean {
  if (event.lastSyncedAt === null) return true;
  if (event.ended) return false;
  return now.getTime() - event.lastSyncedAt.getTime() >= RUNNING_EVENT_MAX_AGE_MS;
}
```

Run: `pnpm vitest run --project api src/freshness.test.ts`. Expected: PASS.

- [ ] **Step 6: Write the failing route tests**

`apps/api/src/routes/catalog.test.ts`:

```ts
import {
  latestWindow,
  type BcpStatus,
  type CatalogCoverage,
  type LatestRefresh,
} from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { SyncRunner } from '../sync/runner';
import { sampleSource, silentLogger } from '../test/helpers';

const status: BcpStatus = {
  source: 'fixtures',
  state: 'fixtures',
  accessTokenExpiresAt: null,
  lastRefreshAt: null,
};

let db: Db;
let close: () => Promise<void>;
let runner: SyncRunner;
let app: ReturnType<typeof createApp>;
// Real time: finishedAt timestamps are written with the real clock.
let now = new Date();

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
  app = createApp({
    db,
    runner,
    bcpStatus: () => Promise.resolve(status),
    logger: silentLogger,
    now: () => now,
  });
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  now = new Date();
});

const postLatest = async () =>
  (await (
    await app.request('/api/catalog/latest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
  ).json()) as LatestRefresh;

const coverage = async () =>
  (await (await app.request('/api/catalog/coverage')).json()) as CatalogCoverage;

describe('catalogue routes', () => {
  it('reports an empty catalogue', async () => {
    expect(await coverage()).toEqual({ ranges: [], lastSyncedAt: null, activeRun: null });
  });

  it('refreshes the latest window once, then skips it while fresh', async () => {
    const window = latestWindow(now);
    const first = await postLatest();
    expect(first.window).toEqual(window);
    expect(first.run).toMatchObject({ kind: 'catalog', range: window });
    await runner.idle();

    expect(await coverage()).toMatchObject({
      ranges: [{ from: window.from, to: window.to }],
      lastSyncedAt: expect.any(String),
      activeRun: null,
    });
    expect((await postLatest()).run).toBeNull();

    now = new Date(now.getTime() + 7 * 3_600_000);
    expect((await postLatest()).run).not.toBeNull();
    await runner.idle();
  });

  it('merges catalogue runs into coverage ranges', async () => {
    for (const range of [
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2026-02-01', to: '2026-02-10' },
    ]) {
      await app.request('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'catalog', ...range }),
      });
      await runner.idle();
    }
    expect((await coverage()).ranges).toMatchObject([{ from: '2026-01-01', to: '2026-02-10' }]);
  });

  it('requires a JSON content type (any casing) for the refresh', async () => {
    expect((await app.request('/api/catalog/latest', { method: 'POST' })).status).toBe(400);
    const upper = await app.request('/api/catalog/latest', {
      method: 'POST',
      headers: { 'content-type': 'Application/JSON' },
      body: '{}',
    });
    expect(upper.status).toBe(200);
    await runner.idle();
  });
});
```

Run: `pnpm vitest run --project api src/routes/catalog.test.ts`
Expected: FAIL. `now` isn't an `AppDeps` field and the routes don't exist yet.

- [ ] **Step 7: Implement the repository function, service, middleware and routes**

Append to `apps/api/src/repo/sync-runs.ts`:

```ts
export interface CatalogRunRange {
  from: string;
  to: string;
  finishedAt: Date;
}

/** Date ranges of every catalogue run that succeeded, with when each finished. */
export async function listSucceededCatalogRuns(db: Db): Promise<CatalogRunRange[]> {
  const rows = await db
    .select()
    .from(syncRuns)
    .where(and(eq(syncRuns.kind, 'catalog'), eq(syncRuns.status, 'succeeded')));
  return rows.flatMap((row) => {
    const range = rangeOf(row);
    return range && row.finishedAt ? [{ ...range, finishedAt: row.finishedAt }] : [];
  });
}
```

`apps/api/src/catalog.ts`:

```ts
import { latestWindow, mergeRanges, type CatalogCoverage, type LatestRefresh } from '@bcp/shared';
import type { Db } from './db/client';
import { isLatestFresh } from './freshness';
import { findActiveSyncRun, listSucceededCatalogRuns } from './repo/sync-runs';
import type { SyncRunner } from './sync/runner';

/** Which date ranges have been fetched from BCP, when the catalogue last synced, and any active run. */
export async function getCoverage(db: Db): Promise<CatalogCoverage> {
  const runs = await listSucceededCatalogRuns(db);
  const ranges = mergeRanges(
    runs.map((run) => ({ from: run.from, to: run.to, syncedAt: run.finishedAt.toISOString() })),
  );
  const lastSyncedAt = runs.reduce<Date | null>(
    (latest, run) => (latest && latest > run.finishedAt ? latest : run.finishedAt),
    null,
  );
  return {
    ranges,
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
    activeRun: await findActiveSyncRun(db, 'catalog', null),
  };
}

/**
 * Keeps the finder's default view current: syncs the latest window unless a covering sync
 * finished under 6 hours ago. If another catalogue run is active, that run is returned instead.
 */
export async function refreshLatest(
  deps: { db: Db; runner: SyncRunner },
  now: Date,
): Promise<LatestRefresh> {
  const window = latestWindow(now);
  if (isLatestFresh(window, await listSucceededCatalogRuns(deps.db), now)) {
    return { window, run: null };
  }
  return { window, run: await deps.runner.start({ kind: 'catalog', ...window }) };
}
```

`apps/api/src/routes/require-json.ts`:

```ts
import { createMiddleware } from 'hono/factory';
import { ValidationError } from '../errors';

const MESSAGE = 'Content-Type must be application/json';

/**
 * State-changing routes only accept JSON. A web page the user visits can't send that
 * cross-origin without a preflight, so this blocks drive-by POSTs to the local API.
 */
export const requireJson = createMiddleware(async (c, next) => {
  const contentType = c.req.header('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) {
    throw new ValidationError([{ path: 'content-type', message: MESSAGE }], MESSAGE);
  }
  await next();
});
```

In `apps/api/src/routes/sync.ts`, replace the inline content-type check with the middleware: `.post('/sync', requireJson, async (c) => { … })`, and remove the now-unused `ValidationError` import if nothing else uses it.

`apps/api/src/routes/catalog.ts`:

```ts
import { Hono } from 'hono';
import { getCoverage, refreshLatest } from '../catalog';
import type { Db } from '../db/client';
import type { SyncRunner } from '../sync/runner';
import { requireJson } from './require-json';

export function catalogRoutes(deps: { db: Db; runner: SyncRunner; now: () => Date }) {
  return new Hono()
    .get('/catalog/coverage', async (c) => c.json(await getCoverage(deps.db)))
    .post('/catalog/latest', requireJson, async (c) =>
      c.json(await refreshLatest(deps, deps.now())),
    );
}
```

In `apps/api/src/app.ts`:

- Add `/** Injectable clock for freshness rules; defaults to the real time. */ now?: () => Date;` to `AppDeps`.
- At the top of `createApp`, add `const now = deps.now ?? (() => new Date());`.
- Mount the routes: `app.route('/api', catalogRoutes({ ...deps, now }));`.

- [ ] **Step 8: Run the tests**

Run: `pnpm vitest run --project api`
Expected: PASS, including the existing sync route test for the text/plain 400.

- [ ] **Step 9: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat: catalogue coverage and automatic refresh of the latest window

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Event detail, players, single list and list export (API)

**Files:**

- Create: `apps/api/src/event-detail.ts`, `apps/api/src/lists-export.ts`
- Modify: `apps/api/src/repo/sync-runs.ts`, `apps/api/src/repo/participants.ts`, `apps/api/src/repo/lists.ts`, `apps/api/src/routes/events.ts`, `apps/api/src/app.ts` (pass `now` to the event routes)
- Test: `apps/api/src/lists-export.test.ts`, `apps/api/src/routes/event-routes.test.ts`

**Interfaces:**

- Consumes: `EventDetail`, `EventCounts`, `EventSyncs`, `EventPlayer`, `ListStatus`, `PlayerList`, `ListExportFormatSchema` (Task 3); `isEventStale` (Task 4); `findEvent`, `toEventListItem`.
- Produces:
  - `latestEventSyncRuns(db, eventId): Promise<EventSyncs>`
  - `listEventPlayers(db, eventId): Promise<EventPlayer[]>`, `countEventParticipants(db, eventId): Promise<EventCounts>`
  - `interface ExportedList { placing: number | null; player: string; team: string | null; faction: string | null; listId: string; text: string | null }`
  - `findPlayerList(db, playerId): Promise<PlayerList | null>`, `listEventArmyLists(db, eventId): Promise<ExportedList[]>`
  - `getEventDetail(db, eventId, now): Promise<EventDetail | null>`
  - `listsToText(eventName, lists): string`, `exportFileName(eventName, format): string`
  - Routes:
    - `GET /api/events/:id` → `EventDetail`, or 404
    - `GET /api/events/:id/players` → `EventPlayersResponse`, or 404 if the event is unknown
    - `GET /api/players/:id/list` → `PlayerList`, or 404 if no list is stored
    - `GET /api/events/:id/lists/export?format=txt|json` → an attachment

- [ ] **Step 1: Write the failing export tests** (Review Focus 4)

`apps/api/src/lists-export.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { exportFileName, listsToText } from './lists-export';

describe('exportFileName', () => {
  it('slugs the event name into a safe download name', () => {
    expect(exportFileName('Sample Team Open', 'txt')).toBe('sample-team-open-lists.txt');
    expect(exportFileName(`Tournoi d'Été "Quoted" / 2026`, 'json')).toBe(
      'tournoi-d-ete-quoted-2026-lists.json',
    );
    expect(exportFileName('!!!', 'txt')).toBe('event-lists.txt');
  });
});

describe('listsToText', () => {
  it('writes a header and one titled block per list, in the given order', () => {
    const text = listsToText('Sample Team Open', [
      {
        placing: 1,
        player: 'Finn Ford',
        team: 'Charlie Wing',
        faction: 'Orks',
        listId: 'L1',
        text: 'Warboss',
      },
      { placing: null, player: 'Hal Hayes', team: null, faction: null, listId: 'L2', text: null },
    ]);
    expect(text).toContain('Sample Team Open\n2 army lists');
    expect(text).toContain('#1 · Finn Ford · Charlie Wing · Orks\n');
    expect(text).toContain('Warboss');
    expect(text).toContain('Hal Hayes\n');
    expect(text).toContain('(empty list)');
    expect(text.indexOf('Finn Ford')).toBeLessThan(text.indexOf('Hal Hayes'));
  });
});
```

- [ ] **Step 2: Implement the export helpers and the `ExportedList` type**

Append to `apps/api/src/repo/lists.ts` (and extend the imports: `sql` from drizzle-orm; `teams` from the schema; `type PlayerList` from `@bcp/shared`):

```ts
/** One stored army list with the context an export needs. */
export interface ExportedList {
  placing: number | null;
  player: string;
  team: string | null;
  faction: string | null;
  listId: string;
  text: string | null;
}

/** Every stored list of an event, best placing first (unplaced players last, by name). */
export async function listEventArmyLists(db: Db, eventId: string): Promise<ExportedList[]> {
  return db
    .select({
      placing: players.placing,
      player: players.name,
      team: teams.name,
      faction: players.faction,
      listId: armyLists.listId,
      text: armyLists.text,
    })
    .from(armyLists)
    .innerJoin(players, eq(players.id, armyLists.playerId))
    .leftJoin(teams, eq(teams.id, players.teamId))
    .where(eq(players.eventId, eventId))
    .orderBy(sql`${players.placing} asc nulls last`, players.name);
}

export async function findPlayerList(db: Db, playerId: string): Promise<PlayerList | null> {
  const [row] = await db
    .select({
      playerId: players.id,
      playerName: players.name,
      teamName: teams.name,
      faction: players.faction,
      listId: armyLists.listId,
      text: armyLists.text,
      fetchedAt: armyLists.fetchedAt,
    })
    .from(armyLists)
    .innerJoin(players, eq(players.id, armyLists.playerId))
    .leftJoin(teams, eq(teams.id, players.teamId))
    .where(eq(armyLists.playerId, playerId));
  return row ? { ...row, fetchedAt: row.fetchedAt.toISOString() } : null;
}
```

`apps/api/src/lists-export.ts`:

```ts
import type { ListExportFormat } from '@bcp/shared';
import type { ExportedList } from './repo/lists';

const RULE = '='.repeat(72);

/** A plain-text file with every list, one titled block each, ready to paste or print. */
export function listsToText(eventName: string, lists: ExportedList[]): string {
  const header = `${eventName}\n${lists.length} army lists\n`;
  const blocks = lists.map((list) => {
    const title = [
      list.placing === null ? null : `#${list.placing}`,
      list.player,
      list.team,
      list.faction,
    ]
      .filter((part): part is string => part !== null)
      .join(' · ');
    return `${RULE}\n${title}\n${RULE}\n${list.text ?? '(empty list)'}\n`;
  });
  return [header, ...blocks].join('\n');
}

/** A download name made only of [a-z0-9-], so it's safe inside Content-Disposition. */
export function exportFileName(eventName: string, format: ListExportFormat): string {
  const slug = eventName
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug === '' ? 'event' : slug}-lists.${format}`;
}
```

Run: `pnpm vitest run --project api src/lists-export.test.ts`. Expected: PASS.

- [ ] **Step 3: Write the failing route tests** (Review Focus 1)

`apps/api/src/routes/event-routes.test.ts`:

```ts
import type { BcpStatus, EventDetail, EventPlayersResponse } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { SyncRunner } from '../sync/runner';
import { sampleSource, silentLogger } from '../test/helpers';

const status: BcpStatus = {
  source: 'fixtures',
  state: 'fixtures',
  accessTokenExpiresAt: null,
  lastRefreshAt: null,
};
const EVENT = 'EVTTEAM0001';

let db: Db;
let close: () => Promise<void>;
let runner: SyncRunner;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
  app = createApp({ db, runner, bcpStatus: () => Promise.resolve(status), logger: silentLogger });
});
afterAll(() => close());
beforeEach(() => resetDb(db));

async function sync(body: object) {
  await app.request('/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  await runner.idle();
}
const getJson = async <T>(path: string) => (await (await app.request(path)).json()) as T;

describe('event routes', () => {
  it('returns detail with counts, freshness and the latest run per kind', async () => {
    await sync({ kind: 'event', eventId: EVENT });
    await sync({ kind: 'lists', eventId: EVENT });
    expect(await getJson<EventDetail>(`/api/events/${EVENT}`)).toMatchObject({
      bcpId: EVENT,
      stale: false,
      counts: { players: 8, teams: 4, listsAvailable: 7, listsFetched: 7 },
      syncs: {
        event: { status: 'succeeded' },
        lists: { status: 'succeeded', done: 7 },
        pairings: null,
      },
    });
  });

  it('marks a catalogue-only event as stale with nothing loaded yet', async () => {
    await sync({ kind: 'catalog', from: '2026-01-01', to: '2026-12-31' });
    expect(await getJson<EventDetail>('/api/events/EVTSMALL001')).toMatchObject({
      lastSyncedAt: null,
      stale: true,
      counts: { players: 0, teams: 0, listsAvailable: 0, listsFetched: 0 },
      syncs: { event: null, pairings: null, lists: null },
    });
    expect((await app.request('/api/events/NOPE')).status).toBe(404);
  });

  it('lists players by placing with team names and list status', async () => {
    await sync({ kind: 'event', eventId: EVENT });
    let { items } = await getJson<EventPlayersResponse>(`/api/events/${EVENT}/players`);
    expect(items).toHaveLength(8);
    expect(items[0]).toMatchObject({
      bcpId: 'PL-FINN',
      placing: 1,
      teamName: 'Charlie Wing',
      faction: 'Orks',
      wins: 2,
      listStatus: 'available',
    });
    expect(items.find((p) => p.bcpId === 'PL-HAL')).toMatchObject({ listStatus: 'none' });

    await sync({ kind: 'lists', eventId: EVENT });
    ({ items } = await getJson<EventPlayersResponse>(`/api/events/${EVENT}/players`));
    expect(items.find((p) => p.bcpId === 'PL-ADA')).toMatchObject({ listStatus: 'fetched' });
    expect((await app.request('/api/events/NOPE/players')).status).toBe(404);
  });

  it('serves one stored list, and 404 when none is stored', async () => {
    await sync({ kind: 'lists', eventId: EVENT });
    expect(await getJson(`/api/players/PL-ADA/list`)).toMatchObject({
      playerName: 'Ada Archer',
      teamName: 'Alpha Squad',
      listId: 'LS-ADA',
      text: expect.stringContaining('Gladius'),
    });
    expect((await app.request('/api/players/PL-HAL/list')).status).toBe(404);
  });

  it('exports all fetched lists as text and JSON downloads', async () => {
    await sync({ kind: 'lists', eventId: EVENT });

    const txt = await app.request(`/api/events/${EVENT}/lists/export`);
    expect(txt.headers.get('content-type')).toContain('text/plain');
    expect(txt.headers.get('content-disposition')).toBe(
      'attachment; filename="sample-team-open-lists.txt"',
    );
    const text = await txt.text();
    expect(text).toContain('#1 · Finn Ford · Charlie Wing · Orks');
    expect(text).toContain('Gladius Task Force');

    const json = await app.request(`/api/events/${EVENT}/lists/export?format=json`);
    expect(json.headers.get('content-disposition')).toContain('sample-team-open-lists.json');
    expect(((await json.json()) as { lists: unknown[] }).lists).toHaveLength(7);

    expect((await app.request(`/api/events/${EVENT}/lists/export?format=pdf`)).status).toBe(400);
    expect((await app.request('/api/events/NOPE/lists/export')).status).toBe(404);
  });
});
```

Run: `pnpm vitest run --project api src/routes/event-routes.test.ts`
Expected: FAIL. The detail shape, the players, list and export routes are all missing.

- [ ] **Step 4: Implement the repository functions**

Append to `apps/api/src/repo/sync-runs.ts` (add `desc` to the drizzle import; add `type EventSyncs` to the shared import):

```ts
/** The most recent run of each event-scoped kind for one event. */
export async function latestEventSyncRuns(db: Db, eventId: string): Promise<EventSyncs> {
  const rows = await db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.eventId, eventId))
    .orderBy(desc(syncRuns.id));
  const latest = (kind: 'event' | 'pairings' | 'lists') => {
    const row = rows.find((candidate) => candidate.kind === kind);
    return row ? toSyncRun(row) : null;
  };
  return { event: latest('event'), pairings: latest('pairings'), lists: latest('lists') };
}
```

Append to `apps/api/src/repo/participants.ts` (merge the imports with what's already there: `and, count, eq, isNotNull, sql` from drizzle-orm; `armyLists, players, teams` from the schema; `type EventCounts, type EventPlayer, type ListStatus` from `@bcp/shared`):

```ts
function listStatusOf(bcpListId: string | null, storedListId: string | null): ListStatus {
  if (storedListId !== null) return 'fetched';
  return bcpListId === null ? 'none' : 'available';
}

/** An event's players, best placing first (unplaced last, by name), with team and list status. */
export async function listEventPlayers(db: Db, eventId: string): Promise<EventPlayer[]> {
  const rows = await db
    .select({ player: players, teamName: teams.name, storedListId: armyLists.listId })
    .from(players)
    .leftJoin(teams, eq(teams.id, players.teamId))
    .leftJoin(armyLists, eq(armyLists.playerId, players.id))
    .where(eq(players.eventId, eventId))
    .orderBy(sql`${players.placing} asc nulls last`, players.name);
  return rows.map(({ player, teamName, storedListId }) => ({
    bcpId: player.id,
    name: player.name,
    teamName,
    faction: player.faction,
    parentFaction: player.parentFaction,
    placing: player.placing,
    wins: player.wins,
    losses: player.losses,
    draws: player.draws,
    dropped: player.dropped,
    listStatus: listStatusOf(player.listId, storedListId),
  }));
}

export async function countEventParticipants(db: Db, eventId: string): Promise<EventCounts> {
  const ofEvent = eq(players.eventId, eventId);
  const [playerCount, teamCount, listsAvailable, fetched] = await Promise.all([
    db.$count(players, ofEvent),
    db.$count(teams, eq(teams.eventId, eventId)),
    db.$count(players, and(ofEvent, isNotNull(players.listId))),
    db
      .select({ n: count() })
      .from(armyLists)
      .innerJoin(players, eq(players.id, armyLists.playerId))
      .where(ofEvent),
  ]);
  return {
    players: playerCount,
    teams: teamCount,
    listsAvailable,
    listsFetched: fetched[0]?.n ?? 0,
  };
}
```

- [ ] **Step 5: Implement the detail service and the routes**

`apps/api/src/event-detail.ts`:

```ts
import type { EventDetail } from '@bcp/shared';
import type { Db } from './db/client';
import { isEventStale } from './freshness';
import { findEvent, toEventListItem } from './repo/events';
import { countEventParticipants } from './repo/participants';
import { latestEventSyncRuns } from './repo/sync-runs';

/** Everything the event page header needs, or null when the event isn't in the catalogue. */
export async function getEventDetail(
  db: Db,
  eventId: string,
  now: Date,
): Promise<EventDetail | null> {
  const row = await findEvent(db, eventId);
  if (!row) return null;
  const [counts, syncs] = await Promise.all([
    countEventParticipants(db, eventId),
    latestEventSyncRuns(db, eventId),
  ]);
  return { ...toEventListItem(row), stale: isEventStale(row, now), counts, syncs };
}
```

Replace `apps/api/src/routes/events.ts` with:

```ts
import { EventListQuerySchema, ListExportFormatSchema } from '@bcp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { getEventDetail } from '../event-detail';
import { exportFileName, listsToText } from '../lists-export';
import { findEvent, searchEvents } from '../repo/events';
import { findPlayerList, listEventArmyLists } from '../repo/lists';
import { listEventPlayers } from '../repo/participants';
import { parseInput } from '../validation';

const ExportQuerySchema = z.object({ format: ListExportFormatSchema.default('txt') });

export function eventRoutes(deps: { db: Db; now: () => Date }) {
  async function requireEvent(id: string) {
    const row = await findEvent(deps.db, id);
    if (!row) throw new NotFoundError(`Event ${id} is not in the local catalogue`);
    return row;
  }

  return new Hono()
    .get('/events', async (c) => {
      const query = parseInput(EventListQuerySchema, c.req.query());
      return c.json(await searchEvents(deps.db, query));
    })
    .get('/events/:id', async (c) => {
      const id = c.req.param('id');
      const detail = await getEventDetail(deps.db, id, deps.now());
      if (!detail) throw new NotFoundError(`Event ${id} is not in the local catalogue`);
      return c.json(detail);
    })
    .get('/events/:id/players', async (c) => {
      const id = c.req.param('id');
      await requireEvent(id);
      return c.json({ items: await listEventPlayers(deps.db, id) });
    })
    .get('/events/:id/lists/export', async (c) => {
      const id = c.req.param('id');
      const { format } = parseInput(ExportQuerySchema, c.req.query());
      const event = await requireEvent(id);
      const lists = await listEventArmyLists(deps.db, id);
      c.header(
        'Content-Disposition',
        `attachment; filename="${exportFileName(event.name, format)}"`,
      );
      if (format === 'json') return c.json({ event: { id, name: event.name }, lists });
      return c.text(listsToText(event.name, lists));
    })
    .get('/players/:id/list', async (c) => {
      const id = c.req.param('id');
      const list = await findPlayerList(deps.db, id);
      if (!list) throw new NotFoundError(`No army list stored for player ${id}`);
      return c.json(list);
    });
}
```

In `apps/api/src/app.ts`, mount the event routes with the clock: `app.route('/api', eventRoutes({ ...deps, now }));`.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run --project api`
Expected: PASS. The earlier `routes.test.ts` check on `/api/events/:id` (`city`, `lastSyncedAt`) still holds, because the detail extends the list item.

- [ ] **Step 7: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): event detail, players, single list and list export routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Web groundwork — dependencies, POST client, sync following, error states, formatting

**Files:**

- Create:
  - `apps/web/src/features/sync/follow-sync.ts`, `apps/web/src/features/sync/use-sync.ts`
  - `apps/web/src/components/ErrorState.tsx`, `apps/web/src/components/RouteError.tsx`, `apps/web/src/components/EventStatusBadges.tsx`
  - `apps/web/src/test/sample-data.ts`
- Modify:
  - `apps/web/package.json`, `apps/web/src/main.tsx`, `apps/web/src/router.ts`
  - `apps/web/src/api/client.ts`, `apps/web/src/lib/format.ts`, `apps/web/src/test/render.tsx`
  - `apps/web/src/features/settings/BcpStatusCard.tsx` (use `ErrorState`)
- Test: `apps/web/src/api/client.test.ts`, `apps/web/src/features/sync/follow-sync.test.ts`, `apps/web/src/lib/format.test.ts`

**Interfaces:**

- Consumes: `SyncRunSchema`, `SyncRequest`, `EventListItem` (Tasks 3–5).
- Produces:
  - `apiPost<S>(path, body, schema): Promise<z.output<S>>`. `apiGet` and `apiPost` both raise `ApiError('INTERNAL')` when a response breaks the schema.
  - `SYNC_POLL_MS`, `isActiveRun(run)`, `followRun(run, onProgress, pollMs?)`, `startAndFollow(request, onProgress, pollMs?)`
  - `useSync({ label, invalidate }): { start(request), run: SyncRun | null, isSyncing }`, `notifySyncFinished(label, run)`
  - `<ErrorState title? error onRetry? />`, `<RouteError />` (the router's default error component), `<EventStatusBadges event />`
  - `formatEventDates(startIso, endIso)`, `formatIsoDay(day)`, `formatEventSize({ playerCount, teamCount })`
  - Test helpers:
    - `renderWithProviders` now uses Mantine `env="test"`, which turns off transitions and portals.
    - `stubFetchRoutes(routes)`
    - `aSyncRun`, `anEvent`, `anEventDetail`, `aPlayer`

- [ ] **Step 1: Install the UI dependencies**

```bash
pnpm --filter @bcp/web add @mantine/dates@9.6.2 @mantine/notifications@9.6.2 mantine-datatable dayjs clsx
```

If `@mantine/core` has moved from 9.6.2, pin both packages to whatever `@mantine/core` version is installed.

- [ ] **Step 2: Wire the styles, notifications and default error component**

In `apps/web/src/main.tsx`, import the CSS in this order, after `@mantine/core/styles.css`:

```ts
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import 'mantine-datatable/styles.css';
```

Check the installed file name with `ls node_modules/mantine-datatable/dist/*.css` (run inside `apps/web`). If only `styles.layer.css` exists, import that instead.

Also render notifications as the first child of `MantineProvider`:

```tsx
import { Notifications } from '@mantine/notifications';
// …
    <MantineProvider theme={theme} forceColorScheme="dark">
      <Notifications position="bottom-right" />
```

`apps/web/src/components/ErrorState.tsx`:

```tsx
import { Alert, Button, Stack, Text } from '@mantine/core';

interface ErrorStateProps {
  title?: string;
  error: Error;
  onRetry?: () => void;
}

/** The standard error display: what went wrong, and a Retry when one can help. */
export function ErrorState({ title = 'Something went wrong', error, onRetry }: ErrorStateProps) {
  return (
    <Alert color="red" title={title}>
      <Stack gap="sm" align="flex-start">
        <Text size="sm">{error.message}</Text>
        {onRetry && (
          <Button size="xs" color="red" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
```

`apps/web/src/components/RouteError.tsx`:

```tsx
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { ErrorState } from './ErrorState';

/** Shown when a route throws while rendering; Retry resets failed queries and re-renders. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const { reset: resetQueries } = useQueryErrorResetBoundary();
  return (
    <ErrorState
      error={error}
      onRetry={() => {
        resetQueries();
        reset();
        void router.invalidate();
      }}
    />
  );
}
```

In `apps/web/src/router.ts`, add `defaultErrorComponent: RouteError,` to `createRouter({ … })`, with the import.

In `BcpStatusCard.tsx`, replace the inline error `Alert` block with:

```tsx
<ErrorState title="Status unavailable" error={error} onRetry={() => void refetch()} />
```

(Keep it wrapped in its `Panel`. Remove imports that become unused.)

`apps/web/src/components/EventStatusBadges.tsx`:

```tsx
import type { EventListItem } from '@bcp/shared';
import { Badge, Group } from '@mantine/core';

type BadgeFields = Pick<
  EventListItem,
  'isTeamEvent' | 'isOnline' | 'ended' | 'hideLists' | 'lastSyncedAt'
>;

/** Small state tags, shared by the finder table and the event header. */
export function EventStatusBadges({ event }: { event: BadgeFields }) {
  return (
    <Group gap={6} wrap="nowrap">
      {event.isTeamEvent && (
        <Badge size="xs" variant="outline">
          Teams
        </Badge>
      )}
      {event.isOnline && (
        <Badge size="xs" variant="outline" color="gray">
          Online
        </Badge>
      )}
      {!event.ended && (
        <Badge size="xs" variant="light">
          Running
        </Badge>
      )}
      {event.hideLists && (
        <Badge size="xs" variant="outline" color="yellow">
          Lists hidden
        </Badge>
      )}
      {event.lastSyncedAt !== null && (
        <Badge size="xs" variant="outline" color="gray">
          Synced
        </Badge>
      )}
    </Group>
  );
}
```

- [ ] **Step 3: Extend the test helpers and add sample data**

Replace `apps/web/src/test/render.tsx` with:

```tsx
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { theme } from '../theme';

export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    // env="test" turns off transitions and portals, so drawers and menus render synchronously.
    <MantineProvider theme={theme} forceColorScheme="dark" env="test">
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MantineProvider>,
  );
}

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** Makes fetch answer every request with the given JSON body and status. */
export function stubFetchJson(body: unknown, status = 200) {
  const fetchMock = vi.fn((..._args: FetchArgs) =>
    Promise.resolve(Response.json(body, { status })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * Answers fetch by "METHOD /path-prefix" keys, checked in insertion order (list the more specific
 * path first). A value is a JSON body, or a function returning a Response (for error statuses).
 * Unmatched requests reject, so a test fails loudly on an unexpected call.
 */
export function stubFetchRoutes(routes: Record<string, unknown>) {
  const fetchMock = vi.fn((...[input, init]: FetchArgs) => {
    const url = urlOf(input);
    const method = init?.method ?? 'GET';
    const match = Object.entries(routes).find(([key]) => {
      const [routeMethod, path] = key.split(' ');
      return routeMethod === method && path !== undefined && url.startsWith(path);
    });
    if (!match) return Promise.reject(new Error(`Unexpected ${method} ${url}`));
    const value = match[1];
    return Promise.resolve(
      typeof value === 'function' ? (value as () => Response)() : Response.json(value),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
```

`apps/web/src/test/sample-data.ts`:

```ts
import type { EventDetail, EventListItem, EventPlayer, SyncRun } from '@bcp/shared';

export function aSyncRun(overrides: Partial<SyncRun> = {}): SyncRun {
  return {
    id: 1,
    kind: 'lists',
    eventId: 'EVT1',
    status: 'succeeded',
    total: 7,
    done: 7,
    failed: 0,
    error: null,
    startedAt: '2026-09-23T10:00:00.000Z',
    finishedAt: '2026-09-23T10:01:00.000Z',
    range: null,
    ...overrides,
  };
}

export function anEvent(overrides: Partial<EventListItem> = {}): EventListItem {
  return {
    bcpId: 'EVT1',
    name: 'Sample Team Open',
    startDate: '2026-03-28T09:00:00.000Z',
    endDate: '2026-03-29T18:00:00.000Z',
    country: 'United States',
    city: 'Springfield',
    playerCount: 8,
    teamCount: 4,
    isTeamEvent: true,
    isOnline: false,
    roundCount: 2,
    ended: true,
    hideLists: false,
    lastSyncedAt: '2026-09-23T10:00:00.000Z',
    ...overrides,
  };
}

export function anEventDetail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    ...anEvent(),
    stale: false,
    counts: { players: 8, teams: 4, listsAvailable: 7, listsFetched: 0 },
    syncs: { event: aSyncRun({ kind: 'event', total: 1, done: 1 }), pairings: null, lists: null },
    ...overrides,
  };
}

export function aPlayer(overrides: Partial<EventPlayer> = {}): EventPlayer {
  return {
    bcpId: 'PL-ADA',
    name: 'Ada Archer',
    teamName: 'Alpha Squad',
    faction: 'Space Marines',
    parentFaction: 'Space Marines',
    placing: 2,
    wins: 2,
    losses: 0,
    draws: 0,
    dropped: false,
    listStatus: 'fetched',
    ...overrides,
  };
}
```

- [ ] **Step 4: Write the failing tests**

Append to `apps/web/src/api/client.test.ts` (import `apiPost` too):

```ts
it('POSTs JSON and parses the response', async () => {
  const fetchMock = stubFetchJson({ status: 'ok' });
  await expect(apiPost('/api/x', { a: 1 }, z.object({ status: z.literal('ok') }))).resolves.toEqual(
    { status: 'ok' },
  );
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/x',
    expect.objectContaining({ method: 'POST', body: '{"a":1}' }),
  );
});

it('turns a response that breaks the contract into an ApiError, not a raw ZodError', async () => {
  stubFetchJson({ status: 'nope' });
  await expect(apiGet('/api/x', z.object({ status: z.literal('ok') }))).rejects.toMatchObject({
    name: 'ApiError',
    code: 'INTERNAL',
    message: expect.stringContaining('/api/x') as unknown,
  });
});
```

`apps/web/src/features/sync/follow-sync.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { aSyncRun } from '../../test/sample-data';
import { startAndFollow } from './follow-sync';

describe('startAndFollow', () => {
  it('starts a run and polls it until it finishes, reporting every state', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(aSyncRun({ status: 'queued', done: 0 })))
      .mockResolvedValueOnce(Response.json(aSyncRun({ status: 'running', done: 1 })))
      .mockResolvedValueOnce(Response.json(aSyncRun({ status: 'succeeded', done: 7 })));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];

    const finished = await startAndFollow(
      { kind: 'lists', eventId: 'EVT1' },
      (run) => {
        seen.push(run.status);
      },
      0,
    );

    expect(finished).toMatchObject({ status: 'succeeded', done: 7 });
    expect(seen).toEqual(['queued', 'running', 'succeeded']);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/sync',
      '/api/sync-runs/1',
      '/api/sync-runs/1',
    ]);
  });
});
```

`apps/web/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatEventDates, formatEventSize } from './format';

const utcDay = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });

describe('formatEventDates', () => {
  it('shows calendar days in UTC, so an evening start never shifts a day', () => {
    expect(formatEventDates('2026-08-08T23:30:00.000Z', null)).toBe(
      utcDay.format(new Date('2026-08-08T12:00:00Z')),
    );
  });

  it('shows a range for multi-day events', () => {
    expect(formatEventDates('2026-08-08T08:00:00.000Z', '2026-08-09T18:00:00.000Z')).toBe(
      utcDay.formatRange(new Date('2026-08-08T00:00:00Z'), new Date('2026-08-09T00:00:00Z')),
    );
  });
});

describe('formatEventSize', () => {
  it('adds the team count when known', () => {
    expect(formatEventSize({ playerCount: 432, teamCount: 108 })).toBe('432 players · 108 teams');
    expect(formatEventSize({ playerCount: 64, teamCount: null })).toBe('64 players');
    expect(formatEventSize({ playerCount: 1, teamCount: null })).toBe('1 player');
  });
});
```

Run: `pnpm vitest run --project web`
Expected: FAIL, because `apiPost`, `./follow-sync`, `formatEventDates` and `formatEventSize` don't exist.

- [ ] **Step 5: Implement**

Replace everything below the `ApiError` class in `apps/web/src/api/client.ts` with:

```ts
async function request<S extends z.ZodType>(
  path: string,
  init: RequestInit,
  schema: S,
): Promise<z.output<S>> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the API server. Is it running?', error);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorBodySchema.safeParse(body);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(response.status, code, message, details);
    }
    throw new ApiError(response.status, 'INTERNAL', `Request failed with HTTP ${response.status}`);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      'INTERNAL',
      `The API sent an unexpected response for ${path}`,
      parsed.error.issues,
    );
  }
  return parsed.data;
}

/** GETs JSON from our API and validates it, so components only ever see well-typed data. */
export function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  return request(path, { headers: { accept: 'application/json' } }, schema);
}

/** POSTs a JSON body; the API requires the JSON content type on every state change. */
export function apiPost<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
): Promise<z.output<S>> {
  return request(
    path,
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    schema,
  );
}
```

`apps/web/src/features/sync/follow-sync.ts`:

```ts
import { SyncRunSchema, type SyncRequest, type SyncRun } from '@bcp/shared';
import { apiGet, apiPost } from '../../api/client';

/** How often a running sync is polled (spec §7). */
export const SYNC_POLL_MS = 2000;

export const isActiveRun = (run: SyncRun) => run.status === 'queued' || run.status === 'running';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls a run until it has finished, reporting each state; resolves with the finished run. */
export async function followRun(
  run: SyncRun,
  onProgress: (run: SyncRun) => void,
  pollMs = SYNC_POLL_MS,
): Promise<SyncRun> {
  let current = run;
  onProgress(current);
  while (isActiveRun(current)) {
    await wait(pollMs);
    current = await apiGet(`/api/sync-runs/${current.id}`, SyncRunSchema);
    onProgress(current);
  }
  return current;
}

/** Starts a sync (or joins the equivalent active one) and follows it to the end. */
export async function startAndFollow(
  request: SyncRequest,
  onProgress: (run: SyncRun) => void,
  pollMs = SYNC_POLL_MS,
): Promise<SyncRun> {
  return followRun(await apiPost('/api/sync', request, SyncRunSchema), onProgress, pollMs);
}
```

`apps/web/src/features/sync/use-sync.ts`:

```ts
import type { SyncRequest, SyncRun } from '@bcp/shared';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useState } from 'react';
import { startAndFollow } from './follow-sync';

export interface UseSyncOptions {
  /** Shown in notifications, e.g. "Army lists". */
  label: string;
  /** Queries to refresh once the run has finished. */
  invalidate: QueryKey[];
}

export function notifySyncFinished(label: string, run: SyncRun): void {
  if (run.status === 'failed') {
    notifications.show({
      color: 'red',
      title: `${label} failed`,
      message: run.error ?? 'Unknown error',
    });
    return;
  }
  const unavailable = run.failed > 0 ? ` · ${run.failed} unavailable` : '';
  notifications.show({
    color: 'neon',
    title: `${label} finished`,
    message: `${run.done} done${unavailable}`,
  });
}

/**
 * Starts a sync and follows it to the end. The polling lives inside the mutation, so there is no
 * effect to keep in step: `run` is the latest progress, `isSyncing` is true until it has finished.
 */
export function useSync({ label, invalidate }: UseSyncOptions) {
  const queryClient = useQueryClient();
  const [run, setRun] = useState<SyncRun | null>(null);
  const mutation = useMutation({
    mutationFn: (request: SyncRequest) => startAndFollow(request, setRun),
    onSuccess: async (finished) => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      notifySyncFinished(label, finished);
    },
    onError: (error) => {
      notifications.show({ color: 'red', title: `${label} failed`, message: error.message });
    },
  });
  return { start: mutation.mutate, run, isSyncing: mutation.isPending };
}
```

Append to `apps/web/src/lib/format.ts`:

```ts
const eventDayFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

/** Event dates are calendar days: shown in UTC, so a date never shifts with the viewer's zone. */
export function formatEventDates(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  if (endIso === null) return eventDayFormat.format(start);
  return eventDayFormat.formatRange(start, new Date(endIso));
}

/** A `YYYY-MM-DD` calendar day, formatted like event dates. */
export function formatIsoDay(day: string): string {
  return eventDayFormat.format(new Date(`${day}T00:00:00Z`));
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** "432 players · 108 teams", or just the players when the team count isn't known. */
export function formatEventSize(event: { playerCount: number; teamCount: number | null }): string {
  const players = plural(event.playerCount, 'player');
  return event.teamCount === null ? players : `${players} · ${plural(event.teamCount, 'team')}`;
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run --project web`
Expected: PASS, including the existing BcpStatusCard tests, whose error test still finds its message and the Retry button.

- [ ] **Step 7: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(web): POST client, sync following, error states, UTC event dates and UI deps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Event page — header, players, list drawer, fetch lists, export

**Files:**

- Create:
  - `apps/web/src/routes/events.$eventId.tsx`
  - `apps/web/src/features/event/`: `event-queries.ts`, `players-filter.ts`, `EventPage.tsx`, `EventHeader.tsx`, `PlayersPanel.tsx`, `ListStatusBadge.tsx`, `ListDrawer.tsx`, `FetchListsButton.tsx`, `ExportMenu.tsx`
- Generated: `apps/web/src/routeTree.gen.ts`
- Test: `apps/web/src/features/event/players-filter.test.ts`, `ListDrawer.test.tsx`, `FetchListsButton.test.tsx`, `EventPage.test.tsx`

**Interfaces:**

- Consumes:
  - `EventDetailSchema`, `EventPlayersResponseSchema`, `PlayerListSchema`, `ListExportFormat` (Task 3)
  - `apiGet`, `ApiError`, `useSync`, `isActiveRun`, `ErrorState`, `Panel`, `EventStatusBadges`, `formatEventDates`, `formatEventSize`, `formatDateTime` (Task 6)
  - The routes from Task 5
- Produces:
  - The `/events/$eventId` route (Task 8 links to it)
  - `eventQuery(id)` (key `['event', id]`), `playersQuery(id)` (key `['event', id, 'players']`), `playerListQuery(playerId)`, `exportUrl(id, format)`
  - `filterPlayers(players, { query, faction })`, `factionsOf(players)`, `formatRecord(player)`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/event/players-filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aPlayer } from '../../test/sample-data';
import { factionsOf, filterPlayers, formatRecord } from './players-filter';

const players = [
  aPlayer(),
  aPlayer({ bcpId: 'PL-FINN', name: 'Finn Ford', teamName: 'Charlie Wing', faction: 'Orks' }),
  aPlayer({ bcpId: 'PL-SOLO', name: 'Solo', teamName: null, faction: null }),
];

describe('filterPlayers', () => {
  it('matches player or team names, ignoring case and surrounding spaces', () => {
    const names = (query: string) =>
      filterPlayers(players, { query, faction: null }).map((p) => p.name);
    expect(names('  ADA ')).toEqual(['Ada Archer']);
    expect(names('charlie')).toEqual(['Finn Ford']);
    expect(names('')).toHaveLength(3);
  });

  it('filters by faction, combined with the text', () => {
    expect(filterPlayers(players, { query: '', faction: 'Orks' }).map((p) => p.name)).toEqual([
      'Finn Ford',
    ]);
    expect(filterPlayers(players, { query: 'ada', faction: 'Orks' })).toEqual([]);
  });
});

describe('factionsOf / formatRecord', () => {
  it('lists distinct factions alphabetically and formats W-L-D', () => {
    expect(factionsOf(players)).toEqual(['Orks', 'Space Marines']);
    expect(formatRecord(aPlayer({ wins: 3, losses: 1, draws: 1 }))).toBe('3-1-1');
  });
});
```

`apps/web/src/features/event/ListDrawer.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aPlayer } from '../../test/sample-data';
import { ListDrawer } from './ListDrawer';

describe('ListDrawer', () => {
  it('shows a fetched list with a copy button', async () => {
    stubFetchRoutes({
      'GET /api/players/PL-ADA/list': {
        playerId: 'PL-ADA',
        playerName: 'Ada Archer',
        teamName: 'Alpha Squad',
        faction: 'Space Marines',
        listId: 'LS-ADA',
        text: 'Space Marines – Gladius Task Force\n\nCaptain (80 pts)',
        fetchedAt: '2026-09-23T10:00:00.000Z',
      },
    });
    renderWithProviders(<ListDrawer player={aPlayer()} onClose={vi.fn()} />);
    expect(await screen.findByText(/Gladius Task Force/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy list' })).toBeInTheDocument();
  });

  it('explains a list that is not fetched yet or was never submitted', () => {
    const { unmount } = renderWithProviders(
      <ListDrawer player={aPlayer({ listStatus: 'available' })} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/hasn't been fetched yet/)).toBeInTheDocument();
    unmount();
    renderWithProviders(<ListDrawer player={aPlayer({ listStatus: 'none' })} onClose={vi.fn()} />);
    expect(screen.getByText(/didn't submit a list/)).toBeInTheDocument();
  });
});
```

`apps/web/src/features/event/FetchListsButton.test.tsx` (Review Focus 5):

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail, aSyncRun } from '../../test/sample-data';
import { FetchListsButton } from './FetchListsButton';

describe('FetchListsButton', () => {
  it('offers to fetch the missing lists and starts a lists sync', async () => {
    const fetchMock = stubFetchRoutes({ 'POST /api/sync': aSyncRun({ status: 'succeeded' }) });
    renderWithProviders(<FetchListsButton event={anEventDetail()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fetch all lists (7 missing)' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      kind: 'lists',
      eventId: 'EVT1',
    });
  });

  it('explains hidden lists and lists that were unavailable last time', () => {
    renderWithProviders(
      <FetchListsButton
        event={anEventDetail({
          hideLists: true,
          counts: { players: 8, teams: 4, listsAvailable: 7, listsFetched: 5 },
          syncs: { event: null, pairings: null, lists: aSyncRun({ done: 5, failed: 2 }) },
        })}
      />,
    );
    expect(screen.getByText(/lists as hidden/)).toBeInTheDocument();
    expect(screen.getByText('2 lists were unavailable on the last fetch.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch all lists (2 missing)' })).toBeEnabled();
  });

  it('is disabled when every list is fetched, or when BCP has none', () => {
    const { unmount } = renderWithProviders(
      <FetchListsButton
        event={anEventDetail({
          counts: { players: 8, teams: 4, listsAvailable: 7, listsFetched: 7 },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'All lists fetched' })).toBeDisabled();
    unmount();
    renderWithProviders(
      <FetchListsButton
        event={anEventDetail({
          counts: { players: 8, teams: 4, listsAvailable: 0, listsFetched: 0 },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'No lists on BCP' })).toBeDisabled();
  });
});
```

`apps/web/src/features/event/EventPage.test.tsx` (Review Focus 1):

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail, aSyncRun } from '../../test/sample-data';
import { EventPage } from './EventPage';

describe('EventPage', () => {
  it('offers to fetch an event that is not in the catalogue yet', async () => {
    stubFetchRoutes({
      'GET /api/events/NOPE': () =>
        Response.json(
          { error: { code: 'NOT_FOUND', message: 'Event NOPE is not in the local catalogue' } },
          { status: 404 },
        ),
    });
    renderWithProviders(<EventPage eventId="NOPE" />);
    expect(await screen.findByText(/isn't in the local catalogue yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch from BCP' })).toBeInTheDocument();
  });

  it('loads a never-synced event from BCP automatically, once', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [] },
      'GET /api/events/EVT1': anEventDetail({
        stale: true,
        lastSyncedAt: null,
        syncs: { event: null, pairings: null, lists: null },
      }),
      'POST /api/sync': aSyncRun({ kind: 'event', status: 'succeeded' }),
    });
    renderWithProviders(<EventPage eventId="EVT1" />);

    expect(await screen.findByRole('heading', { name: 'Sample Team Open' })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/sync')).toHaveLength(1);
    });
  });
});
```

Run: `pnpm vitest run --project web src/features/event`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 2: Implement the queries and the pure helpers**

`apps/web/src/features/event/event-queries.ts`:

```ts
import {
  EventDetailSchema,
  EventPlayersResponseSchema,
  PlayerListSchema,
  type ListExportFormat,
} from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

const enc = encodeURIComponent;

/** Everything under ['event', id] is refreshed together after an event or lists sync. */
export const eventQuery = (eventId: string) =>
  queryOptions({
    queryKey: ['event', eventId],
    queryFn: () => apiGet(`/api/events/${enc(eventId)}`, EventDetailSchema),
  });

export const playersQuery = (eventId: string) =>
  queryOptions({
    queryKey: ['event', eventId, 'players'],
    queryFn: () => apiGet(`/api/events/${enc(eventId)}/players`, EventPlayersResponseSchema),
  });

export const playerListQuery = (playerId: string) =>
  queryOptions({
    queryKey: ['player-list', playerId],
    queryFn: () => apiGet(`/api/players/${enc(playerId)}/list`, PlayerListSchema),
  });

export const exportUrl = (eventId: string, format: ListExportFormat) =>
  `/api/events/${enc(eventId)}/lists/export?format=${format}`;
```

`apps/web/src/features/event/players-filter.ts`:

```ts
import type { EventPlayer } from '@bcp/shared';

export interface PlayerFilter {
  query: string;
  faction: string | null;
}

/** Players whose name or team contains the query (case-insensitive), in the chosen faction. */
export function filterPlayers(
  players: EventPlayer[],
  { query, faction }: PlayerFilter,
): EventPlayer[] {
  const needle = query.trim().toLocaleLowerCase();
  const matchesText = (player: EventPlayer) =>
    needle === '' ||
    player.name.toLocaleLowerCase().includes(needle) ||
    (player.teamName?.toLocaleLowerCase().includes(needle) ?? false);
  return players.filter(
    (player) => (faction === null || player.faction === faction) && matchesText(player),
  );
}

/** The factions present, alphabetically, for the faction filter. */
export function factionsOf(players: EventPlayer[]): string[] {
  const factions = new Set(players.flatMap((player) => (player.faction ? [player.faction] : [])));
  return [...factions].sort((a, b) => a.localeCompare(b));
}

export function formatRecord(player: Pick<EventPlayer, 'wins' | 'losses' | 'draws'>): string {
  return `${player.wins}-${player.losses}-${player.draws}`;
}
```

- [ ] **Step 3: Implement the components**

`apps/web/src/features/event/ListStatusBadge.tsx`:

```tsx
import type { ListStatus } from '@bcp/shared';
import { Badge, Text } from '@mantine/core';

export function ListStatusBadge({ status }: { status: ListStatus }) {
  switch (status) {
    case 'fetched':
      return (
        <Badge size="sm" variant="light">
          Fetched
        </Badge>
      );
    case 'available':
      return (
        <Badge size="sm" variant="outline" color="gray">
          Not fetched
        </Badge>
      );
    case 'none':
      return (
        <Text size="xs" c="dimmed">
          No list
        </Text>
      );
  }
}
```

`apps/web/src/features/event/ListDrawer.tsx`:

```tsx
import type { EventPlayer } from '@bcp/shared';
import { Button, Code, CopyButton, Drawer, Group, Skeleton, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import { playerListQuery } from './event-queries';

interface ListDrawerProps {
  player: EventPlayer | null;
  onClose: () => void;
}

export function ListDrawer({ player, onClose }: ListDrawerProps) {
  return (
    <Drawer
      opened={player !== null}
      onClose={onClose}
      position="right"
      size="lg"
      title={player?.name}
    >
      {player && <ListContent player={player} />}
    </Drawer>
  );
}

function ListContent({ player }: { player: EventPlayer }) {
  const list = useQuery({
    ...playerListQuery(player.bcpId),
    enabled: player.listStatus === 'fetched',
  });

  if (player.listStatus === 'none') {
    return (
      <Text size="sm" c="dimmed">
        This player didn't submit a list on BCP.
      </Text>
    );
  }
  if (player.listStatus === 'available') {
    return (
      <Text size="sm" c="dimmed">
        This list hasn't been fetched yet. Use "Fetch all lists" to download it.
      </Text>
    );
  }
  if (list.isPending) return <Skeleton height={240} />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;

  const text = list.data.text ?? '';
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {[list.data.faction, list.data.teamName].filter(Boolean).join(' · ')}
        </Text>
        <CopyButton value={text}>
          {({ copied, copy }) => (
            <Button size="xs" variant="outline" onClick={copy}>
              {copied ? 'Copied' : 'Copy list'}
            </Button>
          )}
        </CopyButton>
      </Group>
      <Code block>{text === '' ? 'The list is empty.' : text}</Code>
    </Stack>
  );
}
```

`apps/web/src/features/event/FetchListsButton.tsx`:

```tsx
import type { EventCounts, EventDetail } from '@bcp/shared';
import { Button, Progress, Stack, Text } from '@mantine/core';
import { useSync } from '../sync/use-sync';

function buttonLabel(counts: EventCounts): string {
  if (counts.listsAvailable === 0) return 'No lists on BCP';
  const missing = counts.listsAvailable - counts.listsFetched;
  return missing > 0 ? `Fetch all lists (${missing} missing)` : 'All lists fetched';
}

const listsWere = (count: number) => (count === 1 ? '1 list was' : `${count} lists were`);

export function FetchListsButton({ event }: { event: EventDetail }) {
  const sync = useSync({ label: 'Army lists', invalidate: [['event', event.bcpId]] });
  const missing = event.counts.listsAvailable - event.counts.listsFetched;
  const lastRun = event.syncs.lists;

  if (sync.isSyncing) {
    const total = sync.run?.total ?? 0;
    const processed = (sync.run?.done ?? 0) + (sync.run?.failed ?? 0);
    return (
      <Stack gap={4} w={220}>
        <Text size="xs" c="dimmed" className="numeric">
          Fetching lists {processed}/{total}
        </Text>
        <Progress
          value={total > 0 ? (processed / total) * 100 : 0}
          aria-label="List fetch progress"
        />
      </Stack>
    );
  }

  return (
    <Stack gap={4} align="flex-end" maw={300}>
      <Button
        size="sm"
        disabled={missing <= 0}
        onClick={() => {
          sync.start({ kind: 'lists', eventId: event.bcpId });
        }}
      >
        {buttonLabel(event.counts)}
      </Button>
      {event.hideLists && (
        <Text size="xs" c="yellow" ta="right">
          BCP marks this event's lists as hidden, so some may be unavailable.
        </Text>
      )}
      {lastRun?.status === 'succeeded' && lastRun.failed > 0 && (
        <Text size="xs" c="dimmed" ta="right">
          {listsWere(lastRun.failed)} unavailable on the last fetch.
        </Text>
      )}
    </Stack>
  );
}
```

`apps/web/src/features/event/ExportMenu.tsx`:

```tsx
import type { EventDetail } from '@bcp/shared';
import { Button, Menu } from '@mantine/core';
import { exportUrl } from './event-queries';

export function ExportMenu({ event }: { event: EventDetail }) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button size="sm" variant="outline" disabled={event.counts.listsFetched === 0}>
          Export lists
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component="a" href={exportUrl(event.bcpId, 'txt')} download>
          Download .txt
        </Menu.Item>
        <Menu.Item component="a" href={exportUrl(event.bcpId, 'json')} download>
          Download .json
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
```

`apps/web/src/features/event/EventHeader.tsx`:

```tsx
import type { EventDetail } from '@bcp/shared';
import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { EventStatusBadges } from '../../components/EventStatusBadges';
import { formatDateTime, formatEventDates, formatEventSize } from '../../lib/format';

interface EventHeaderProps {
  event: EventDetail;
  syncing: boolean;
  onRefresh: () => void;
}

export function EventHeader({ event, syncing, onRefresh }: EventHeaderProps) {
  const location = [event.city, event.country].filter(Boolean).join(', ');
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Title order={1}>{event.name}</Title>
        <Button variant="outline" size="sm" loading={syncing} onClick={onRefresh}>
          Refresh from BCP
        </Button>
      </Group>
      <Group gap="md" wrap="wrap">
        <Text size="sm" c="dimmed" className="numeric">
          {formatEventDates(event.startDate, event.endDate)}
        </Text>
        {location !== '' && (
          <Text size="sm" c="dimmed">
            {location}
          </Text>
        )}
        <Text size="sm" c="dimmed" className="numeric">
          {formatEventSize(event)}
        </Text>
        <EventStatusBadges event={event} />
      </Group>
      {event.lastSyncedAt !== null && (
        <Text size="xs" c="dimmed">
          Synced {formatDateTime(event.lastSyncedAt)}
        </Text>
      )}
    </Stack>
  );
}
```

`apps/web/src/features/event/PlayersPanel.tsx`:

```tsx
import type { EventDetail, EventPlayer } from '@bcp/shared';
import { Badge, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from 'mantine-datatable';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { playersQuery } from './event-queries';
import { ExportMenu } from './ExportMenu';
import { FetchListsButton } from './FetchListsButton';
import { ListDrawer } from './ListDrawer';
import { ListStatusBadge } from './ListStatusBadge';
import { factionsOf, filterPlayers, formatRecord } from './players-filter';

function emptyText(loadingFromBcp: boolean, playerCount: number): string {
  if (loadingFromBcp) return 'Loading players from BCP…';
  if (playerCount === 0) return 'No players loaded yet. Use "Refresh from BCP".';
  return 'No players match the filter.';
}

interface PlayersPanelProps {
  event: EventDetail;
  /** True while a first-ever event sync is loading the players. */
  loadingFromBcp: boolean;
}

export function PlayersPanel({ event, loadingFromBcp }: PlayersPanelProps) {
  const players = useQuery(playersQuery(event.bcpId));
  const [query, setQuery] = useState('');
  const [faction, setFaction] = useState<string | null>(null);
  const [openPlayer, setOpenPlayer] = useState<EventPlayer | null>(null);
  const all = players.data?.items ?? [];

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="wrap">
          <TextInput
            aria-label="Search players"
            placeholder="Search player or team"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
            }}
            w={240}
          />
          <Select
            aria-label="Faction"
            placeholder="All factions"
            data={factionsOf(all)}
            value={faction}
            onChange={setFaction}
            clearable
            searchable
            w={220}
          />
        </Group>
        <Group gap="sm" align="flex-start">
          <FetchListsButton event={event} />
          <ExportMenu event={event} />
        </Group>
      </Group>

      {players.error ? (
        <ErrorState error={players.error} onRetry={() => void players.refetch()} />
      ) : (
        <Panel p={0}>
          <DataTable<EventPlayer>
            records={filterPlayers(all, { query, faction })}
            idAccessor="bcpId"
            fetching={players.isFetching || loadingFromBcp}
            minHeight={220}
            highlightOnHover
            noRecordsText={emptyText(loadingFromBcp, all.length)}
            onRowClick={({ record }) => {
              setOpenPlayer(record);
            }}
            columns={[
              {
                accessor: 'placing',
                title: '#',
                width: 56,
                textAlign: 'right',
                render: (p) => <span className="numeric">{p.placing ?? '—'}</span>,
              },
              {
                accessor: 'name',
                title: 'Player',
                render: (p) => (
                  <Group gap="xs" wrap="nowrap">
                    <Text size="sm">{p.name}</Text>
                    {p.dropped && (
                      <Badge size="xs" color="gray" variant="outline">
                        Dropped
                      </Badge>
                    )}
                  </Group>
                ),
              },
              {
                accessor: 'teamName',
                title: 'Team',
                hidden: !event.isTeamEvent,
                render: (p) => p.teamName ?? '—',
              },
              { accessor: 'faction', title: 'Faction', render: (p) => p.faction ?? '—' },
              {
                accessor: 'wins',
                title: 'W-L-D',
                textAlign: 'right',
                render: (p) => <span className="numeric">{formatRecord(p)}</span>,
              },
              {
                accessor: 'listStatus',
                title: 'List',
                render: (p) => <ListStatusBadge status={p.listStatus} />,
              },
            ]}
          />
        </Panel>
      )}

      <ListDrawer
        player={openPlayer}
        onClose={() => {
          setOpenPlayer(null);
        }}
      />
    </Stack>
  );
}
```

`apps/web/src/features/event/EventPage.tsx`:

```tsx
import { Button, Skeleton, Stack, Tabs, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { isActiveRun } from '../sync/follow-sync';
import { useSync } from '../sync/use-sync';
import { EventHeader } from './EventHeader';
import { eventQuery } from './event-queries';
import { PlayersPanel } from './PlayersPanel';

export function EventPage({ eventId }: { eventId: string }) {
  const event = useQuery(eventQuery(eventId));
  const { start, isSyncing } = useSync({ label: 'Event sync', invalidate: [['event', eventId]] });
  const eventRun = event.data?.syncs.event ?? null;
  const needsLoad = event.data?.stale === true && !(eventRun && isActiveRun(eventRun));

  // A never-synced event, or a running one synced 10+ minutes ago, is (re)loaded from BCP on open.
  // The dependencies don't change if that sync fails, so a failure is not retried in a loop.
  useEffect(() => {
    if (needsLoad) start({ kind: 'event', eventId });
  }, [needsLoad, start, eventId]);

  if (event.isPending) return <Skeleton height={160} />;

  if (event.error) {
    if (event.error instanceof ApiError && event.error.code === 'NOT_FOUND') {
      return (
        <Panel title="Not in the catalogue">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">
              This event isn't in the local catalogue yet. Fetch it from BCP to see its players and
              lists.
            </Text>
            <Button
              loading={isSyncing}
              onClick={() => {
                start({ kind: 'event', eventId });
              }}
            >
              Fetch from BCP
            </Button>
          </Stack>
        </Panel>
      );
    }
    return <ErrorState error={event.error} onRetry={() => void event.refetch()} />;
  }

  const detail = event.data;
  return (
    <Stack gap="lg">
      <EventHeader
        event={detail}
        syncing={isSyncing}
        onRefresh={() => {
          start({ kind: 'event', eventId });
        }}
      />
      {/* Plan 3 adds the Rounds, Standings and Matchups tabs. */}
      <Tabs defaultValue="players">
        <Tabs.List>
          <Tabs.Tab value="players">Players &amp; lists</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="players" pt="md">
          <PlayersPanel event={detail} loadingFromBcp={isSyncing && detail.lastSyncedAt === null} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
```

`apps/web/src/routes/events.$eventId.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { EventPage } from '../features/event/EventPage';

export const Route = createFileRoute('/events/$eventId')({ component: EventRoute });

function EventRoute() {
  const { eventId } = Route.useParams();
  // A new key per event resets filters, the open drawer and sync progress when switching events.
  return <EventPage key={eventId} eventId={eventId} />;
}
```

```bash
pnpm --filter @bcp/web exec tsr generate
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project web`
Expected: PASS.

If `mantine-datatable`'s API differs from the code above (e.g. how `onRowClick` or `hidden` is named) in the installed version, adapt it to the installed types without losing the behaviour, and record the change under Deviations.

- [ ] **Step 5: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(web): event page with players, list drawer, list fetching and export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Tournament finder — size presets, Latest view, deep search, coverage gaps

**Files:**

- Create: `apps/web/src/features/finder/`: `finder-search.ts`, `finder-queries.ts`, `FinderPage.tsx`, `SizeFilter.tsx`, `AdvancedSearch.tsx`, `CatalogStatus.tsx`, `CoverageNotice.tsx`, `EventsTable.tsx`
- Modify: `apps/web/src/routes/index.tsx`
- Generated: `apps/web/src/routeTree.gen.ts`
- Test: `apps/web/src/features/finder/finder-search.test.ts`, `SizeFilter.test.tsx`, `EventsTable.test.tsx`, `CoverageNotice.test.tsx`

**Interfaces:**

- Consumes:
  - `EventListResponseSchema`, `CatalogCoverageSchema`, `LatestRefreshSchema`, `addDays`, `toIsoDate`, `findGaps`, `estimateCatalogRequests` (Tasks 3–4)
  - `apiGet`, `apiPost`, `useSync`, `followRun`, `notifySyncFinished`, `ErrorState`, `Panel`, `EventStatusBadges`, formatters (Task 6)
  - The `/events/$eventId` route (Task 7)
- Produces:
  - `SIZE_PRESETS`, `FINDER_PAGE_SIZE = 25`, `LATEST_VIEW_DAYS = 30`
  - `FinderSearchSchema`/`FinderSearch`, `sizeBounds(search)`, `finderWindow(search, now)`, `isLatestView(search)`, `toEventsQueryString(search, now)`
  - `eventsQuery(queryString)`, `coverageQuery`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/finder/finder-search.test.ts` (Review Focus 2):

```ts
import { describe, expect, it } from 'vitest';
import {
  FinderSearchSchema,
  finderWindow,
  sizeBounds,
  toEventsQueryString,
  type FinderSearch,
} from './finder-search';

const now = new Date('2026-09-23T12:00:00Z');
const defaults = FinderSearchSchema.parse({});
const search = (changes: Partial<FinderSearch>): FinderSearch => ({ ...defaults, ...changes });

describe('FinderSearchSchema', () => {
  it('defaults to the latest view of 40+ player events, newest first', () => {
    expect(defaults).toEqual({ size: '40', type: 'all', sort: 'date', page: 1 });
  });

  it('falls back to defaults for garbage instead of failing', () => {
    expect(
      FinderSearchSchema.parse({
        size: 'huge',
        min: 'abc',
        from: 'yesterday',
        type: 'x',
        sort: 1,
        page: -3,
      }),
    ).toEqual({ size: '40', type: 'all', sort: 'date', page: 1 });
  });
});

describe('sizeBounds', () => {
  it('maps presets to a minimum player count', () => {
    expect(sizeBounds(search({ size: '100' }))).toEqual({ minPlayers: 100 });
    expect(sizeBounds(search({ size: 'all' }))).toEqual({ minPlayers: 0 });
  });

  it('uses the custom window, ignoring a maximum below the minimum', () => {
    expect(sizeBounds(search({ size: 'custom', min: 50, max: 120 }))).toEqual({
      minPlayers: 50,
      maxPlayers: 120,
    });
    expect(sizeBounds(search({ size: 'custom', min: 100, max: 40 }))).toEqual({ minPlayers: 100 });
  });
});

describe('finderWindow', () => {
  it('is the last 30 days in the latest view', () => {
    expect(finderWindow(defaults, now)).toEqual({ from: '2026-08-24', to: '2026-09-23' });
  });

  it('fills an open end and swaps a reversed range', () => {
    expect(finderWindow(search({ from: '2026-01-01' }), now)).toEqual({
      from: '2026-01-01',
      to: '2026-09-23',
    });
    expect(finderWindow(search({ from: '2026-05-01', to: '2026-02-01' }), now)).toEqual({
      from: '2026-02-01',
      to: '2026-05-01',
    });
  });
});

describe('toEventsQueryString', () => {
  it('builds the API query for the current search', () => {
    const query = new URLSearchParams(
      toEventsQueryString(search({ q: 'open', country: 'Germany', sort: 'players' }), now),
    );
    expect(Object.fromEntries(query)).toEqual({
      from: '2026-08-24',
      to: '2026-09-23',
      minPlayers: '40',
      type: 'all',
      sort: 'players',
      page: '1',
      pageSize: '25',
      q: 'open',
      country: 'Germany',
    });
  });
});
```

`apps/web/src/features/finder/SizeFilter.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { SizeFilter } from './SizeFilter';

describe('SizeFilter', () => {
  it('switches presets', () => {
    const onChange = vi.fn();
    renderWithProviders(<SizeFilter search={{ size: '40' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: '100+' }));
    expect(onChange).toHaveBeenCalledWith({ size: '100' });
    expect(screen.queryByLabelText('Min players')).toBeNull();
  });

  it('shows min and max inputs for a custom size', () => {
    renderWithProviders(
      <SizeFilter search={{ size: 'custom', min: 50, max: 120 }} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Min players')).toHaveValue('50');
    expect(screen.getByLabelText('Max players')).toHaveValue('120');
  });
});
```

`apps/web/src/features/finder/EventsTable.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { anEvent } from '../../test/sample-data';
import { EventsTable } from './EventsTable';

const props = {
  fetching: false,
  page: 1,
  onPageChange: vi.fn(),
  emptyText: 'Nothing here',
};

describe('EventsTable', () => {
  it('lists events with size and badges, and opens one on click', () => {
    const onOpen = vi.fn();
    renderWithProviders(
      <EventsTable
        {...props}
        onOpen={onOpen}
        response={{
          items: [anEvent({ playerCount: 432, teamCount: 108 })],
          total: 1,
          page: 1,
          pageSize: 25,
        }}
      />,
    );
    expect(screen.getByText('432 players · 108 teams')).toBeInTheDocument();
    expect(screen.getByText('Teams')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sample Team Open'));
    expect(onOpen).toHaveBeenCalledWith('EVT1');
  });

  it('shows the empty text', () => {
    renderWithProviders(
      <EventsTable
        {...props}
        onOpen={vi.fn()}
        response={{ items: [], total: 0, page: 1, pageSize: 25 }}
      />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});
```

`apps/web/src/features/finder/CoverageNotice.test.tsx` (Review Focus 3, UI side):

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aSyncRun } from '../../test/sample-data';
import { CoverageNotice } from './CoverageNotice';

const window = { from: '2026-01-01', to: '2026-12-31' };
const coverage = (ranges: { from: string; to: string }[]) => ({
  ranges: ranges.map((range) => ({ ...range, syncedAt: '2026-09-23T10:00:00.000Z' })),
  lastSyncedAt: '2026-09-23T10:00:00.000Z',
  activeRun: null,
});

describe('CoverageNotice', () => {
  it('offers to fetch only the span that has not been fetched', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/catalog/coverage': coverage([{ from: '2026-01-01', to: '2026-06-30' }]),
      'POST /api/sync': aSyncRun({ kind: 'catalog', eventId: null, status: 'succeeded' }),
      'GET /api/events': { items: [], total: 0, page: 1, pageSize: 25 },
    });
    renderWithProviders(<CoverageNotice window={window} />);

    expect(await screen.findByText(/hasn't been fetched from BCP yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/sync')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/sync');
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      kind: 'catalog',
      from: '2026-07-01',
      to: '2026-12-31',
    });
  });

  it('stays quiet when the whole range is fetched', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/catalog/coverage': coverage([{ from: '2025-01-01', to: '2027-01-01' }]),
    });
    const { container } = renderWithProviders(<CoverageNotice window={window} />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
```

(The container is empty apart from Mantine's style tags. If `toBeEmptyDOMElement` trips over them, assert `screen.queryByText(/hasn't been fetched/)` is null instead.)

Run: `pnpm vitest run --project web src/features/finder`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 2: Implement the search model and queries**

`apps/web/src/features/finder/finder-search.ts`:

```ts
import { addDays, toIsoDate, type DateRange } from '@bcp/shared';
import { z } from 'zod';

export const SIZE_PRESETS = [
  { value: 'all', label: 'All', minPlayers: 0 },
  { value: '16', label: '16+', minPlayers: 16 },
  { value: '40', label: '40+', minPlayers: 40 },
  { value: '100', label: '100+', minPlayers: 100 },
  { value: '200', label: '200+', minPlayers: 200 },
] as const;

export const FINDER_PAGE_SIZE = 25;
/** The "Latest" view: events that started in the last 30 days (spec §10). */
export const LATEST_VIEW_DAYS = 30;

const optionalCount = z.coerce.number().int().nonnegative().optional().catch(undefined);
const optionalDay = z.iso.date().optional().catch(undefined);
const optionalText = z.string().trim().min(1).optional().catch(undefined);

/** The finder's URL search params. Anything malformed falls back to its default, so a bad link still opens. */
export const FinderSearchSchema = z.object({
  size: z.enum(['all', '16', '40', '100', '200', 'custom']).catch('40'),
  min: optionalCount,
  max: optionalCount,
  from: optionalDay,
  to: optionalDay,
  q: optionalText,
  country: optionalText,
  type: z.enum(['all', 'singles', 'teams']).catch('all'),
  sort: z.enum(['date', 'players']).catch('date'),
  page: z.coerce.number().int().positive().catch(1),
});
export type FinderSearch = z.infer<typeof FinderSearchSchema>;

export const isLatestView = (search: Pick<FinderSearch, 'from' | 'to'>) =>
  search.from === undefined && search.to === undefined;

export function sizeBounds(search: Pick<FinderSearch, 'size' | 'min' | 'max'>): {
  minPlayers: number;
  maxPlayers?: number;
} {
  if (search.size !== 'custom') {
    const preset = SIZE_PRESETS.find((candidate) => candidate.value === search.size);
    return { minPlayers: preset?.minPlayers ?? 0 };
  }
  const minPlayers = search.min ?? 0;
  // A maximum below the minimum can only come from a hand-edited URL: ignore it rather than error.
  return search.max !== undefined && search.max >= minPlayers
    ? { minPlayers, maxPlayers: search.max }
    : { minPlayers };
}

/** The date window the finder shows: the "Latest" default, or the advanced range (open ends filled in). */
export function finderWindow(search: Pick<FinderSearch, 'from' | 'to'>, now: Date): DateRange {
  const today = toIsoDate(now);
  if (isLatestView(search)) return { from: addDays(today, -LATEST_VIEW_DAYS), to: today };
  const to = search.to ?? today;
  const from = search.from ?? addDays(to, -LATEST_VIEW_DAYS);
  return from <= to ? { from, to } : { from: to, to: from };
}

/** The query string for GET /api/events. */
export function toEventsQueryString(search: FinderSearch, now: Date): string {
  const { from, to } = finderWindow(search, now);
  const { minPlayers, maxPlayers } = sizeBounds(search);
  const params = new URLSearchParams({
    from,
    to,
    minPlayers: String(minPlayers),
    type: search.type,
    sort: search.sort,
    page: String(search.page),
    pageSize: String(FINDER_PAGE_SIZE),
  });
  if (maxPlayers !== undefined) params.set('maxPlayers', String(maxPlayers));
  if (search.q !== undefined) params.set('q', search.q);
  if (search.country !== undefined) params.set('country', search.country);
  return params.toString();
}
```

`apps/web/src/features/finder/finder-queries.ts`:

```ts
import { CatalogCoverageSchema, EventListResponseSchema } from '@bcp/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

/** Every events query starts with ['events'], so a catalogue sync refreshes them all. */
export const eventsQuery = (queryString: string) =>
  queryOptions({
    queryKey: ['events', queryString],
    queryFn: () => apiGet(`/api/events?${queryString}`, EventListResponseSchema),
    placeholderData: keepPreviousData,
  });

export const coverageQuery = queryOptions({
  queryKey: ['catalog', 'coverage'],
  queryFn: () => apiGet('/api/catalog/coverage', CatalogCoverageSchema),
  // While any catalogue run is active (even one started elsewhere), keep checking until it ends.
  refetchInterval: (query) => (query.state.data?.activeRun ? 2000 : false),
});
```

- [ ] **Step 3: Implement the components**

`apps/web/src/features/finder/SizeFilter.tsx`:

```tsx
import { Group, NumberInput, SegmentedControl, Stack, Text } from '@mantine/core';
import { FinderSearchSchema, SIZE_PRESETS, type FinderSearch } from './finder-search';

const OPTIONS = [
  ...SIZE_PRESETS.map((preset) => ({ label: preset.label, value: preset.value })),
  { label: 'Custom', value: 'custom' },
];

interface SizeFilterProps {
  search: Pick<FinderSearch, 'size' | 'min' | 'max'>;
  onChange: (changes: Partial<FinderSearch>) => void;
}

const countOrUndefined = (value: string | number) =>
  typeof value === 'number' ? value : undefined;

export function SizeFilter({ search, onChange }: SizeFilterProps) {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Players
      </Text>
      <SegmentedControl
        aria-label="Tournament size"
        data={OPTIONS}
        value={search.size}
        onChange={(value) => {
          onChange({ size: FinderSearchSchema.shape.size.parse(value) });
        }}
      />
      {search.size === 'custom' && (
        <Group gap="sm">
          <NumberInput
            label="Min players"
            min={0}
            w={140}
            value={search.min ?? ''}
            onChange={(value) => {
              onChange({ min: countOrUndefined(value) });
            }}
          />
          <NumberInput
            label="Max players"
            min={0}
            w={140}
            value={search.max ?? ''}
            onChange={(value) => {
              onChange({ max: countOrUndefined(value) });
            }}
          />
        </Group>
      )}
    </Stack>
  );
}
```

`apps/web/src/features/finder/AdvancedSearch.tsx`:

```tsx
import type { DateRange } from '@bcp/shared';
import {
  Button,
  Collapse,
  Group,
  Input,
  SegmentedControl,
  SimpleGrid,
  Stack,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedCallback, useDisclosure } from '@mantine/hooks';
import { FinderSearchSchema, isLatestView, type FinderSearch } from './finder-search';

interface AdvancedSearchProps {
  search: FinderSearch;
  window: DateRange;
  onChange: (changes: Partial<FinderSearch>) => void;
}

const TYPE_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Singles', value: 'singles' },
  { label: 'Teams', value: 'teams' },
];
const SORT_OPTIONS = [
  { label: 'Newest', value: 'date' },
  { label: 'Biggest', value: 'players' },
];

export function AdvancedSearch({ search, window, onChange }: AdvancedSearchProps) {
  const [opened, { toggle }] = useDisclosure(!isLatestView(search));
  // Text fields write to the URL after a pause, not on every keystroke.
  const setName = useDebouncedCallback((value: string) => {
    onChange({ q: value.trim() || undefined });
  }, 300);
  const setCountry = useDebouncedCallback((value: string) => {
    onChange({ country: value.trim() || undefined });
  }, 300);

  return (
    <Stack gap="sm">
      <Group gap="sm">
        <Button variant="subtle" size="compact-sm" onClick={toggle} aria-expanded={opened}>
          {opened ? 'Hide advanced search' : 'Advanced search'}
        </Button>
        {!isLatestView(search) && (
          <Button
            variant="subtle"
            size="compact-sm"
            color="gray"
            onClick={() => {
              onChange({ from: undefined, to: undefined });
            }}
          >
            Back to latest
          </Button>
        )}
      </Group>
      <Collapse in={opened}>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          <DatePickerInput
            type="range"
            label="Dates"
            valueFormat="D MMM YYYY"
            allowSingleDateInRange
            value={[window.from, window.to]}
            onChange={([from, to]) => {
              if (from && to) onChange({ from, to });
            }}
          />
          <TextInput
            label="Name"
            placeholder="e.g. Open, GT, Teams"
            defaultValue={search.q ?? ''}
            onChange={(e) => {
              setName(e.currentTarget.value);
            }}
          />
          <TextInput
            label="Country"
            placeholder="e.g. Germany"
            defaultValue={search.country ?? ''}
            onChange={(e) => {
              setCountry(e.currentTarget.value);
            }}
          />
          <Input.Wrapper label="Type">
            <SegmentedControl
              fullWidth
              data={TYPE_OPTIONS}
              value={search.type}
              onChange={(value) => {
                onChange({ type: FinderSearchSchema.shape.type.parse(value) });
              }}
            />
          </Input.Wrapper>
          <Input.Wrapper label="Sort">
            <SegmentedControl
              fullWidth
              data={SORT_OPTIONS}
              value={search.sort}
              onChange={(value) => {
                onChange({ sort: FinderSearchSchema.shape.sort.parse(value) });
              }}
            />
          </Input.Wrapper>
        </SimpleGrid>
      </Collapse>
    </Stack>
  );
}
```

`apps/web/src/features/finder/CatalogStatus.tsx`:

```tsx
import { LatestRefreshSchema, type SyncRun } from '@bcp/shared';
import { Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiPost } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { followRun } from '../sync/follow-sync';
import { notifySyncFinished } from '../sync/use-sync';
import { coverageQuery } from './finder-queries';

/** Keeps the "Latest" view current and says when the catalogue last synced. */
export function CatalogStatus() {
  const queryClient = useQueryClient();
  const coverage = useQuery(coverageQuery);
  const [run, setRun] = useState<SyncRun | null>(null);
  const refresh = useMutation({
    mutationFn: async () => {
      const { run: started } = await apiPost('/api/catalog/latest', {}, LatestRefreshSchema);
      return started ? followRun(started, setRun) : null;
    },
    onSuccess: async (finished) => {
      if (!finished) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: coverageQuery.queryKey }),
      ]);
      if (finished.status === 'failed') notifySyncFinished('Catalogue refresh', finished);
    },
  });
  const { mutate } = refresh;

  // Once per visit. The API skips it when the last 30 days were synced under 6 hours ago.
  useEffect(() => {
    mutate();
  }, [mutate]);

  if (refresh.isPending && run) {
    return (
      <Text size="sm" c="dimmed">
        Updating latest events from BCP… <span className="numeric">{run.done}</span> found
      </Text>
    );
  }
  if (refresh.isError) {
    return (
      <Text size="sm" c="red">
        Couldn't refresh from BCP: {refresh.error.message}
      </Text>
    );
  }
  const lastSyncedAt = coverage.data?.lastSyncedAt;
  return (
    <Text size="sm" c="dimmed">
      {lastSyncedAt
        ? `Catalogue synced ${formatDateTime(lastSyncedAt)}`
        : 'Catalogue not synced yet'}
    </Text>
  );
}
```

`apps/web/src/features/finder/CoverageNotice.tsx`:

```tsx
import { estimateCatalogRequests, findGaps, type DateRange } from '@bcp/shared';
import { Alert, Button, Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { formatIsoDay } from '../../lib/format';
import { useSync } from '../sync/use-sync';
import { coverageQuery } from './finder-queries';

/** Tells the user when part of a deep search hasn't been fetched from BCP, and fetches it on request. */
export function CoverageNotice({ window }: { window: DateRange }) {
  const coverage = useQuery(coverageQuery);
  const sync = useSync({
    label: 'Catalogue fetch',
    invalidate: [['events'], coverageQuery.queryKey],
  });
  if (!coverage.data) return null;

  if (sync.isSyncing || coverage.data.activeRun) {
    const found = sync.run?.done ?? coverage.data.activeRun?.done ?? 0;
    return (
      <Alert color="neon" variant="light" title="Fetching tournaments from BCP">
        <Text size="sm">
          <span className="numeric">{found}</span> events so far. Results appear when it's done.
        </Text>
      </Alert>
    );
  }

  const gaps = findGaps(window, coverage.data.ranges);
  const first = gaps[0];
  const last = gaps.at(-1);
  if (!first || !last) return null;
  // One run covers every gap; re-fetching a covered day in between is harmless.
  const span = { from: first.from, to: last.to };

  return (
    <Alert color="yellow" variant="light" title="Not fetched from BCP yet">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Text size="sm">
          {formatIsoDay(span.from)} – {formatIsoDay(span.to)} hasn't been fetched from BCP yet
          (about <span className="numeric">{estimateCatalogRequests(span)}</span> requests).
        </Text>
        <Button
          size="xs"
          onClick={() => {
            sync.start({ kind: 'catalog', ...span });
          }}
        >
          Fetch
        </Button>
      </Group>
    </Alert>
  );
}
```

`apps/web/src/features/finder/EventsTable.tsx`:

```tsx
import type { EventListItem, EventListResponse } from '@bcp/shared';
import { Text } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { EventStatusBadges } from '../../components/EventStatusBadges';
import { Panel } from '../../components/Panel';
import { formatEventDates, formatEventSize } from '../../lib/format';
import { FINDER_PAGE_SIZE } from './finder-search';

interface EventsTableProps {
  response: EventListResponse | undefined;
  fetching: boolean;
  page: number;
  onPageChange: (page: number) => void;
  onOpen: (eventId: string) => void;
  emptyText: string;
}

export function EventsTable({
  response,
  fetching,
  page,
  onPageChange,
  onOpen,
  emptyText,
}: EventsTableProps) {
  return (
    <Panel p={0}>
      <DataTable<EventListItem>
        records={response?.items ?? []}
        idAccessor="bcpId"
        fetching={fetching}
        minHeight={240}
        highlightOnHover
        noRecordsText={emptyText}
        totalRecords={response?.total ?? 0}
        recordsPerPage={FINDER_PAGE_SIZE}
        page={page}
        onPageChange={onPageChange}
        onRowClick={({ record }) => {
          onOpen(record.bcpId);
        }}
        columns={[
          {
            accessor: 'startDate',
            title: 'Date',
            render: (event) => (
              <Text size="sm" className="numeric">
                {formatEventDates(event.startDate, event.endDate)}
              </Text>
            ),
          },
          {
            accessor: 'name',
            title: 'Tournament',
            render: (event) => (
              <Text size="sm" fw={500}>
                {event.name}
              </Text>
            ),
          },
          {
            accessor: 'country',
            title: 'Location',
            render: (event) => [event.city, event.country].filter(Boolean).join(', ') || '—',
          },
          {
            accessor: 'playerCount',
            title: 'Size',
            textAlign: 'right',
            render: (event) => (
              <Text size="sm" className="numeric">
                {formatEventSize(event)}
              </Text>
            ),
          },
          {
            accessor: 'lastSyncedAt',
            title: 'Status',
            render: (event) => <EventStatusBadges event={event} />,
          },
        ]}
      />
    </Panel>
  );
}
```

`apps/web/src/features/finder/FinderPage.tsx`:

```tsx
import { Group, Stack, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { AdvancedSearch } from './AdvancedSearch';
import { CatalogStatus } from './CatalogStatus';
import { CoverageNotice } from './CoverageNotice';
import { EventsTable } from './EventsTable';
import { eventsQuery } from './finder-queries';
import {
  finderWindow,
  isLatestView,
  toEventsQueryString,
  type FinderSearch,
} from './finder-search';
import { SizeFilter } from './SizeFilter';

const route = getRouteApi('/');

const LATEST_EMPTY =
  'No tournaments of this size in the last 30 days. Try a smaller size or the advanced search.';
const SEARCH_EMPTY =
  'No tournaments match. Try a smaller size, a wider date range, or fetching missing dates above.';

export function FinderPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const now = new Date();
  const window = finderWindow(search, now);
  const events = useQuery(eventsQuery(toEventsQueryString(search, now)));

  const update = (changes: Partial<FinderSearch>) => {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...changes }) });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={1}>Tournaments</Title>
        <CatalogStatus />
      </Group>
      <Panel title="Filters">
        <Stack gap="md">
          <SizeFilter search={search} onChange={update} />
          <AdvancedSearch search={search} window={window} onChange={update} />
        </Stack>
      </Panel>
      {!isLatestView(search) && <CoverageNotice window={window} />}
      {events.error ? (
        <ErrorState error={events.error} onRetry={() => void events.refetch()} />
      ) : (
        <EventsTable
          response={events.data}
          fetching={events.isFetching}
          page={search.page}
          onPageChange={(page) => {
            update({ page });
          }}
          onOpen={(eventId) => {
            void navigate({ to: '/events/$eventId', params: { eventId } });
          }}
          emptyText={isLatestView(search) ? LATEST_EMPTY : SEARCH_EMPTY}
        />
      )}
    </Stack>
  );
}
```

Replace `apps/web/src/routes/index.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { FinderPage } from '../features/finder/FinderPage';
import { FinderSearchSchema } from '../features/finder/finder-search';

export const Route = createFileRoute('/')({
  validateSearch: FinderSearchSchema,
  component: FinderPage,
});
```

```bash
pnpm --filter @bcp/web exec tsr generate
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project web`
Expected: PASS.

If TanStack Router's typing of `navigate({ search: (previous) => … })` with the zod schema needs an explicit input type, use `validateSearch: (raw) => FinderSearchSchema.parse(raw)` and record it under Deviations.

- [ ] **Step 5: Look at it**

```bash
DATABASE_URL=pglite://memory pnpm dev
```

(Pass `DATABASE_URL` through the environment. It overrides `.env` for this run, so no Docker is needed.)

Open http://localhost:5173. Expected:

- The status line shows "Updating latest events from BCP…", then "Catalogue synced …". The fixture source returns the three sample events for any range.
- 40+ selects only "Sample Singles GT" (64 players) if it falls in the window. With fixtures dated March/April 2026 the Latest table may be empty; that's correct.
- "Advanced search" with 1 Jan – 31 Dec 2026 shows the yellow "not fetched" notice. Fetch, and the sample events appear.
- Clicking "Sample Team Open" opens the event page. It loads its players automatically, "Fetch all lists (7 missing)" works, and a player row opens the list drawer.
- At 375px width, nothing overflows horizontally.

Stop the dev servers.

- [ ] **Step 6: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(web): tournament finder with size presets, latest view, deep search and coverage gaps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Playwright smoke test and README

**Files:**

- Create: `playwright.config.ts`, `e2e/finder-to-list.spec.ts`
- Modify: root `package.json` (the `e2e` script and the `@playwright/test` dev dependency), `apps/web/vite.config.ts` (proxy target from the environment), root `tsconfig.json` (include e2e), `eslint.config.js` (node globals for e2e), `.gitignore`, `README.md`

**Interfaces:**

- Consumes: every route and page from Tasks 1–8, and `DATABASE_URL=pglite://memory` (Task 2).
- Produces: `pnpm e2e`, a real-browser smoke test against fixtures. It isn't part of `pnpm check`, because it needs a downloaded browser.

- [ ] **Step 1: Install Playwright and point the dev proxy at a configurable API**

```bash
pnpm add -Dw @playwright/test
pnpm exec playwright install chromium
```

In `apps/web/vite.config.ts`, change the proxy line to:

```ts
  server: {
    port: 5173,
    // The e2e test runs its own API on another port.
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001' },
  },
```

- [ ] **Step 2: Write the config and the smoke test**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3101;
const WEB_PORT = 5174;

/** Real browser, real API and web app, fixture data, in-memory Postgres: no network, no Docker. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @bcp/api start',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
        DATABASE_URL: 'pglite://memory',
        TOURNAMENT_SOURCE: 'fixtures',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `pnpm --filter @bcp/web exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
```

`e2e/finder-to-list.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('find a tournament, fetch its lists and read one', async ({ page }) => {
  // A deep search over 2026: it hasn't been fetched from BCP yet, so the finder offers to.
  await page.goto('/?size=all&from=2026-01-01&to=2026-12-31');
  await page.getByRole('button', { name: 'Fetch', exact: true }).click();

  await page.getByText('Sample Team Open').click();
  await expect(page.getByRole('heading', { name: 'Sample Team Open' })).toBeVisible();

  // Opening a never-synced event loads its players automatically.
  await expect(page.getByText('Ada Archer')).toBeVisible();

  await page.getByRole('button', { name: 'Fetch all lists (7 missing)' }).click();
  await expect(page.getByRole('button', { name: 'All lists fetched' })).toBeVisible({
    timeout: 20_000,
  });

  await page.getByText('Ada Archer').click();
  await expect(page.getByText(/Gladius Task Force/)).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Export lists' }).click();
  await expect(page.getByRole('menuitem', { name: 'Download .txt' })).toHaveAttribute(
    'href',
    '/api/events/EVTTEAM0001/lists/export?format=txt',
  );
});
```

Also:

- Add `"e2e": "playwright test"` to the root `package.json` scripts.
- Add `"playwright.config.ts"` and `"e2e"` to the root `tsconfig.json` `include`.
- In `eslint.config.js`, add `'e2e/**/*.ts'` to the files list of the node-globals block.
- Add `test-results/` and `playwright-report/` to `.gitignore`.

- [ ] **Step 3: Run it**

Run: `pnpm e2e`
Expected: 1 passed.

If the "Fetch" button isn't visible because the automatic latest refresh is still running (the notice then says "Fetching tournaments from BCP"), keep the flow as it is and wait for the button with `await expect(fetchButton).toBeVisible({ timeout: 20_000 })` before clicking. Record the change.

- [ ] **Step 4: Update the README**

Add a "Using it" section after "Connecting to BCP":

```markdown
## Using it

- **Tournaments** (the start page) shows the biggest events of the last 30 days. Pick a size
  (All · 16+ · 40+ · 100+ · 200+, or Custom min/max). **Advanced search** adds a date range, name,
  country, singles/teams and newest/biggest sorting. When a date range hasn't been fetched from BCP
  yet, the page says so and offers **Fetch** (with the approximate number of requests).
- **An event page** loads its players from BCP the first time you open it. **Fetch all lists**
  downloads every army list (about 2 per second), **Export lists** saves them as `.txt` or `.json`,
  and clicking a player shows their list with a copy button.
- No Docker? `DATABASE_URL=pglite://memory pnpm dev` runs everything in memory (lost on restart).
```

Add these rows to the Commands table:

```markdown
| `pnpm e2e` | Browser smoke test on fixtures (first time: `pnpm exec playwright install chromium`) |
```

- [ ] **Step 5: Check and commit**

```bash
pnpm check
git add -A
git commit -m "test(e2e): Playwright smoke test from finder to army list; README usage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
