# Smarter List Fetching Implementation Plan (plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Army lists are fetched through a persistent background queue: one list every 5 s. You can queue lists by result ("X-n or better"), queue all missing lists, or queue one player's list (which jumps ahead). Progress, pause/resume and failures are visible in the event page, the header and Settings.

**Architecture:**

- A `list_queue` Postgres table, with one `ListQueueWorker` per API process claiming a row per tick (`FOR UPDATE SKIP LOCKED`). It pauses itself when BCP rejects the login or rate-limits us.
- Queue routes replace the burst `lists` sync, which is retired.
- Player list status and event counts come from stored lists plus each player's newest queue row.
- The web app gets a header queue indicator, a Settings card, a "Fetch lists" menu with result filters, a queue line on the event page, a record filter, and a drawer that can queue one list.

**Tech Stack:** as plans 1–2 (Hono, Drizzle and Postgres/PGlite, Zod 4, React 19 with React Compiler, Mantine 9.6.2, TanStack Router and Query, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-24-list-queue-design.md` (read with the main spec `2026-09-23-bcp-analyzer-design.md`).

**Deliberate refinements of the spec (apply when reading it):**

- **Event estimate.** `EventDetail` gains `listQueueSeconds: number | null`, the estimate until this event's queued lists are done. The event queue line reads it.
- **Drawer polling.** The drawer doesn't poll on its own. While lists are queued, the players table refetches every 5 s, and the drawer reads the open player from that fresh data (by id), so it updates as the list arrives.
- **Menu counts include failed lists.** A menu item's count covers players whose list is `available` or `failed`, because the server queues both again. The spec counted `available` only.
- **App dependency.** `AppDeps` gains a required `listQueue: ListQueueWorker`. Test apps get one from `testListQueue(db)`, which is never started.
- **Syncing a never-synced event.** `SyncRunner` gains `ensureEventSynced(eventId)`, so the queue route can load an event's players before queueing without starting a tracked run.

## Global Constraints

Plans 1 and 2's Global Constraints still hold:

- Node 24, pnpm 12, TypeScript `~6.0.3`, Zod 4 APIs.
- Strict type-checked ESLint with `--max-warnings=0`; no `any`.
- Tests sit next to the code; no network and no real Postgres in tests.
- Mantine pinned to 9.6.2; dark-only minimal theme (`Panel`, cyan-only chrome accent, the `numeric` class on figures); no manual memoisation.
- Every API read is validated by shared schemas.
- Every data view has loading, empty and error states.
- State-changing routes use `requireJson`, except DELETE, which needs a preflight anyway. The Host guard stays.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

In addition:

- **Queue pace:** `LIST_QUEUE_INTERVAL_MS` defaults to **5000**, minimum 100. The worker never claims more than one row per tick and never overlaps ticks.
- **One rule:** "X-n or better" means `losses ≤ n`, with draws not counted as losses. Players with no games never qualify. The rule lives only in `qualifiesForMaxLosses` in `@bcp/shared`.
- **No bursts:** list fetches happen only in the worker. No route fetches a list itself.

## Review Focus

1. **A rejected BCP login mid-queue.** The worker must stop sending after the first 401, keep the row queued, and show "paused: login expired" in the header and Settings. Resume must refuse while BCP still rejects the login. _Task 2 (worker test) and Task 3 (resume route test)._
2. **Queueing the same list twice, or queueing while one is fetching.** No duplicate rows. A single "Fetch this list" bumps an already-queued normal row to priority 10. _Task 2 (repo test)._
3. **An API restart mid-fetch.** Rows left `fetching` go back to `queued` and aren't lost or stuck. _Task 2._
4. **A player whose list BCP replaced after it was stored.** They show as `available` (not `fetched`) and can be queued again. _Task 3 (players route test)._
5. **Players with no games, or events with 0–1 rounds.** Result filters must not include players with no games. The menu must not offer impossible filters (X-2 in a 2-round event). _Task 1 (rule test) and Task 5 (menu test)._

## File Map

```
packages/shared/src/lists.ts           (new) qualifiesForMaxLosses
packages/shared/src/api.ts             + QueueListsRequest/Result, ListQueueState, ListStatus (6), EventPlayer.listError,
                                         EventCounts.listsQueued/listsFailed, EventDetail.listQueueSeconds; EventSyncs − lists
packages/shared/src/sync.ts            SyncRequest − lists
apps/api/src/db/schema.ts               + listQueue table, listQueueStatus enum (+ migration 0002_list-queue)
apps/api/src/config.ts                  + LIST_QUEUE_INTERVAL_MS
apps/api/src/repo/list-queue.ts         (new) enqueue/claim/finish/retry/requeue/cancel/totals/order
apps/api/src/list-queue/worker.ts       (new) ListQueueWorker
apps/api/src/list-queue/queue-lists.ts  (new) queueEventLists (selection + enqueue + estimate)
apps/api/src/routes/list-queue.ts       (new) queue routes
apps/api/src/repo/participants.ts       listEventPlayers / countEventParticipants use the queue
apps/api/src/event-detail.ts            + listQueueSeconds
apps/api/src/sync/jobs.ts, runner.ts    − lists job; + ensureEventSynced
apps/api/src/app.ts, main.ts            wire the worker
apps/api/src/test/helpers.ts            + testListQueue, drainQueue
apps/web/src/lib/format.ts              + formatDuration
apps/web/src/features/list-queue/       (new) queries, QueueControls, QueueIndicator, ListQueueCard
apps/web/src/features/event/            FetchListsMenu (replaces FetchListsButton), EventQueueLine, ListStatusBadge,
                                         ListDrawer, PlayersPanel (record filter, live refresh), players-filter
apps/web/src/components/AppLayout.tsx   + QueueIndicator
apps/web/src/routes/settings.tsx        + ListQueueCard
e2e/finder-to-list.spec.ts, playwright.config.ts, README.md
```

---

### Task 1: The result rule and the additive shared schemas

**Files:**

- Create: `packages/shared/src/lists.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/api.ts`
- Test: `packages/shared/src/lists.test.ts`, `packages/shared/src/schemas.test.ts`

**Interfaces:**

- Produces:
  - `qualifiesForMaxLosses(player: { wins: number; losses: number; draws: number }, maxLosses: number): boolean`
  - `MAX_LOSSES_LIMIT = 20`
  - `QueueListsRequestSchema`/`QueueListsRequest` `{ maxLosses?: 0–20; playerIds?: string[] }` (at most one of the two)
  - `QueueListsResultSchema`/`QueueListsResult` `{ queued, alreadyQueued, alreadyFetched, noListOnBcp, notQualifying, estimatedSeconds }`
  - `ListQueuePauseReasonSchema` (`'user' | 'login-rejected' | 'rate-limited'`)
  - `ListQueueStateSchema`/`ListQueueState` `{ paused, pausedReason, pausedUntil, intervalMs, totals: { queued, fetching, failed }, estimatedSeconds }`
  - Only additive changes here. The breaking changes to `ListStatus`, `EventCounts`, `EventDetail`, `EventSyncs` and `SyncRequest` come in Task 3, together with their users.

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/lists.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { qualifiesForMaxLosses } from './lists';

const record = (wins: number, losses: number, draws: number) => ({ wins, losses, draws });

describe('qualifiesForMaxLosses', () => {
  it('counts only losses: draws are not losses', () => {
    expect(qualifiesForMaxLosses(record(3, 1, 1), 1)).toBe(true);
    expect(qualifiesForMaxLosses(record(0, 0, 5), 0)).toBe(true);
    expect(qualifiesForMaxLosses(record(3, 2, 0), 1)).toBe(false);
  });

  it('includes the boundary', () => {
    expect(qualifiesForMaxLosses(record(3, 2, 0), 2)).toBe(true);
    expect(qualifiesForMaxLosses(record(5, 0, 0), 0)).toBe(true);
  });

  it('never selects a player without recorded games', () => {
    expect(qualifiesForMaxLosses(record(0, 0, 0), 5)).toBe(false);
  });
});
```

Append to `packages/shared/src/schemas.test.ts` (and extend its import from `./index` with `QueueListsRequestSchema, ListQueueStateSchema`):

```ts
describe('QueueListsRequestSchema', () => {
  it('accepts nothing, a loss limit, or player ids, but not both', () => {
    expect(QueueListsRequestSchema.parse({})).toEqual({});
    expect(QueueListsRequestSchema.parse({ maxLosses: 1 })).toEqual({ maxLosses: 1 });
    expect(QueueListsRequestSchema.parse({ playerIds: ['P1'] })).toEqual({ playerIds: ['P1'] });
    expect(QueueListsRequestSchema.safeParse({ maxLosses: 1, playerIds: ['P1'] }).success).toBe(
      false,
    );
  });

  it('rejects loss limits outside 0–20 and empty id lists', () => {
    expect(QueueListsRequestSchema.safeParse({ maxLosses: -1 }).success).toBe(false);
    expect(QueueListsRequestSchema.safeParse({ maxLosses: 21 }).success).toBe(false);
    expect(QueueListsRequestSchema.safeParse({ maxLosses: 1.5 }).success).toBe(false);
    expect(QueueListsRequestSchema.safeParse({ playerIds: [] }).success).toBe(false);
  });
});

describe('ListQueueStateSchema', () => {
  it('parses a paused queue', () => {
    const state = {
      paused: true,
      pausedReason: 'login-rejected',
      pausedUntil: null,
      intervalMs: 5000,
      totals: { queued: 3, fetching: 0, failed: 1 },
      estimatedSeconds: 15,
    };
    expect(ListQueueStateSchema.parse(state)).toEqual(state);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm vitest run --project shared`
Expected: FAIL, because `./lists`, `QueueListsRequestSchema` and `ListQueueStateSchema` don't exist.

- [ ] **Step 3: Implement**

`packages/shared/src/lists.ts`:

```ts
/** The highest "X-n or better" a request may ask for. */
export const MAX_LOSSES_LIMIT = 20;

/**
 * "X-n or better": at most `maxLosses` losses. Draws are not losses (3-1-1 is X-1). A player
 * without recorded games has no result yet, so no result filter selects them.
 */
export function qualifiesForMaxLosses(
  player: { wins: number; losses: number; draws: number },
  maxLosses: number,
): boolean {
  const played = player.wins + player.losses + player.draws;
  return played > 0 && player.losses <= maxLosses;
}
```

Add `export * from './lists';` to `packages/shared/src/index.ts`.

Append to `packages/shared/src/api.ts` (add `import { MAX_LOSSES_LIMIT } from './lists';` at the top):

```ts
/** POST /api/events/:id/lists/queue: all missing lists, those passing a loss limit, or chosen players. */
export const QueueListsRequestSchema = z
  .object({
    maxLosses: z.number().int().min(0).max(MAX_LOSSES_LIMIT).optional(),
    playerIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
  })
  .refine((request) => request.maxLosses === undefined || request.playerIds === undefined, {
    message: 'Send `maxLosses` or `playerIds`, not both',
  });
export type QueueListsRequest = z.infer<typeof QueueListsRequestSchema>;

const count = z.number().int().nonnegative();

export const QueueListsResultSchema = z.object({
  queued: count,
  alreadyQueued: count,
  alreadyFetched: count,
  noListOnBcp: count,
  /** Players with a missing list who don't pass `maxLosses`. */
  notQualifying: count,
  /** Until this request's lists are fetched, at the current pace; null when nothing is queued. */
  estimatedSeconds: count.nullable(),
});
export type QueueListsResult = z.infer<typeof QueueListsResultSchema>;

export const ListQueuePauseReasonSchema = z.enum(['user', 'login-rejected', 'rate-limited']);
export type ListQueuePauseReason = z.infer<typeof ListQueuePauseReasonSchema>;

export const ListQueueStateSchema = z.object({
  paused: z.boolean(),
  pausedReason: ListQueuePauseReasonSchema.nullable(),
  /** Set when the pause lifts by itself (after a BCP rate limit). */
  pausedUntil: z.iso.datetime().nullable(),
  intervalMs: z.number().int().positive(),
  totals: z.object({ queued: count, fetching: count, failed: count }),
  /** Until the whole queue is empty, at the current pace; null when it is empty. */
  estimatedSeconds: count.nullable(),
});
export type ListQueueState = z.infer<typeof ListQueueStateSchema>;
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project shared`
Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(shared): result rule and list-queue schemas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The queue table, repository and worker

**Files:**

- Modify: `apps/api/src/db/schema.ts`, `apps/api/src/db/test-db.ts` (truncate the new table), `apps/api/src/config.ts`, `.env.example`
- Generated: `apps/api/drizzle/0002_list-queue.sql`, `apps/api/drizzle/meta/*`
- Create: `apps/api/src/repo/list-queue.ts`, `apps/api/src/list-queue/worker.ts`
- Modify: `apps/api/src/test/helpers.ts` (`testListQueue`, `drainQueue`)
- Test: `apps/api/src/repo/list-queue.test.ts`, `apps/api/src/list-queue/worker.test.ts`, `apps/api/src/config.test.ts`

**Interfaces:**

- Consumes: `TournamentSource.getList`, `saveArmyList`, `BcpAuthError`, `BcpRateLimitedError`, `AppError`, and the `ListQueueState`/`ListQueuePauseReason` types (Task 1).
- Produces:
  - Tables: `listQueue`, and the `listQueueStatus` enum (`'queued'|'fetching'|'done'|'failed'`)
  - Constants: `SINGLE_LIST_PRIORITY = 10`, `NO_LIST_CODE = 'NO_LIST'`
  - `enqueueLists(db, eventId, items: { playerId: string; listId: string }[], priority: number): Promise<number>`, which returns how many rows were newly queued
  - `claimNextList(db, now: Date): Promise<ClaimedList | null>`
  - `markListDone(db, id)`, `markListFailed(db, id, error, code)`, `retryListLater(db, id, notBefore, error)`, `releaseList(db, id)`
  - `requeueInterrupted(db): Promise<number>`, `cancelQueuedLists(db, eventId): Promise<number>`, `retryFailedLists(db, eventId?): Promise<number>`
  - `queueTotals(db): Promise<{ queued; fetching; failed }>`, `queuedInOrder(db): Promise<{ id: number; eventId: string; playerId: string }[]>`
  - `latestQueueRowsByPlayer(db, eventId): Promise<Map<string, { status; error: string | null }>>`
  - `new ListQueueWorker({ db, source, logger, intervalMs, now? })` with `start()`, `stop()`, `tick()`, `pause(reason?, until?)`, `resume()`, `state(): Promise<ListQueueState>`, `estimateSecondsFor(eventId?): Promise<number | null>`, `intervalMs`
  - `Config.LIST_QUEUE_INTERVAL_MS`
  - Test helpers: `testListQueue(db, source?)` and `drainQueue(worker)`, which ticks until the queue is idle

- [ ] **Step 1: Add the table, config and migration**

Append to `apps/api/src/db/schema.ts` (add `desc` to nothing: indexes use the `sql` helper already imported):

```ts
export const listQueueStatus = pgEnum('list_queue_status', [
  'queued',
  'fetching',
  'done',
  'failed',
]);

/** Army lists waiting to be fetched, one row per request; drained slowly by the ListQueueWorker. */
export const listQueue = pgTable(
  'list_queue',
  {
    id: serial('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** BCP list id when queued; the worker fetches exactly this list. */
    listId: text('list_id').notNull(),
    /** 0 = normal, 10 = a single list someone is waiting for. Higher is claimed first. */
    priority: integer('priority').notNull().default(0),
    status: listQueueStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    /** Not claimed before this time (backoff after a transient failure). */
    notBefore: timestamptz('not_before').notNull().defaultNow(),
    error: text('error'),
    /** An ApiErrorCode, or NO_LIST when BCP has no such list. */
    errorCode: text('error_code'),
    queuedAt: timestamptz('queued_at').notNull().defaultNow(),
    finishedAt: timestamptz('finished_at'),
  },
  (t) => [
    // At most one open request per player: queueing twice is a no-op.
    uniqueIndex('list_queue_one_open_idx')
      .on(t.playerId)
      .where(sql`${t.status} in ('queued', 'fetching')`),
    index('list_queue_claim_idx').on(t.status, t.priority, t.queuedAt),
    index('list_queue_event_idx').on(t.eventId, t.status),
  ],
);
```

In `apps/api/src/db/test-db.ts`, add `list_queue` to the `truncate` list in `resetDb`.

In `apps/api/src/config.ts`, add after `BCP_MAX_ATTEMPTS`:

```ts
  /** One army-list request every N ms. Keep it gentle: BCP has no public API. */
  LIST_QUEUE_INTERVAL_MS: z.coerce.number().int().min(100).default(5000),
```

In `.env.example`, after `BCP_MAX_ATTEMPTS`:

```bash
# One army-list request every N ms (background queue). Keep it gentle: BCP has no public API.
LIST_QUEUE_INTERVAL_MS=5000
```

Add to `apps/api/src/config.test.ts`, in the defaults test: `expect(config.LIST_QUEUE_INTERVAL_MS).toBe(5000);`

```bash
pnpm --filter @bcp/api db:generate --name list-queue
```

Expected: `apps/api/drizzle/0002_list-queue.sql` creates the `list_queue_status` type, the `list_queue` table, both foreign keys, the partial unique index and the two indexes.

- [ ] **Step 2: Write the failing repository tests** (Review Focus 2 and 3)

`apps/api/src/repo/list-queue.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { listQueue } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { sampleSource } from '../test/helpers';
import { upsertEventDetail } from './events';
import {
  cancelQueuedLists,
  claimNextList,
  enqueueLists,
  latestQueueRowsByPlayer,
  markListFailed,
  NO_LIST_CODE,
  queuedInOrder,
  queueTotals,
  requeueInterrupted,
  retryFailedLists,
  SINGLE_LIST_PRIORITY,
} from './list-queue';
import { upsertPlayers } from './participants';

const EVENT = 'EVTTEAM0001';
let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const source = sampleSource();
  await upsertEventDetail(db, await source.getEvent(EVENT));
  await upsertPlayers(db, await source.getPlayers(EVENT));
});

const ada = { playerId: 'PL-ADA', listId: 'LS-ADA' };
const ben = { playerId: 'PL-BEN', listId: 'LS-BEN' };
const cara = { playerId: 'PL-CARA', listId: 'LS-CARA' };
const soon = new Date(Date.now() + 1000);

describe('list queue repository', () => {
  it('queues each player at most once while open', async () => {
    expect(await enqueueLists(db, EVENT, [ada, ben], 0)).toBe(2);
    expect(await enqueueLists(db, EVENT, [ada, cara], 0)).toBe(1);
    expect(await queueTotals(db)).toEqual({ queued: 3, fetching: 0, failed: 0 });
  });

  it('claims higher priority first, then oldest, one row at a time', async () => {
    await enqueueLists(db, EVENT, [ada, ben], 0);
    await enqueueLists(db, EVENT, [cara], SINGLE_LIST_PRIORITY);

    const first = await claimNextList(db, soon);
    expect(first).toMatchObject({ playerId: 'PL-CARA', listId: 'LS-CARA', attempts: 1 });
    expect((await claimNextList(db, soon))?.playerId).toBe('PL-ADA');
    expect(await queueTotals(db)).toEqual({ queued: 1, fetching: 2, failed: 0 });
  });

  it('bumps an already-queued normal request when the same list is asked for directly', async () => {
    await enqueueLists(db, EVENT, [ada, ben], 0);
    expect(await enqueueLists(db, EVENT, [ben], SINGLE_LIST_PRIORITY)).toBe(0);
    expect((await claimNextList(db, soon))?.playerId).toBe('PL-BEN');
  });

  it('skips rows whose backoff has not passed', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    await db.update(listQueue).set({ notBefore: new Date(Date.now() + 60_000) });
    expect(await claimNextList(db, soon)).toBeNull();
  });

  it('puts rows cut off by a restart back in the queue', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    await claimNextList(db, soon);
    expect(await requeueInterrupted(db)).toBe(1);
    expect(await queueTotals(db)).toEqual({ queued: 1, fetching: 0, failed: 0 });
  });

  it('cancels an event’s queued rows and retries failed ones except "no list"', async () => {
    await enqueueLists(db, EVENT, [ada, ben, cara], 0);
    const claimed = await claimNextList(db, soon);
    if (!claimed) throw new Error('nothing claimed');
    await markListFailed(db, claimed.id, 'BCP hiccup', 'BCP_UNAVAILABLE');
    const second = await claimNextList(db, soon);
    if (!second) throw new Error('nothing claimed');
    await markListFailed(db, second.id, 'No list on BCP', NO_LIST_CODE);

    expect(await cancelQueuedLists(db, EVENT)).toBe(1);
    expect(await retryFailedLists(db, EVENT)).toBe(1);
    expect(await queueTotals(db)).toEqual({ queued: 1, fetching: 0, failed: 1 });
  });

  it('reports queue order and each player’s newest row', async () => {
    await enqueueLists(db, EVENT, [ada, ben], 0);
    expect((await queuedInOrder(db)).map((row) => row.playerId)).toEqual(['PL-ADA', 'PL-BEN']);
    const claimed = await claimNextList(db, soon);
    if (!claimed) throw new Error('nothing claimed');
    await markListFailed(db, claimed.id, 'BCP hiccup', 'BCP_UNAVAILABLE');

    const latest = await latestQueueRowsByPlayer(db, EVENT);
    expect(latest.get('PL-ADA')).toEqual({ status: 'failed', error: 'BCP hiccup' });
    expect(latest.get('PL-BEN')).toEqual({ status: 'queued', error: null });
    const [row] = await db.select().from(listQueue).where(eq(listQueue.playerId, 'PL-ADA'));
    expect(row?.finishedAt).toBeInstanceOf(Date);
  });
});
```

Run: `pnpm vitest run --project api src/repo/list-queue.test.ts`
Expected: FAIL, because `./list-queue` doesn't exist.

- [ ] **Step 3: Implement the repository**

`apps/api/src/repo/list-queue.ts`:

```ts
import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { listQueue } from '../db/schema';

/** Priority of a single list someone is waiting for; normal requests are 0. */
export const SINGLE_LIST_PRIORITY = 10;
/** `error_code` of a list BCP says doesn't exist; never retried. */
export const NO_LIST_CODE = 'NO_LIST';

export type ListQueueStatus = (typeof listQueue.$inferSelect)['status'];

export interface ClaimedList {
  id: number;
  eventId: string;
  playerId: string;
  listId: string;
  attempts: number;
}

/**
 * Queues lists; a player with an open request is skipped. At the single-list priority, open
 * requests of those players are raised too, so a list someone is waiting for jumps the queue.
 * Returns how many rows were newly queued.
 */
export async function enqueueLists(
  db: Db,
  eventId: string,
  items: { playerId: string; listId: string }[],
  priority: number,
): Promise<number> {
  if (items.length === 0) return 0;
  const inserted = await db
    .insert(listQueue)
    .values(items.map((item) => ({ eventId, ...item, priority })))
    .onConflictDoNothing()
    .returning({ id: listQueue.id });
  if (priority === SINGLE_LIST_PRIORITY) {
    await db
      .update(listQueue)
      .set({ priority })
      .where(
        and(
          inArray(
            listQueue.playerId,
            items.map((item) => item.playerId),
          ),
          eq(listQueue.status, 'queued'),
        ),
      );
  }
  return inserted.length;
}

/** Atomically takes the next due row (highest priority, then oldest) and marks it fetching. */
export async function claimNextList(db: Db, now: Date): Promise<ClaimedList | null> {
  const next = sql`(
    select ${listQueue.id} from ${listQueue}
    where ${listQueue.status} = 'queued' and ${listQueue.notBefore} <= ${now.toISOString()}::timestamptz
    order by ${listQueue.priority} desc, ${listQueue.queuedAt}, ${listQueue.id}
    limit 1
    for update skip locked
  )`;
  const [row] = await db
    .update(listQueue)
    .set({ status: 'fetching', attempts: sql`${listQueue.attempts} + 1` })
    .where(eq(listQueue.id, next))
    .returning({
      id: listQueue.id,
      eventId: listQueue.eventId,
      playerId: listQueue.playerId,
      listId: listQueue.listId,
      attempts: listQueue.attempts,
    });
  return row ?? null;
}

export async function markListDone(db: Db, id: number): Promise<void> {
  await db
    .update(listQueue)
    .set({ status: 'done', error: null, errorCode: null, finishedAt: new Date() })
    .where(eq(listQueue.id, id));
}

export async function markListFailed(
  db: Db,
  id: number,
  error: string,
  code: string,
): Promise<void> {
  await db
    .update(listQueue)
    .set({ status: 'failed', error, errorCode: code, finishedAt: new Date() })
    .where(eq(listQueue.id, id));
}

/** Back to the queue after a transient failure, not before `notBefore`. */
export async function retryListLater(
  db: Db,
  id: number,
  notBefore: Date,
  error: string,
): Promise<void> {
  await db
    .update(listQueue)
    .set({ status: 'queued', notBefore, error })
    .where(eq(listQueue.id, id));
}

/** Back to the queue without counting the attempt (the worker paused; the list wasn't at fault). */
export async function releaseList(db: Db, id: number): Promise<void> {
  await db
    .update(listQueue)
    .set({ status: 'queued', attempts: sql`greatest(${listQueue.attempts} - 1, 0)` })
    .where(eq(listQueue.id, id));
}

/** Rows left fetching by a process that stopped go back to the queue. */
export async function requeueInterrupted(db: Db): Promise<number> {
  const rows = await db
    .update(listQueue)
    .set({ status: 'queued' })
    .where(eq(listQueue.status, 'fetching'))
    .returning({ id: listQueue.id });
  return rows.length;
}

export async function cancelQueuedLists(db: Db, eventId: string): Promise<number> {
  const rows = await db
    .delete(listQueue)
    .where(and(eq(listQueue.eventId, eventId), eq(listQueue.status, 'queued')))
    .returning({ id: listQueue.id });
  return rows.length;
}

/** Failed rows (except "no list on BCP") go back to the queue with a fresh attempt count. */
export async function retryFailedLists(db: Db, eventId?: string): Promise<number> {
  const rows = await db
    .update(listQueue)
    .set({ status: 'queued', attempts: 0, notBefore: new Date(), error: null, errorCode: null })
    .where(
      and(
        eq(listQueue.status, 'failed'),
        ne(listQueue.errorCode, NO_LIST_CODE),
        eventId === undefined ? undefined : eq(listQueue.eventId, eventId),
      ),
    )
    .returning({ id: listQueue.id });
  return rows.length;
}

/**
 * The newest row per player. A player's queue state is their newest request; older failures
 * that were retried or superseded don't count.
 */
function newestRowPerPlayer(db: Db, eventId?: string) {
  return db
    .selectDistinctOn([listQueue.playerId], {
      playerId: listQueue.playerId,
      eventId: listQueue.eventId,
      status: listQueue.status,
      error: listQueue.error,
    })
    .from(listQueue)
    .where(eventId === undefined ? undefined : eq(listQueue.eventId, eventId))
    .orderBy(listQueue.playerId, desc(listQueue.id));
}

export async function queueTotals(
  db: Db,
): Promise<{ queued: number; fetching: number; failed: number }> {
  const open = await db
    .select({ status: listQueue.status, n: count() })
    .from(listQueue)
    .where(inArray(listQueue.status, ['queued', 'fetching']))
    .groupBy(listQueue.status);
  const newest = await newestRowPerPlayer(db);
  const of = (status: ListQueueStatus) => open.find((row) => row.status === status)?.n ?? 0;
  return {
    queued: of('queued'),
    fetching: of('fetching'),
    failed: newest.filter((row) => row.status === 'failed').length,
  };
}

/** Queued rows in the order the worker will claim them. */
export async function queuedInOrder(
  db: Db,
): Promise<{ id: number; eventId: string; playerId: string }[]> {
  return db
    .select({ id: listQueue.id, eventId: listQueue.eventId, playerId: listQueue.playerId })
    .from(listQueue)
    .where(eq(listQueue.status, 'queued'))
    .orderBy(desc(listQueue.priority), listQueue.queuedAt, listQueue.id);
}

export async function latestQueueRowsByPlayer(
  db: Db,
  eventId: string,
): Promise<Map<string, { status: ListQueueStatus; error: string | null }>> {
  const rows = await newestRowPerPlayer(db, eventId);
  return new Map(rows.map((row) => [row.playerId, { status: row.status, error: row.error }]));
}
```

Run: `pnpm vitest run --project api src/repo/list-queue.test.ts`
Expected: PASS. If `selectDistinctOn` or the `ne` on a nullable column behave differently in the installed drizzle, make the smallest change that keeps these tests' meaning, and record it. Note that `ne(errorCode, 'NO_LIST')` excludes NULL codes in SQL: use `or(isNull(errorCode), ne(errorCode, NO_LIST_CODE))` if failed rows can have a null code.

- [ ] **Step 4: Write the failing worker tests** (Review Focus 1)

`apps/api/src/list-queue/worker.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { BcpAuthError, BcpRateLimitedError, BcpUnavailableError } from '../errors';
import { upsertEventDetail } from '../repo/events';
import { claimNextList, enqueueLists, queueTotals, SINGLE_LIST_PRIORITY } from '../repo/list-queue';
import { findPlayerList } from '../repo/lists';
import { upsertPlayers } from '../repo/participants';
import { sampleSource, silentLogger } from '../test/helpers';
import { ListQueueWorker } from './worker';

const EVENT = 'EVTTEAM0001';
let db: Db;
let close: () => Promise<void>;
const source = sampleSource();

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await upsertEventDetail(db, await source.getEvent(EVENT));
  await upsertPlayers(db, await source.getPlayers(EVENT));
});

/** The sample source, with getList replaced. */
function withGetList(getList: BcpSource['getList']): BcpSource {
  // The worker only calls getList, so the other (private-field) methods are never reached.
  return Object.assign(Object.create(source) as BcpSource, { getList });
}

function worker(src: BcpSource = source, now = () => new Date()) {
  return new ListQueueWorker({ db, source: src, logger: silentLogger, intervalMs: 5000, now });
}

const ada = { playerId: 'PL-ADA', listId: 'LS-ADA' };
const ben = { playerId: 'PL-BEN', listId: 'LS-BEN' };

describe('ListQueueWorker', () => {
  it('fetches one list per tick, priority first, and stores it', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    await enqueueLists(db, EVENT, [ben], SINGLE_LIST_PRIORITY);
    const w = worker();

    expect(await w.tick()).toBe('fetched');
    expect(await findPlayerList(db, 'PL-BEN')).not.toBeNull();
    expect(await findPlayerList(db, 'PL-ADA')).toBeNull();
    expect(await w.tick()).toBe('fetched');
    expect(await w.tick()).toBe('idle');
  });

  it('marks a list BCP does not have as failed, without retrying', async () => {
    await enqueueLists(db, EVENT, [{ playerId: 'PL-HAL', listId: 'LS-NONE' }], 0);
    expect(await worker().tick()).toBe('failed');
    expect(await queueTotals(db)).toEqual({ queued: 0, fetching: 0, failed: 1 });
  });

  it('retries transient failures with backoff, then gives up after 3 attempts', async () => {
    let clock = new Date('2030-01-01T00:00:00Z');
    const failing = withGetList(() => Promise.reject(new BcpUnavailableError('BCP down')));
    const w = worker(failing, () => clock);
    await enqueueLists(db, EVENT, [ada], 0);

    // notBefore defaults to the real now, well before the fake 2030 clock.
    expect(await w.tick()).toBe('retry');
    expect(await w.tick()).toBe('idle'); // backoff: 1 minute
    clock = new Date(clock.getTime() + 61_000);
    expect(await w.tick()).toBe('retry');
    clock = new Date(clock.getTime() + 5 * 60_000 + 1000);
    expect(await w.tick()).toBe('failed');
    expect(await queueTotals(db)).toEqual({ queued: 0, fetching: 0, failed: 1 });
  });

  it('pauses on a rejected login, keeps the row queued, and sends nothing more', async () => {
    const getList = vi.fn(() => Promise.reject(new BcpAuthError('Session expired')));
    const w = worker(withGetList(getList));
    await enqueueLists(db, EVENT, [ada, ben], 0);

    expect(await w.tick()).toBe('paused');
    expect(await w.tick()).toBe('paused');
    expect(getList).toHaveBeenCalledTimes(1);
    expect(await queueTotals(db)).toEqual({ queued: 2, fetching: 0, failed: 0 });
    expect(await w.state()).toMatchObject({ paused: true, pausedReason: 'login-rejected' });

    w.resume();
    expect((await w.state()).paused).toBe(false);
  });

  it('pauses until a BCP rate limit has passed, then resumes by itself', async () => {
    let clock = new Date('2030-01-01T00:00:00Z');
    let limited = true;
    const src = withGetList((listId) =>
      limited ? Promise.reject(new BcpRateLimitedError(30)) : source.getList(listId),
    );
    const w = worker(src, () => clock);
    await enqueueLists(db, EVENT, [ada], 0);

    expect(await w.tick()).toBe('paused');
    expect(await w.state()).toMatchObject({
      pausedReason: 'rate-limited',
      pausedUntil: '2030-01-01T00:00:30.000Z',
    });
    limited = false;
    clock = new Date(clock.getTime() + 31_000);
    expect(await w.tick()).toBe('fetched');
  });

  it('skips a tick while the previous one is still running', async () => {
    let release: () => void = () => undefined;
    const slow = withGetList((listId) =>
      new Promise((resolve) => {
        release = () => {
          resolve(source.getList(listId));
        };
      }).then((list) => list as Awaited<ReturnType<BcpSource['getList']>>),
    );
    const w = worker(slow);
    await enqueueLists(db, EVENT, [ada, ben], 0);

    const first = w.tick();
    await vi.waitFor(() => {
      expect(release).not.toBe(undefined);
    });
    expect(await w.tick()).toBe('busy');
    release();
    expect(await first).toBe('fetched');
  });

  it('puts rows interrupted by a restart back in the queue on start', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    // A previous process claimed the row, then stopped before finishing it.
    await claimNextList(db, new Date(Date.now() + 1000));
    expect((await queueTotals(db)).fetching).toBe(1);

    const restarted = worker();
    await restarted.start();
    restarted.stop();
    expect(await queueTotals(db)).toMatchObject({ queued: 1, fetching: 0 });
  });

  it('estimates the time until a queue or an event’s lists are done', async () => {
    await enqueueLists(db, EVENT, [ada, ben], 0);
    const w = worker();
    expect(await w.estimateSecondsFor()).toBe(10);
    expect(await w.estimateSecondsFor(EVENT)).toBe(10);
    expect(await w.estimateSecondsFor('OTHER')).toBeNull();
  });
});
```

(In the "skips a tick" test, start `release` as `undefined` typed `(() => void) | undefined` if the lint rules object to the placeholder function. Keep what it asserts.)

Run: `pnpm vitest run --project api src/list-queue`
Expected: FAIL, because `./worker` doesn't exist.

- [ ] **Step 5: Implement the worker**

`apps/api/src/list-queue/worker.ts`:

```ts
import type { ListQueuePauseReason, ListQueueState } from '@bcp/shared';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { AppError, BcpAuthError, BcpRateLimitedError } from '../errors';
import type { Logger } from '../logger';
import {
  claimNextList,
  markListDone,
  markListFailed,
  NO_LIST_CODE,
  queuedInOrder,
  queueTotals,
  releaseList,
  requeueInterrupted,
  retryListLater,
} from '../repo/list-queue';
import { saveArmyList } from '../repo/lists';

/** Waits after the 1st and 2nd failed attempt; the 3rd failure is final. */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;
const MAX_ATTEMPTS = 3;

export type TickOutcome = 'idle' | 'busy' | 'paused' | 'fetched' | 'failed' | 'retry';

export interface ListQueueWorkerOptions {
  db: Db;
  source: TournamentSource;
  logger: Logger;
  intervalMs: number;
  now?: () => Date;
}

interface Pause {
  reason: ListQueuePauseReason;
  until: Date | null;
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Drains the list queue gently: every `intervalMs` it claims at most one list, fetches it through
 * the rate-limited BCP client and stores it. It pauses itself when BCP rejects the login (until
 * resumed) or rate-limits us (until the limit has passed).
 */
export class ListQueueWorker {
  readonly intervalMs: number;
  readonly #options: ListQueueWorkerOptions;
  readonly #now: () => Date;
  #timer: ReturnType<typeof setInterval> | null = null;
  #ticking = false;
  #pause: Pause | null = null;

  constructor(options: ListQueueWorkerOptions) {
    this.#options = options;
    this.intervalMs = options.intervalMs;
    this.#now = options.now ?? (() => new Date());
  }

  /** Puts rows cut off by a previous process back in the queue, then ticks every interval. */
  async start(): Promise<void> {
    const requeued = await requeueInterrupted(this.#options.db);
    if (requeued > 0) this.#options.logger.warn({ requeued }, 'Requeued interrupted list fetches');
    this.#timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  pause(reason: ListQueuePauseReason = 'user', until: Date | null = null): void {
    this.#pause = { reason, until };
  }

  resume(): void {
    this.#pause = null;
  }

  /** Claims and fetches at most one list. */
  async tick(): Promise<TickOutcome> {
    if (this.#ticking) return 'busy';
    if (this.#isPaused()) return 'paused';
    this.#ticking = true;
    try {
      return await this.#fetchNext();
    } finally {
      this.#ticking = false;
    }
  }

  async state(): Promise<ListQueueState> {
    const paused = this.#isPaused();
    return {
      paused,
      pausedReason: paused ? (this.#pause?.reason ?? null) : null,
      pausedUntil: paused ? (this.#pause?.until?.toISOString() ?? null) : null,
      intervalMs: this.intervalMs,
      totals: await queueTotals(this.#options.db),
      estimatedSeconds: await this.estimateSecondsFor(),
    };
  }

  /**
   * Seconds until the queue (or, given an event, that event's queued lists) is done at the
   * current pace; null when there is nothing queued.
   */
  async estimateSecondsFor(eventId?: string): Promise<number | null> {
    const order = await queuedInOrder(this.#options.db);
    const last =
      eventId === undefined
        ? order.length
        : order.findLastIndex((row) => row.eventId === eventId) + 1;
    if (last === 0) return null;
    return Math.ceil((last * this.intervalMs) / 1000);
  }

  #isPaused(): boolean {
    if (!this.#pause) return false;
    const { until } = this.#pause;
    if (until !== null && until <= this.#now()) {
      this.#pause = null;
      return false;
    }
    return true;
  }

  async #fetchNext(): Promise<TickOutcome> {
    const { db, source, logger } = this.#options;
    const claimed = await claimNextList(db, this.#now());
    if (!claimed) return 'idle';

    const startedAt = performance.now();
    const log = (status: TickOutcome) => {
      logger.info(
        {
          eventId: claimed.eventId,
          playerId: claimed.playerId,
          status,
          durationMs: Math.round(performance.now() - startedAt),
        },
        'List queue fetch',
      );
      return status;
    };

    try {
      const list = await source.getList(claimed.listId);
      if (list === null) {
        await markListFailed(db, claimed.id, 'No list on BCP', NO_LIST_CODE);
        return log('failed');
      }
      await saveArmyList(db, claimed.playerId, list);
      await markListDone(db, claimed.id);
      return log('fetched');
    } catch (error) {
      if (error instanceof BcpAuthError) {
        await releaseList(db, claimed.id);
        this.pause('login-rejected');
        logger.warn('List queue paused: BCP rejected the login');
        return 'paused';
      }
      if (error instanceof BcpRateLimitedError) {
        await releaseList(db, claimed.id);
        this.pause(
          'rate-limited',
          new Date(this.#now().getTime() + error.retryAfterSeconds * 1000),
        );
        return 'paused';
      }
      if (claimed.attempts < MAX_ATTEMPTS) {
        const wait = BACKOFF_MS[claimed.attempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
        await retryListLater(
          db,
          claimed.id,
          new Date(this.#now().getTime() + wait),
          describe(error),
        );
        return log('retry');
      }
      const code = error instanceof AppError ? error.code : 'INTERNAL';
      await markListFailed(db, claimed.id, describe(error), code);
      return log('failed');
    }
  }
}
```

(`findLastIndex` needs ES2023; the base tsconfig targets ES2024. `describe` shadows nothing in this file, but rename it to `messageOf` if the linter complains.)

Append to `apps/api/src/test/helpers.ts`:

```ts
import type { Db } from '../db/client';
import type { TournamentSource } from '../bcp/source';
import { ListQueueWorker } from '../list-queue/worker';

/** A worker for tests: never started, driven by tick() (or drainQueue). */
export function testListQueue(db: Db, source: TournamentSource = sampleSource()): ListQueueWorker {
  return new ListQueueWorker({ db, source, logger: silentLogger, intervalMs: 5000 });
}

/** Ticks until nothing is left to claim (or the worker pauses). */
export async function drainQueue(worker: ListQueueWorker): Promise<void> {
  for (let i = 0; i < 1000; i += 1) {
    const outcome = await worker.tick();
    if (outcome === 'idle' || outcome === 'paused') return;
  }
  throw new Error('Queue did not drain in 1000 ticks');
}
```

(Merge these imports with the file's existing imports; don't duplicate them.)

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run --project api`
Expected: PASS.

- [ ] **Step 7: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): persistent list queue with a gentle background worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Queue API; retire the `lists` sync; queue-aware players and counts

**Files:**

- Create: `apps/api/src/list-queue/queue-lists.ts`, `apps/api/src/routes/list-queue.ts`, `apps/api/src/routes/require-event.ts`
- Modify:
  - Shared: `packages/shared/src/api.ts`, `packages/shared/src/sync.ts`
  - API: `apps/api/src/repo/participants.ts`, `apps/api/src/repo/sync-runs.ts`, `apps/api/src/event-detail.ts`, `apps/api/src/routes/events.ts`, `apps/api/src/sync/jobs.ts`, `apps/api/src/sync/runner.ts`, `apps/api/src/app.ts`, `apps/api/src/main.ts`
  - Web (kept compiling and working): `apps/web/src/features/event/FetchListsButton.tsx` (+ test), `ListStatusBadge.tsx`, `event-queries.ts`, `PlayersPanel.tsx` (live refresh only), `apps/web/src/features/list-queue/list-queue-api.ts` (new, + test), `apps/web/src/test/sample-data.ts`, `apps/web/src/features/sync/use-sync.test.tsx`
  - Tests: `playwright.config.ts` (queue pace for e2e)
- Test: `apps/api/src/routes/list-queue.test.ts`, updates to `apps/api/src/routes/event-routes.test.ts`, `apps/api/src/sync/runner.test.ts`, `apps/api/src/app.test.ts`, `routes.test.ts`, `catalog.test.ts`, `packages/shared/src/schemas.test.ts`

**Interfaces:**

- Consumes: everything from Task 2; `QueueListsRequestSchema`/`QueueListsResultSchema`/`ListQueueState` (Task 1); `requireJson`, `parseInput`, `storedCurrentList`/`findPlayersMissingLists` (lists repo).
- Produces:
  - **Shared:**
    - `ListStatus = 'none' | 'available' | 'queued' | 'fetching' | 'fetched' | 'failed'`
    - `EventPlayer.listError: string | null`
    - `EventCounts.listsQueued` (open queue rows) and `EventCounts.listsFailed` (players whose newest request failed and whose list isn't stored)
    - `EventDetail.listQueueSeconds: number | null`
    - `EventSyncs` without `lists`, and `SyncRequest` without `lists`
  - **API:**
    - `queueEventLists({ db, runner, listQueue }, eventId, request): Promise<QueueListsResult>`
    - `SyncRunner.ensureEventSynced(eventId): Promise<EventRow>`
    - `requireEvent(db, id): Promise<EventRow>`
    - `AppDeps.listQueue: ListQueueWorker`
    - Routes (spec §6): `POST|DELETE /api/events/:id/lists/queue`, `GET /api/list-queue`, `POST /api/list-queue/pause|resume|retry-failed`
  - **Web:**
    - `queueLists(eventId, request): Promise<QueueListsResult>`
    - `describeQueueResult(result): string`, e.g. "Queued 7 lists · 1 has no list · about 35 s"
    - `eventQuery` and `playersQuery` now refetch every 5 s while lists are queued or fetching

- [ ] **Step 1: Change the shared contract**

In `packages/shared/src/sync.ts`, remove the `lists` member from `SyncRequestSchema`'s union. `SyncKindSchema` keeps `'lists'`, so old history rows still parse:

```ts
    z.object({ kind: z.literal('pairings'), eventId }),
  ])
```

In `packages/shared/src/api.ts`:

- `EventCountsSchema`: add

  ```ts
  /** Open queue requests (queued or fetching) for this event's players. */
  listsQueued: z.number().int().nonnegative(),
  /** Players whose newest list request failed and whose list isn't stored. */
  listsFailed: z.number().int().nonnegative(),
  ```

- `EventSyncsSchema`: remove `lists`, leaving `{ event, pairings }`.
- `EventDetailSchema`: add `/** Seconds until this event's queued lists are fetched; null when none are queued. */ listQueueSeconds: z.number().int().nonnegative().nullable(),`
- `ListStatusSchema`: `z.enum(['none', 'available', 'queued', 'fetching', 'fetched', 'failed'])`
- `EventPlayerSchema`: add `/** Why the newest list request failed (only when \`listStatus\` is failed). */ listError: z.string().nullable(),`

Update `packages/shared/src/schemas.test.ts` where it builds an `EventDetail`:

- `counts` gets `listsQueued: 0, listsFailed: 0`;
- `syncs` loses `lists`;
- add `listQueueSeconds: null`.

Add a test that `SyncRequestSchema.safeParse({ kind: 'lists', eventId: 'E1' }).success` is `false`. Replace the existing test that used `kind: 'lists'` as a valid event-scoped kind with `kind: 'pairings'`.

- [ ] **Step 2: Write the failing API tests** (Review Focus 1 and 4)

`apps/api/src/routes/list-queue.test.ts`:

```ts
import type {
  BcpStatus,
  EventDetail,
  EventPlayersResponse,
  ListQueueState,
  QueueListsResult,
} from '@bcp/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { players } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import type { ListQueueWorker } from '../list-queue/worker';
import { SyncRunner } from '../sync/runner';
import { drainQueue, sampleSource, silentLogger, testListQueue } from '../test/helpers';

const EVENT = 'EVTTEAM0001';
let db: Db;
let close: () => Promise<void>;
let status: BcpStatus;
let listQueue: ListQueueWorker;
let app: ReturnType<typeof createApp>;

function build(source: TournamentSource = sampleSource()) {
  listQueue = testListQueue(db, source);
  app = createApp({
    db,
    runner: new SyncRunner({ db, source, logger: silentLogger }),
    listQueue,
    bcpStatus: () => Promise.resolve(status),
    logger: silentLogger,
  });
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  status = {
    source: 'fixtures',
    state: 'fixtures',
    accessTokenExpiresAt: null,
    lastRefreshAt: null,
  };
  build();
});

const send = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async <T>(response: Response) => (await response.json()) as T;
const queue = async (body: object) =>
  json<QueueListsResult>(await send('POST', `/api/events/${EVENT}/lists/queue`, body));
const playersOf = async () =>
  (await json<EventPlayersResponse>(await app.request(`/api/events/${EVENT}/players`))).items;

describe('list queue routes', () => {
  it('queues every missing list, loading the event first; queueing again is a no-op', async () => {
    expect(await queue({})).toEqual({
      queued: 7,
      alreadyQueued: 0,
      alreadyFetched: 0,
      noListOnBcp: 1,
      notQualifying: 0,
      estimatedSeconds: 35,
    });
    expect(await queue({})).toMatchObject({ queued: 0, alreadyQueued: 7 });

    const detail = await json<EventDetail>(await app.request(`/api/events/${EVENT}`));
    expect(detail).toMatchObject({
      counts: { listsQueued: 7, listsFailed: 0 },
      listQueueSeconds: 35,
    });
    expect((await playersOf()).find((p) => p.bcpId === 'PL-ADA')).toMatchObject({
      listStatus: 'queued',
      listError: null,
    });
  });

  it('queues only players within a loss limit (draws are not losses)', async () => {
    // Round results: Finn 2-0-0, Ada 2-0-0, Dan 0-0-2 qualify for X-0; Cara, Gia, Ben, Eve don't.
    expect(await queue({ maxLosses: 0 })).toMatchObject({ queued: 3, notQualifying: 4 });
    expect(await queue({ maxLosses: 1 })).toMatchObject({ queued: 3, alreadyQueued: 3 });
  });

  it('queues a single list ahead of the rest, and it arrives when the worker runs', async () => {
    await queue({});
    expect(await queue({ playerIds: ['PL-EVE'] })).toMatchObject({ queued: 0, alreadyQueued: 1 });
    await listQueue.tick();
    expect((await playersOf()).find((p) => p.bcpId === 'PL-EVE')?.listStatus).toBe('fetched');
  });

  it('validates the request', async () => {
    expect(
      (await send('POST', `/api/events/${EVENT}/lists/queue`, { playerIds: ['NOPE'] })).status,
    ).toBe(400);
    expect(
      (
        await send('POST', `/api/events/${EVENT}/lists/queue`, {
          maxLosses: 1,
          playerIds: ['PL-ADA'],
        })
      ).status,
    ).toBe(400);
    expect((await send('POST', '/api/events/NOPE/lists/queue', {})).status).toBe(404);
    expect((await send('POST', '/api/sync', { kind: 'lists', eventId: EVENT })).status).toBe(400);
  });

  it('shows a list BCP replaced after it was stored as available again', async () => {
    await queue({ playerIds: ['PL-ADA'] });
    await drainQueue(listQueue);
    await db.update(players).set({ listId: 'LS-ADA-2' }).where(eq(players.id, 'PL-ADA'));

    expect((await playersOf()).find((p) => p.bcpId === 'PL-ADA')?.listStatus).toBe('available');
    const detail = await json<EventDetail>(await app.request(`/api/events/${EVENT}`));
    expect(detail.counts.listsMissing).toBe(7);
  });

  it('shows why a list failed, and retries failed lists on request', async () => {
    const source = sampleSource();
    // Everything as the fixtures, except Eve's list is gone from BCP.
    const noEveList: TournamentSource = {
      listEvents: (range, cursor) => source.listEvents(range, cursor),
      getEvent: (id) => source.getEvent(id),
      getPlayers: (id) => source.getPlayers(id),
      getTeams: (id) => source.getTeams(id),
      getTeamMatchups: (id, round) => source.getTeamMatchups(id, round),
      getGames: (id, round) => source.getGames(id, round),
      getList: (listId) => (listId === 'LS-EVE' ? Promise.resolve(null) : source.getList(listId)),
    };
    build(noEveList);
    await queue({ playerIds: ['PL-EVE'] });
    await drainQueue(listQueue);

    expect((await playersOf()).find((p) => p.bcpId === 'PL-EVE')).toMatchObject({
      listStatus: 'failed',
      listError: 'No list on BCP',
    });
    expect(
      (await json<EventDetail>(await app.request(`/api/events/${EVENT}`))).counts.listsFailed,
    ).toBe(1);
    // "No list on BCP" is final: retry-failed leaves it alone.
    expect(
      await json(await send('POST', '/api/list-queue/retry-failed', { eventId: EVENT })),
    ).toEqual({
      requeued: 0,
    });
  });

  it('cancels an event’s queued lists', async () => {
    await queue({});
    expect(await json(await send('DELETE', `/api/events/${EVENT}/lists/queue`))).toEqual({
      removed: 7,
    });
    expect((await json<ListQueueState>(await app.request('/api/list-queue'))).totals.queued).toBe(
      0,
    );
  });

  it('pauses and resumes, but refuses to resume while BCP rejects the login', async () => {
    expect(
      await json<ListQueueState>(await send('POST', '/api/list-queue/pause', {})),
    ).toMatchObject({
      paused: true,
      pausedReason: 'user',
    });
    expect(
      (await json<ListQueueState>(await send('POST', '/api/list-queue/resume', {}))).paused,
    ).toBe(false);

    listQueue.pause('login-rejected');
    status = { ...status, source: 'bcp', state: 'rejected' };
    const refused = await send('POST', '/api/list-queue/resume', {});
    expect(refused.status).toBe(502);
    expect(await refused.json()).toMatchObject({ error: { code: 'BCP_AUTH' } });

    status = { ...status, state: 'connected' };
    expect(
      (await json<ListQueueState>(await send('POST', '/api/list-queue/resume', {}))).paused,
    ).toBe(false);
  });
});
```

(If `TournamentSource` gains methods before this runs, delegate those too; the compiler will say so.)

Run: `pnpm vitest run --project api src/routes/list-queue.test.ts`
Expected: FAIL. The routes don't exist and `createApp` takes no `listQueue`.

- [ ] **Step 3: Make players and counts queue-aware**

In `apps/api/src/repo/participants.ts`:

- Import `storedCurrentList` and `findPlayersMissingLists` from `./lists`, and `latestQueueRowsByPlayer`/`type ListQueueStatus` from `./list-queue`.
- Replace `listStatusOf` and `listEventPlayers` with:

```ts
interface QueueRow {
  status: ListQueueStatus;
  error: string | null;
}

/** A stored current list wins; otherwise the player's newest queue request; otherwise BCP's list id. */
function listStateOf(
  bcpListId: string | null,
  storedListId: string | null,
  queued: QueueRow | undefined,
): Pick<EventPlayer, 'listStatus' | 'listError'> {
  if (storedListId !== null) return { listStatus: 'fetched', listError: null };
  if (queued?.status === 'queued' || queued?.status === 'fetching') {
    return { listStatus: queued.status, listError: null };
  }
  if (queued?.status === 'failed') return { listStatus: 'failed', listError: queued.error };
  return { listStatus: bcpListId === null ? 'none' : 'available', listError: null };
}

/** An event's players, best placing first (unplaced last, by name), with team and list state. */
export async function listEventPlayers(db: Db, eventId: string): Promise<EventPlayer[]> {
  const [rows, queue] = await Promise.all([
    db
      .select({ player: players, teamName: teams.name, storedListId: armyLists.listId })
      .from(players)
      .leftJoin(teams, eq(teams.id, players.teamId))
      // Only the player's current BCP list counts: one BCP replaced since is "available" again.
      .leftJoin(armyLists, storedCurrentList)
      .where(eq(players.eventId, eventId))
      .orderBy(sql`${players.placing} asc nulls last`, players.name),
    latestQueueRowsByPlayer(db, eventId),
  ]);
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
    ...listStateOf(player.listId, storedListId, queue.get(player.id)),
  }));
}
```

In `countEventParticipants`:

- Also load `latestQueueRowsByPlayer(db, eventId)` and `findPlayersMissingLists(db, eventId)` in its `Promise.all`.
- Return, in addition:

```ts
    listsQueued: [...queue.values()].filter((row) => row.status === 'queued' || row.status === 'fetching').length,
    listsFailed: [...queue.entries()].filter(
      ([playerId, row]) => row.status === 'failed' && missing.some((m) => m.playerId === playerId),
    ).length,
```

In `apps/api/src/repo/sync-runs.ts`, `latestEventSyncRuns` returns `{ event: latest('event'), pairings: latest('pairings') }`.

- [ ] **Step 4: Retire the `lists` job and add `ensureEventSynced`**

In `apps/api/src/sync/jobs.ts`:

- Delete `syncLists`, its `case 'lists'`, and any imports that become unused (`findPlayersMissingLists`, `saveArmyList`, and the error classes if unused).
- Change `syncEvent` and `ensureEventSynced` to take `deps: Pick<JobContext, 'db' | 'source'>` instead of the whole `ctx`, and export `ensureEventSynced`:

```ts
/** Pairings and lists need players in the database; fetch them once if we never have. */
export async function ensureEventSynced(
  deps: Pick<JobContext, 'db' | 'source'>,
  eventId: string,
): Promise<EventRow> {
  const existing = await findEvent(deps.db, eventId);
  return existing?.lastSyncedAt ? existing : syncEvent(deps, eventId);
}
```

(Inside `syncEvent`, use `deps.db` and `deps.source` where it used `ctx.db` and `ctx.source`. `syncEventJob` and `syncPairings` pass `ctx`, which satisfies the `Pick`.)

In `apps/api/src/sync/runner.ts`, add:

```ts
  /** Loads the event's detail, teams and players now if it was never synced (no tracked run). */
  ensureEventSynced(eventId: string): Promise<EventRow> {
    return ensureEventSynced(this.#deps, eventId);
  }
```

(Import `ensureEventSynced` from `./jobs`, and `type EventRow` from `../repo/events`.)

In `apps/api/src/sync/runner.test.ts`, delete the three `lists` tests. Their behaviour now lives in the worker and route tests.

- [ ] **Step 5: The queue service, routes and wiring**

`apps/api/src/routes/require-event.ts`:

```ts
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { findEvent, type EventRow } from '../repo/events';

export async function requireEvent(db: Db, id: string): Promise<EventRow> {
  const row = await findEvent(db, id);
  if (!row) throw new NotFoundError(`Event ${id} is not in the local catalogue`);
  return row;
}
```

In `apps/api/src/routes/events.ts`, replace the local `requireEvent` closure with this helper (`requireEvent(deps.db, id)`).

`apps/api/src/list-queue/queue-lists.ts`:

```ts
import { qualifiesForMaxLosses, type QueueListsRequest, type QueueListsResult } from '@bcp/shared';
import type { Db } from '../db/client';
import { ValidationError } from '../errors';
import { enqueueLists, SINGLE_LIST_PRIORITY } from '../repo/list-queue';
import { findPlayersMissingLists } from '../repo/lists';
import { listEventPlayers } from '../repo/participants';
import type { SyncRunner } from '../sync/runner';
import type { ListQueueWorker } from './worker';

export interface QueueListsDeps {
  db: Db;
  runner: SyncRunner;
  listQueue: ListQueueWorker;
}

/**
 * Queues an event's missing lists: all of them, those within a loss limit, or chosen players
 * (who jump the queue). Never fetches anything itself; the worker does, gently.
 */
export async function queueEventLists(
  deps: QueueListsDeps,
  eventId: string,
  request: QueueListsRequest,
): Promise<QueueListsResult> {
  const { db } = deps;
  await deps.runner.ensureEventSynced(eventId);
  const everyone = await listEventPlayers(db, eventId);
  const missing = new Map(
    (await findPlayersMissingLists(db, eventId)).map(({ playerId, listId }) => [playerId, listId]),
  );

  let selected = everyone;
  if (request.playerIds) {
    const known = new Set(everyone.map((player) => player.bcpId));
    const unknown = request.playerIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new ValidationError([
        { path: 'playerIds', message: `Not players of this event: ${unknown.join(', ')}` },
      ]);
    }
    const wanted = new Set(request.playerIds);
    selected = everyone.filter((player) => wanted.has(player.bcpId));
  }

  let notQualifying = 0;
  const { maxLosses } = request;
  if (maxLosses !== undefined) {
    notQualifying = everyone.filter(
      (player) => missing.has(player.bcpId) && !qualifiesForMaxLosses(player, maxLosses),
    ).length;
    selected = selected.filter((player) => qualifiesForMaxLosses(player, maxLosses));
  }

  const priority = request.playerIds ? SINGLE_LIST_PRIORITY : 0;
  const counts = { alreadyQueued: 0, alreadyFetched: 0, noListOnBcp: 0 };
  const toQueue: { playerId: string; listId: string }[] = [];
  for (const player of selected) {
    const open = player.listStatus === 'queued' || player.listStatus === 'fetching';
    const listId = missing.get(player.bcpId);
    if (open) counts.alreadyQueued += 1;
    if (listId === undefined) {
      if (player.listStatus === 'none') counts.noListOnBcp += 1;
      else if (!open) counts.alreadyFetched += 1;
      continue;
    }
    // A chosen player already in the queue is "queued" again at single priority: it jumps ahead.
    if (!open || priority === SINGLE_LIST_PRIORITY)
      toQueue.push({ playerId: player.bcpId, listId });
  }

  const queued = await enqueueLists(db, eventId, toQueue, priority);
  return {
    queued,
    ...counts,
    notQualifying,
    estimatedSeconds: await deps.listQueue.estimateSecondsFor(eventId),
  };
}
```

`apps/api/src/routes/list-queue.ts`:

```ts
import { QueueListsRequestSchema, type BcpStatus } from '@bcp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { BcpAuthError } from '../errors';
import { queueEventLists } from '../list-queue/queue-lists';
import type { ListQueueWorker } from '../list-queue/worker';
import { cancelQueuedLists, retryFailedLists } from '../repo/list-queue';
import type { SyncRunner } from '../sync/runner';
import { parseInput } from '../validation';
import { requireEvent } from './require-event';
import { requireJson } from './require-json';

const RetryFailedSchema = z.object({ eventId: z.string().min(1).optional() });

export function listQueueRoutes(deps: {
  db: Db;
  runner: SyncRunner;
  listQueue: ListQueueWorker;
  bcpStatus: () => Promise<BcpStatus>;
}) {
  const { db, listQueue } = deps;
  return (
    new Hono()
      .post('/events/:id/lists/queue', requireJson, async (c) => {
        const id = c.req.param('id');
        await requireEvent(db, id);
        const request = parseInput(
          QueueListsRequestSchema,
          await c.req.json<unknown>().catch(() => null),
        );
        return c.json(await queueEventLists(deps, id, request));
      })
      // DELETE can't be sent cross-origin without a preflight, so it needs no JSON body.
      .delete('/events/:id/lists/queue', async (c) => {
        const id = c.req.param('id');
        await requireEvent(db, id);
        return c.json({ removed: await cancelQueuedLists(db, id) });
      })
      .post('/list-queue/retry-failed', requireJson, async (c) => {
        const { eventId } = parseInput(
          RetryFailedSchema,
          await c.req.json<unknown>().catch(() => null),
        );
        return c.json({ requeued: await retryFailedLists(db, eventId) });
      })
      .get('/list-queue', async (c) => c.json(await listQueue.state()))
      .post('/list-queue/pause', requireJson, async (c) => {
        listQueue.pause('user');
        return c.json(await listQueue.state());
      })
      .post('/list-queue/resume', requireJson, async (c) => {
        if ((await listQueue.state()).pausedReason === 'login-rejected') {
          const { state } = await deps.bcpStatus();
          if (state === 'rejected' || state === 'missing') {
            throw new BcpAuthError(
              'BCP still rejects the login. Put a fresh BCP_REFRESH_TOKEN in .env, restart the API, then resume.',
            );
          }
        }
        listQueue.resume();
        return c.json(await listQueue.state());
      })
  );
}
```

In `apps/api/src/event-detail.ts`:

- Change `getEventDetail` to take `deps: { db: Db; listQueue: ListQueueWorker }` in place of `db`.
- Add `listQueueSeconds: await deps.listQueue.estimateSecondsFor(eventId)` to the result.
- `routes/events.ts` passes `deps` (its deps type gains `listQueue`).

In `apps/api/src/app.ts`, add `listQueue: ListQueueWorker;` to `AppDeps` (with the import) and mount the routes: `app.route('/api', listQueueRoutes(deps));`.

In `apps/api/src/main.ts`, after `const runner = …`:

```ts
const listQueue = new ListQueueWorker({
  db: database.db,
  source,
  logger: logger.child({ module: 'list-queue' }),
  intervalMs: config.LIST_QUEUE_INTERVAL_MS,
});
await listQueue.start();
```

Also:

- pass `listQueue` to `createApp`;
- call `listQueue.stop();` first thing in `shutdown`.

Update every other `createApp({ … })` call in the tests (`app.test.ts`, `routes/routes.test.ts`, `routes/catalog.test.ts`, `routes/event-routes.test.ts`) to add `listQueue: testListQueue(db)`.

In `routes/event-routes.test.ts`:

- Replace each `await sync({ kind: 'lists', eventId: EVENT })` with a helper that POSTs `{}` to `/api/events/${EVENT}/lists/queue` and then `await drainQueue(listQueue)`.
- Keep the assertions; the one on `syncs.lists` goes, and `counts` now also holds `listsQueued: 0, listsFailed: 0`.

- [ ] **Step 6: Keep the web app compiling and working**

`apps/web/src/features/list-queue/list-queue-api.ts`:

```ts
import { QueueListsResultSchema, type QueueListsRequest, type QueueListsResult } from '@bcp/shared';
import { apiPost } from '../../api/client';
import { formatDuration } from '../../lib/format';

export function queueLists(eventId: string, request: QueueListsRequest): Promise<QueueListsResult> {
  return apiPost(
    `/api/events/${encodeURIComponent(eventId)}/lists/queue`,
    request,
    QueueListsResultSchema,
  );
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** One line for a notification, e.g. "Queued 7 lists · 1 has no list · about 35 s". */
export function describeQueueResult(result: QueueListsResult): string {
  const parts = [`Queued ${result.queued} ${plural(result.queued, 'list', 'lists')}`];
  if (result.alreadyQueued > 0) parts.push(`${result.alreadyQueued} already queued`);
  if (result.alreadyFetched > 0) parts.push(`${result.alreadyFetched} already fetched`);
  if (result.noListOnBcp > 0) {
    parts.push(`${result.noListOnBcp} ${plural(result.noListOnBcp, 'has', 'have')} no list`);
  }
  if (result.estimatedSeconds !== null)
    parts.push(`about ${formatDuration(result.estimatedSeconds)}`);
  return parts.join(' · ');
}
```

Add to `apps/web/src/lib/format.ts`:

```ts
/** "35 s", "8 min", "1 h 20 min": a rough wait, for estimates. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
```

`apps/web/src/features/list-queue/list-queue-api.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDuration } from '../../lib/format';
import { describeQueueResult } from './list-queue-api';

const result = {
  queued: 7,
  alreadyQueued: 0,
  alreadyFetched: 2,
  noListOnBcp: 1,
  notQualifying: 0,
  estimatedSeconds: 35,
};

describe('describeQueueResult', () => {
  it('summarises what happened', () => {
    expect(describeQueueResult(result)).toBe(
      'Queued 7 lists · 2 already fetched · 1 has no list · about 35 s',
    );
    expect(
      describeQueueResult({
        ...result,
        queued: 1,
        alreadyFetched: 0,
        noListOnBcp: 0,
        estimatedSeconds: null,
      }),
    ).toBe('Queued 1 list');
  });
});

describe('formatDuration', () => {
  it('rounds to a readable wait', () => {
    expect(formatDuration(4)).toBe('4 s');
    expect(formatDuration(500)).toBe('8 min');
    expect(formatDuration(4800)).toBe('1 h 20 min');
  });
});
```

In `apps/web/src/features/event/event-queries.ts`, add these `refetchInterval`s so progress shows up by itself. Each query stops polling once its own data says nothing is pending:

```ts
// eventQuery:
    refetchInterval: (query) => ((query.state.data?.counts.listsQueued ?? 0) > 0 ? 5000 : false),
// playersQuery:
    refetchInterval: (query) =>
      query.state.data?.items.some((p) => p.listStatus === 'queued' || p.listStatus === 'fetching')
        ? 5000
        : false,
```

Replace `apps/web/src/features/event/ListStatusBadge.tsx` with the six statuses (Task 5 adds the tooltip):

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
    case 'queued':
      return (
        <Badge size="sm" variant="outline">
          Queued
        </Badge>
      );
    case 'fetching':
      return (
        <Badge size="sm" variant="outline">
          Fetching
        </Badge>
      );
    case 'failed':
      return (
        <Badge size="sm" variant="outline" color="red">
          Failed
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

Replace `apps/web/src/features/event/FetchListsButton.tsx`. It stays in use until Task 5 replaces it with the menu:

```tsx
import type { EventCounts, EventDetail } from '@bcp/shared';
import { Button, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { describeQueueResult, queueLists } from '../list-queue/list-queue-api';

function buttonLabel(counts: EventCounts): string {
  if (counts.listsAvailable === 0) return 'No lists on BCP';
  if (counts.listsMissing === 0) return 'All lists fetched';
  const waiting = counts.listsMissing - counts.listsQueued;
  return waiting > 0 ? `Fetch all lists (${waiting} missing)` : 'All lists queued';
}

export function FetchListsButton({ event }: { event: EventDetail }) {
  const queryClient = useQueryClient();
  const queue = useMutation({
    mutationFn: () => queueLists(event.bcpId, {}),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['event', event.bcpId] });
      notifications.show({
        color: 'neon',
        title: 'Army lists',
        message: describeQueueResult(result),
      });
    },
    onError: (error) => {
      notifications.show({ color: 'red', title: 'Army lists', message: error.message });
    },
  });
  const waiting = event.counts.listsMissing - event.counts.listsQueued;
  return (
    <Stack gap={4} align="flex-end" maw={360}>
      <Button
        size="sm"
        loading={queue.isPending}
        disabled={waiting <= 0}
        onClick={() => {
          queue.mutate();
        }}
      >
        {buttonLabel(event.counts)}
      </Button>
      {event.hideLists && (
        <Text size="xs" c="yellow" ta="right">
          BCP marks this event's lists as hidden, so some may be unavailable.
        </Text>
      )}
    </Stack>
  );
}
```

Update:

- `apps/web/src/features/event/FetchListsButton.test.tsx`: posting goes to `/api/events/EVT1/lists/queue` with body `{}`. Drop the tests about `syncs.lists` runs. Keep the hidden-lists test, the label tests, and a "shows the queue result in a notification" check if convenient.
- `apps/web/src/test/sample-data.ts`: `anEventDetail` counts get `listsQueued: 0, listsFailed: 0`, `syncs` loses `lists`, and `listQueueSeconds: null` is added. `aPlayer` gets `listError: null`.
- `apps/web/src/features/sync/use-sync.test.tsx`: use `{ kind: 'event', eventId: 'EVT1' }` where it used `'lists'`.
- Fix anything else the compiler reports: grep for `syncs.lists` and `kind: 'lists'`.

In `playwright.config.ts`, add `LIST_QUEUE_INTERVAL_MS: '200'` to the API `webServer` env. The existing e2e flow ("Fetch all lists (7 missing)" → "All lists fetched") keeps working through the queue: the event page refetches every 5 s while lists are queued.

- [ ] **Step 7: Run everything**

Run: `pnpm check`
Expected: PASS.

Run: `pnpm e2e`
Expected: 1 passed.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: queue list fetches through the background worker; retire the lists sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Web: queue status in the header and in Settings

**Files:**

- Create: `apps/web/src/features/list-queue/list-queue-queries.ts`, `QueueControls.tsx`, `QueueIndicator.tsx`, `ListQueueCard.tsx`
- Modify: `apps/web/src/components/AppLayout.tsx`, `AppLayout.module.css`, `apps/web/src/routes/settings.tsx`
- Test: `apps/web/src/features/list-queue/QueueIndicator.test.tsx`, `QueueControls.test.tsx`

**Interfaces:**

- Consumes: `ListQueueStateSchema` (Task 1); `apiGet`/`apiPost`, `ApiError`, `Panel`, `ErrorState`, `formatDuration`, `formatDateTime`.
- Produces:
  - `listQueueQuery` (key `['list-queue']`; polls every 5 s while there's work, else every 30 s)
  - `pauseQueue()`, `resumeQueue()`, `retryFailed(eventId?)`, `cancelQueued(eventId)`
  - `<QueueControls state />`, `<QueueIndicator />`, `<ListQueueCard />`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/list-queue/QueueIndicator.test.tsx`:

```tsx
import type { ListQueueState } from '@bcp/shared';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { QueueIndicator } from './QueueIndicator';

const state = (changes: Partial<ListQueueState> = {}): ListQueueState => ({
  paused: false,
  pausedReason: null,
  pausedUntil: null,
  intervalMs: 5000,
  totals: { queued: 0, fetching: 0, failed: 0 },
  estimatedSeconds: null,
  ...changes,
});

/** QueueIndicator links to Settings, so it needs a router around it. */
function renderInRouter() {
  const root = createRootRoute({ component: QueueIndicator });
  const router = createRouter({ routeTree: root, history: createMemoryHistory() });
  return renderWithProviders(<RouterProvider router={router} />);
}

describe('QueueIndicator', () => {
  it('is hidden when the queue is empty', async () => {
    const fetchMock = stubFetchRoutes({ 'GET /api/list-queue': state() });
    renderInRouter();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: /Lists/ })).toBeNull();
  });

  it('shows how many lists are queued and roughly how long they take', async () => {
    stubFetchRoutes({
      'GET /api/list-queue': state({
        totals: { queued: 34, fetching: 1, failed: 0 },
        estimatedSeconds: 175,
      }),
    });
    renderInRouter();
    expect(
      await screen.findByRole('button', { name: /Lists · 35 queued · ~3 min/ }),
    ).toBeInTheDocument();
  });

  it('turns red with a Settings link when BCP rejected the login', async () => {
    stubFetchRoutes({
      'GET /api/list-queue': state({
        paused: true,
        pausedReason: 'login-rejected',
        totals: { queued: 5, fetching: 0, failed: 0 },
      }),
    });
    renderInRouter();
    expect(
      await screen.findByRole('button', { name: /Lists paused: login expired/ }),
    ).toBeInTheDocument();
  });
});
```

`apps/web/src/features/list-queue/QueueControls.test.tsx`:

```tsx
import type { ListQueueState } from '@bcp/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { QueueControls } from './QueueControls';

const base: ListQueueState = {
  paused: false,
  pausedReason: null,
  pausedUntil: null,
  intervalMs: 5000,
  totals: { queued: 3, fetching: 1, failed: 2 },
  estimatedSeconds: 20,
};

describe('QueueControls', () => {
  it('shows the totals and pauses the queue', async () => {
    const fetchMock = stubFetchRoutes({
      'POST /api/list-queue/pause': { ...base, paused: true, pausedReason: 'user' },
    });
    renderWithProviders(<QueueControls state={base} />);
    expect(screen.getByText(/4 in progress/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/list-queue/pause')).toBe(true);
    });
  });

  it('shows why resuming failed', async () => {
    stubFetchRoutes({
      'POST /api/list-queue/resume': () =>
        Response.json(
          { error: { code: 'BCP_AUTH', message: 'BCP still rejects the login.' } },
          { status: 502 },
        ),
    });
    renderWithProviders(
      <QueueControls state={{ ...base, paused: true, pausedReason: 'login-rejected' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(await screen.findByText('BCP still rejects the login.')).toBeInTheDocument();
  });

  it('retries all failed lists', async () => {
    const fetchMock = stubFetchRoutes({ 'POST /api/list-queue/retry-failed': { requeued: 2 } });
    renderWithProviders(<QueueControls state={base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry 2 failed' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/list-queue/retry-failed')).toBe(
        true,
      );
    });
  });
});
```

Run: `pnpm vitest run --project web src/features/list-queue`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 2: Implement**

`apps/web/src/features/list-queue/list-queue-queries.ts`:

```ts
import { ListQueueStateSchema, type ListQueueState } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiGet, apiPost } from '../../api/client';

const hasWork = (state: ListQueueState | undefined) =>
  state !== undefined && (state.totals.queued > 0 || state.totals.fetching > 0);

/** Polls quickly while lists are being fetched, and rarely otherwise (another tab may queue some). */
export const listQueueQuery = queryOptions({
  queryKey: ['list-queue'],
  queryFn: () => apiGet('/api/list-queue', ListQueueStateSchema),
  refetchInterval: (query) => (hasWork(query.state.data) ? 5000 : 30_000),
});

export const pauseQueue = () => apiPost('/api/list-queue/pause', {}, ListQueueStateSchema);
export const resumeQueue = () => apiPost('/api/list-queue/resume', {}, ListQueueStateSchema);

export const retryFailed = (eventId?: string) =>
  apiPost(
    '/api/list-queue/retry-failed',
    eventId === undefined ? {} : { eventId },
    z.object({ requeued: z.number().int() }),
  );

export async function cancelQueued(eventId: string): Promise<{ removed: number }> {
  const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/lists/queue`, {
    method: 'DELETE',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Could not cancel the queued lists (HTTP ${response.status})`);
  return z.object({ removed: z.number().int() }).parse(await response.json());
}
```

(If you prefer, add an `apiDelete` next to `apiGet`/`apiPost` in `api/client.ts` using the shared `request` helper, and use it here. That's the better choice for consistent errors; if you do, record it.)

`apps/web/src/features/list-queue/QueueControls.tsx`:

```tsx
import type { ListQueueState } from '@bcp/shared';
import { Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatDateTime, formatDuration } from '../../lib/format';
import { listQueueQuery, pauseQueue, resumeQueue, retryFailed } from './list-queue-queries';

function PausedNote({ state }: { state: ListQueueState }) {
  switch (state.pausedReason) {
    case 'login-rejected':
      return (
        <Text size="sm" c="red">
          Paused: BCP rejected the login.{' '}
          <Anchor component={Link} to="/settings" inherit>
            Fix it in Settings
          </Anchor>
          , then resume.
        </Text>
      );
    case 'rate-limited':
      return (
        <Text size="sm" c="yellow">
          Paused by a BCP rate limit
          {state.pausedUntil ? ` until ${formatDateTime(state.pausedUntil)}` : ''}; it resumes by
          itself.
        </Text>
      );
    case 'user':
      return (
        <Text size="sm" c="dimmed">
          Paused.
        </Text>
      );
    case null:
      return null;
  }
}

/** Totals plus Pause/Resume and Retry, shared by the header popover and the Settings card. */
export function QueueControls({ state }: { state: ListQueueState }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: listQueueQuery.queryKey });
  const toggle = useMutation({
    mutationFn: () => (state.paused ? resumeQueue() : pauseQueue()),
    onSuccess: refresh,
  });
  const retry = useMutation({
    mutationFn: () => retryFailed(),
    onSuccess: async () => {
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['event'] })]);
    },
  });
  const { queued, fetching, failed } = state.totals;
  const inProgress = queued + fetching;

  return (
    <Stack gap="xs">
      <Text size="sm" aria-live="polite">
        <span className="numeric">{inProgress}</span> in progress ·{' '}
        <span className="numeric">{failed}</span> failed
        {state.estimatedSeconds !== null && !state.paused && (
          <> · about {formatDuration(state.estimatedSeconds)} left</>
        )}
      </Text>
      <PausedNote state={state} />
      {toggle.error && (
        <Text size="sm" c="red">
          {toggle.error.message}
        </Text>
      )}
      <Group gap="xs">
        <Button
          size="xs"
          variant="outline"
          loading={toggle.isPending}
          onClick={() => {
            toggle.mutate();
          }}
        >
          {state.paused ? 'Resume' : 'Pause'}
        </Button>
        {failed > 0 && (
          <Button
            size="xs"
            variant="subtle"
            loading={retry.isPending}
            onClick={() => {
              retry.mutate();
            }}
          >
            Retry {failed} failed
          </Button>
        )}
      </Group>
    </Stack>
  );
}
```

`apps/web/src/features/list-queue/QueueIndicator.tsx`:

```tsx
import { Popover, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { formatDuration } from '../../lib/format';
import { listQueueQuery } from './list-queue-queries';
import { QueueControls } from './QueueControls';
import classes from './QueueIndicator.module.css';

/** "Lists · 34 queued · ~3 min" in the header while there is anything to show. */
export function QueueIndicator() {
  const { data: state } = useQuery(listQueueQuery);
  if (!state) return null;
  const { queued, fetching, failed } = state.totals;
  const inProgress = queued + fetching;
  if (inProgress === 0 && failed === 0 && !state.paused) return null;

  const loginExpired = state.pausedReason === 'login-rejected';
  const label = loginExpired
    ? 'Lists paused: login expired'
    : [
        `Lists · ${inProgress} queued`,
        state.paused
          ? 'paused'
          : state.estimatedSeconds !== null
            ? `~${formatDuration(state.estimatedSeconds)}`
            : null,
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <Popover position="bottom-end" width={300} shadow="md">
      <Popover.Target>
        <UnstyledButton className={loginExpired ? classes.alert : classes.indicator}>
          {label}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <QueueControls state={state} />
      </Popover.Dropdown>
    </Popover>
  );
}
```

`apps/web/src/features/list-queue/QueueIndicator.module.css`:

```css
.indicator,
.alert {
  padding: 4px 10px;
  font-size: var(--mantine-font-size-xs);
  font-family: var(--mantine-font-family-monospace);
  border: 1px solid var(--mantine-color-neon-8);
  color: var(--mantine-color-neon-3);
  white-space: nowrap;
}

.alert {
  border-color: var(--mantine-color-red-7);
  color: var(--mantine-color-red-4);
}

.indicator:focus-visible,
.alert:focus-visible {
  outline: 2px solid var(--mantine-color-neon-5);
  outline-offset: 2px;
}
```

`apps/web/src/features/list-queue/ListQueueCard.tsx`:

```tsx
import { Skeleton, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { listQueueQuery } from './list-queue-queries';
import { QueueControls } from './QueueControls';

export function ListQueueCard() {
  const queue = useQuery(listQueueQuery);
  return (
    <Panel title="List queue">
      {queue.isPending && <Skeleton height={56} />}
      {queue.error && <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />}
      {queue.data && (
        <>
          <Text size="sm" c="dimmed" mb="xs">
            Army lists are fetched in the background, one every{' '}
            <span className="numeric">{queue.data.intervalMs / 1000}</span> s.
          </Text>
          <QueueControls state={queue.data} />
        </>
      )}
    </Panel>
  );
}
```

In `apps/web/src/components/AppLayout.tsx`, render `<QueueIndicator />` as the first child of the nav `Group` (before the links). It must fit the 375 px header: at the `xs` breakpoint, set the nav gap to 8px as today, and let the indicator shorten itself. Add `@media (max-width: 35.99375em) { .indicator, .alert { max-width: 120px; overflow: hidden; text-overflow: ellipsis; } }` to `QueueIndicator.module.css`.

In `apps/web/src/routes/settings.tsx`, render `<ListQueueCard />` under `<BcpStatusCard />`.

- [ ] **Step 3: Run the tests**

Run: `pnpm vitest run --project web`
Expected: PASS.

- [ ] **Step 4: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(web): list queue status in the header and in Settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Web: the "Fetch lists" menu, queue line, record filter and drawer

**Files:**

- Create: `apps/web/src/features/event/FetchListsMenu.tsx`, `EventQueueLine.tsx`
- Delete: `apps/web/src/features/event/FetchListsButton.tsx` and its test
- Modify: `apps/web/src/features/event/players-filter.ts`, `PlayersPanel.tsx`, `ListDrawer.tsx`, `ListStatusBadge.tsx`
- Test: `players-filter.test.ts`, `FetchListsMenu.test.tsx`, `EventQueueLine.test.tsx`, `ListDrawer.test.tsx`

**Interfaces:**

- Consumes: `qualifiesForMaxLosses` (Task 1); `queueLists`, `describeQueueResult` (Task 3); `cancelQueued`, `retryFailed`, `listQueueQuery` (Task 4); `formatDuration`.
- Produces:
  - `lossOptions(roundCount): number[]`
  - `PlayerFilter.maxLosses: number | null`
  - `missingListCount(players, maxLosses | null): number`
  - `<FetchListsMenu event players />`, `<EventQueueLine event />`

- [ ] **Step 1: Write the failing tests** (Review Focus 5)

Add to `apps/web/src/features/event/players-filter.test.ts` (and update the existing `filterPlayers` calls to pass `maxLosses: null`):

```ts
import { lossOptions, missingListCount } from './players-filter';

describe('lossOptions', () => {
  it('offers X-0 up to X-(rounds-1), at most X-5', () => {
    expect(lossOptions(2)).toEqual([0, 1]);
    expect(lossOptions(5)).toEqual([0, 1, 2, 3, 4]);
    expect(lossOptions(9)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(lossOptions(1)).toEqual([0]);
    expect(lossOptions(0)).toEqual([]);
  });
});

describe('record filter and missing counts', () => {
  const list = [
    aPlayer({ bcpId: 'A', wins: 2, losses: 0, draws: 0, listStatus: 'available' }),
    aPlayer({ bcpId: 'B', wins: 1, losses: 1, draws: 0, listStatus: 'available' }),
    aPlayer({ bcpId: 'C', wins: 0, losses: 0, draws: 2, listStatus: 'fetched' }),
    aPlayer({ bcpId: 'D', wins: 0, losses: 0, draws: 0, listStatus: 'available' }),
  ];

  it('filters by loss limit (draws are not losses; no games never qualifies)', () => {
    expect(
      filterPlayers(list, { query: '', faction: null, maxLosses: 0 }).map((p) => p.bcpId),
    ).toEqual(['A', 'C']);
  });

  it('counts lists that could still be queued', () => {
    expect(missingListCount(list, null)).toBe(3);
    expect(missingListCount(list, 0)).toBe(1);
    expect(missingListCount(list, 1)).toBe(2);
  });
});
```

`apps/web/src/features/event/FetchListsMenu.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail, aPlayer } from '../../test/sample-data';
import { FetchListsMenu } from './FetchListsMenu';

const players = [
  aPlayer({ bcpId: 'A', wins: 2, losses: 0, draws: 0, listStatus: 'available' }),
  aPlayer({ bcpId: 'B', wins: 1, losses: 1, draws: 0, listStatus: 'available' }),
  aPlayer({ bcpId: 'C', wins: 0, losses: 2, draws: 0, listStatus: 'available' }),
];

describe('FetchListsMenu', () => {
  it('offers every missing list and each possible result filter, with counts', () => {
    renderWithProviders(
      <FetchListsMenu event={anEventDetail({ roundCount: 2 })} players={players} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
    expect(screen.getByRole('menuitem', { name: 'All missing lists (3)' })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: 'X-0 only (1)' })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: 'X-1 or better (2)' })).toBeEnabled();
    expect(screen.queryByRole('menuitem', { name: /X-2/ })).toBeNull();
  });

  it('queues the chosen result filter', async () => {
    const fetchMock = stubFetchRoutes({
      'POST /api/events/EVT1/lists/queue': {
        queued: 2,
        alreadyQueued: 0,
        alreadyFetched: 0,
        noListOnBcp: 0,
        notQualifying: 1,
        estimatedSeconds: 10,
      },
    });
    renderWithProviders(
      <FetchListsMenu event={anEventDetail({ roundCount: 2 })} players={players} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'X-1 or better (2)' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ maxLosses: 1 });
  });

  it('disables filters with nothing to fetch', () => {
    renderWithProviders(
      <FetchListsMenu
        event={anEventDetail({ roundCount: 2 })}
        players={[aPlayer({ wins: 0, losses: 2, draws: 0, listStatus: 'available' })]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
    expect(screen.getByRole('menuitem', { name: 'X-0 only (0)' })).toBeDisabled();
  });
});
```

`apps/web/src/features/event/EventQueueLine.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { EventQueueLine } from './EventQueueLine';

const counts = {
  players: 8,
  teams: 4,
  listsAvailable: 7,
  listsFetched: 3,
  listsMissing: 4,
  listsQueued: 3,
  listsFailed: 1,
};

describe('EventQueueLine', () => {
  it('shows progress and lets the user cancel or retry', async () => {
    const fetchMock = stubFetchRoutes({
      'DELETE /api/events/EVT1/lists/queue': { removed: 3 },
      'POST /api/list-queue/retry-failed': { requeued: 1 },
    });
    renderWithProviders(<EventQueueLine event={anEventDetail({ counts, listQueueSeconds: 15 })} />);
    expect(
      screen.getByText(/3 queued · 3 fetched · 1 failed · about 15 s left/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel queued' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
        expect.arrayContaining(['/api/events/EVT1/lists/queue', '/api/list-queue/retry-failed']),
      );
    });
  });

  it('is hidden when nothing is queued or failed', () => {
    const { container } = renderWithProviders(<EventQueueLine event={anEventDetail()} />);
    expect(container.querySelector('[aria-live]')).toBeNull();
  });
});
```

Add to `apps/web/src/features/event/ListDrawer.test.tsx`:

```tsx
it('queues a single list that is not fetched yet', async () => {
  const fetchMock = stubFetchRoutes({
    'POST /api/events/EVT1/lists/queue': {
      queued: 1,
      alreadyQueued: 0,
      alreadyFetched: 0,
      noListOnBcp: 0,
      notQualifying: 0,
      estimatedSeconds: 5,
    },
  });
  renderWithProviders(
    <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'available' })} onClose={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Fetch this list' }));
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalled();
  });
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ playerIds: ['PL-ADA'] });
});

it('shows a queued list as on its way, and a failed one with its reason and Retry', () => {
  const { unmount } = renderWithProviders(
    <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'queued' })} onClose={vi.fn()} />,
  );
  expect(screen.getByText(/queued/i)).toBeInTheDocument();
  unmount();
  renderWithProviders(
    <ListDrawer
      eventId="EVT1"
      player={aPlayer({ listStatus: 'failed', listError: 'BCP hiccup' })}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText('BCP hiccup')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});
```

(Update the existing drawer tests: they now pass `eventId="EVT1"`. The "not fetched yet" test expects the new copy "This list hasn't been fetched yet." together with the "Fetch this list" button.)

Run: `pnpm vitest run --project web src/features/event`
Expected: FAIL.

- [ ] **Step 2: Implement the filter helpers**

In `apps/web/src/features/event/players-filter.ts`:

- Add `maxLosses: number | null` to `PlayerFilter`.
- In `filterPlayers`, AND in `(maxLosses === null || qualifiesForMaxLosses(player, maxLosses))`, importing `qualifiesForMaxLosses` from `@bcp/shared`.
- Append:

```ts
/** Offered result filters: X-0 up to X-(rounds-1), never more than X-5. */
export function lossOptions(roundCount: number): number[] {
  const highest = Math.min(roundCount - 1, 5);
  return Array.from({ length: Math.max(highest + 1, 0) }, (_, losses) => losses);
}

/** Lists a queue request would add: not fetched yet (or failed), passing the loss limit if any. */
export function missingListCount(players: EventPlayer[], maxLosses: number | null): number {
  return players.filter(
    (player) =>
      (player.listStatus === 'available' || player.listStatus === 'failed') &&
      (maxLosses === null || qualifiesForMaxLosses(player, maxLosses)),
  ).length;
}

export const lossLabel = (losses: number) => (losses === 0 ? 'X-0 only' : `X-${losses} or better`);
```

- [ ] **Step 3: Implement the menu, the queue line, the badge tooltip and the drawer**

`apps/web/src/features/event/FetchListsMenu.tsx`:

```tsx
import type { EventDetail, EventPlayer, QueueListsRequest } from '@bcp/shared';
import { Button, Menu, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { describeQueueResult, queueLists } from '../list-queue/list-queue-api';
import { listQueueQuery } from '../list-queue/list-queue-queries';
import { lossLabel, lossOptions, missingListCount } from './players-filter';

interface FetchListsMenuProps {
  event: EventDetail;
  players: EventPlayer[];
}

export function FetchListsMenu({ event, players }: FetchListsMenuProps) {
  const queryClient = useQueryClient();
  const queue = useMutation({
    mutationFn: (request: QueueListsRequest) => queueLists(event.bcpId, request),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event', event.bcpId] }),
        queryClient.invalidateQueries({ queryKey: listQueueQuery.queryKey }),
      ]);
      notifications.show({
        color: 'neon',
        title: 'Army lists',
        message: describeQueueResult(result),
      });
    },
    onError: (error) => {
      notifications.show({ color: 'red', title: 'Army lists', message: error.message });
    },
  });
  const allMissing = missingListCount(players, null);

  return (
    <Stack gap={4} align="flex-end" maw={360}>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button size="sm" loading={queue.isPending} disabled={event.counts.listsAvailable === 0}>
            Fetch lists
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            disabled={allMissing === 0}
            onClick={() => {
              queue.mutate({});
            }}
          >
            All missing lists ({allMissing})
          </Menu.Item>
          <Menu.Divider />
          {lossOptions(event.roundCount).map((losses) => {
            const count = missingListCount(players, losses);
            return (
              <Menu.Item
                key={losses}
                disabled={count === 0}
                onClick={() => {
                  queue.mutate({ maxLosses: losses });
                }}
              >
                {lossLabel(losses)} ({count})
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
      {event.hideLists && (
        <Text size="xs" c="yellow" ta="right">
          BCP marks this event's lists as hidden, so some may be unavailable.
        </Text>
      )}
    </Stack>
  );
}
```

`apps/web/src/features/event/EventQueueLine.tsx`:

```tsx
import type { EventDetail } from '@bcp/shared';
import { Button, Group, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDuration } from '../../lib/format';
import { cancelQueued, listQueueQuery, retryFailed } from '../list-queue/list-queue-queries';

/** "3 queued · 3 fetched · 1 failed · about 15 s left", with Cancel and Retry. */
export function EventQueueLine({ event }: { event: EventDetail }) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['event', event.bcpId] }),
      queryClient.invalidateQueries({ queryKey: listQueueQuery.queryKey }),
    ]);
  const cancel = useMutation({ mutationFn: () => cancelQueued(event.bcpId), onSuccess: refresh });
  const retry = useMutation({ mutationFn: () => retryFailed(event.bcpId), onSuccess: refresh });
  const { listsQueued, listsFetched, listsFailed } = event.counts;
  if (listsQueued === 0 && listsFailed === 0) return null;

  return (
    <Group gap="sm" wrap="wrap">
      <Text size="sm" c="dimmed" aria-live="polite">
        <span className="numeric">{listsQueued}</span> queued ·{' '}
        <span className="numeric">{listsFetched}</span> fetched ·{' '}
        <span className="numeric">{listsFailed}</span> failed
        {event.listQueueSeconds !== null && (
          <> · about {formatDuration(event.listQueueSeconds)} left</>
        )}
      </Text>
      {listsQueued > 0 && (
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          loading={cancel.isPending}
          onClick={() => {
            cancel.mutate();
          }}
        >
          Cancel queued
        </Button>
      )}
      {listsFailed > 0 && (
        <Button
          size="compact-xs"
          variant="subtle"
          loading={retry.isPending}
          onClick={() => {
            retry.mutate();
          }}
        >
          Retry failed
        </Button>
      )}
    </Group>
  );
}
```

`ListStatusBadge.tsx`:

- Change the signature to `({ status, error }: { status: ListStatus; error?: string | null })`.
- Wrap the failed badge in `<Tooltip label={error ?? 'Failed'} withArrow>` from `@mantine/core`.
- Give the badge `tabIndex={0}` so keyboard users can reach the tooltip.

`ListDrawer.tsx`:

- Add a required `eventId: string` prop.
- Keep the `none` text.
- Replace the `available` branch, and add `queued`, `fetching` and `failed` branches, using a `FetchThisList` subcomponent:

```tsx
function FetchThisList({
  eventId,
  player,
  label,
}: {
  eventId: string;
  player: EventPlayer;
  label: string;
}) {
  const queryClient = useQueryClient();
  const queue = useMutation({
    mutationFn: () => queueLists(eventId, { playerIds: [player.bcpId] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['event', eventId] }),
  });
  return (
    <Stack gap="xs" align="flex-start">
      <Button
        size="xs"
        loading={queue.isPending}
        onClick={() => {
          queue.mutate();
        }}
      >
        {label}
      </Button>
      {queue.error && (
        <Text size="sm" c="red">
          {queue.error.message}
        </Text>
      )}
    </Stack>
  );
}
```

- **available:** `<Text size="sm" c="dimmed">This list hasn't been fetched yet.</Text>` plus `<FetchThisList … label="Fetch this list" />`, which jumps the queue.
- **queued / fetching:** `<Group gap="xs"><Loader size="xs" /><Text size="sm" aria-live="polite">{player.listStatus === 'fetching' ? 'Fetching this list…' : 'Queued: it is next in line and arrives within seconds.'}</Text></Group>`.
- **failed:** `<Text size="sm" c="red">{player.listError}</Text>` plus `<FetchThisList … label="Retry" />`.

`PlayersPanel.tsx`:

- Replace the `openPlayer` state with `const [openPlayerId, setOpenPlayerId] = useState<string | null>(null)`, and derive `const openPlayer = all.find((p) => p.bcpId === openPlayerId) ?? null`. The drawer then updates as the list arrives, because the players query polls while lists are pending.
- Add a **Record** `Select` next to the faction filter: `aria-label="Record"`, `placeholder="All results"`, data `lossOptions(event.roundCount).map((n) => ({ value: String(n), label: lossLabel(n) }))`, clearable. State `maxLosses: number | null`. Pass it to `filterPlayers`.
- Replace `<FetchListsButton event={event} />` with `<FetchListsMenu event={event} players={all} />`.
- Render `<EventQueueLine event={event} />` between the toolbar and the table.
- The List column renders `<ListStatusBadge status={p.listStatus} error={p.listError} />`.
- Pass `eventId={event.bcpId}` to `ListDrawer`.

Delete `FetchListsButton.tsx` and `FetchListsButton.test.tsx`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project web`
Expected: PASS. DataTable tests need the local `matchMedia` stub; see `PlayersPanel.test.tsx`.

- [ ] **Step 5: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(web): fetch lists by result, queue a single list, show queue progress per event

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end test and README

**Files:**

- Modify: `e2e/finder-to-list.spec.ts`, `README.md`

- [ ] **Step 1: Update the smoke test to use the queue**

In `e2e/finder-to-list.spec.ts`, replace the part from "Fetch all lists" through the Ada drawer check with:

```ts
// Queue only the good results; the background worker (200 ms per list in e2e) fetches them.
await page.getByRole('button', { name: 'Fetch lists' }).click();
await page.getByRole('menuitem', { name: 'X-1 or better (6)' }).click();

const adaRow = page.getByRole('row', { name: /Ada Archer/ });
await expect(adaRow.getByText('Fetched')).toBeVisible({ timeout: 20_000 });

// Eve (0-2) didn't qualify: her list is still one click away.
await page.getByRole('button', { name: 'Fetch lists' }).click();
await expect(page.getByRole('menuitem', { name: 'All missing lists (1)' })).toBeEnabled();
await page.keyboard.press('Escape');

await page.getByRole('button', { name: 'Ada Archer' }).click();
await expect(page.getByText(/Gladius Task Force/)).toBeVisible();
await page.keyboard.press('Escape');
```

Rename the test to `'find a tournament, queue the good results’ lists and read one'`. Keep the export menu check at the end.

Run: `pnpm e2e`
Expected: 1 passed.

- [ ] **Step 2: README**

In the "Using it" section, replace the event-page bullet with:

```markdown
- **An event page** loads its players from BCP the first time you open it. **Fetch lists** queues
  army lists for a background worker that fetches **one list every 5 seconds**, so BCP is never
  flooded: choose **All missing lists**, or only the good results (**X-0**, **X-1 or better**, …;
  draws don't count as losses). Clicking a player shows their list; if it isn't fetched yet,
  **Fetch this list** jumps the queue. The header shows the queue while it's working (click it to
  pause or resume); if BCP rejects your login the queue pauses itself — fix the token, restart,
  and resume. **Export lists** saves what's fetched as `.txt` or `.json`.
```

In the Commands or configuration area, add the row: `| LIST_QUEUE_INTERVAL_MS | Background list pace in ms (default 5000). Keep it gentle. |` (or a sentence, if there's no configuration table).

- [ ] **Step 3: Check and commit**

```bash
pnpm check
git add -A
git commit -m "test(e2e): queue lists by result; README for the list queue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
