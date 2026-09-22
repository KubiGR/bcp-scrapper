# Foundation & Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a monorepo with strict tooling, a Postgres schema, a rate-limited and authenticated BCP scraper that maps BCP JSON into typed domain objects, background sync jobs, a small HTTP API to start and watch syncs, and a Mantine web shell that shows the BCP connection status.

**Architecture:**

- pnpm monorepo:
  - `packages/shared`: Zod schemas and types.
  - `apps/api`: a Hono server with Drizzle/Postgres and the BCP scraper.
  - `apps/web`: React 19 with React Compiler, Vite, TanStack Router/Query and Mantine.
- All BCP access goes through a `BcpTransport`:
  - `HttpTransport` makes the real requests, with rate limiting, retries and your BCP token.
  - `FixtureTransport` answers from JSON files on disk.
  - `BcpSource` sits on top of either one, validates responses with Zod and maps them to domain types. Tests use exactly the same parsing path as production.

**Tech Stack:** Node 24 LTS, pnpm 12, TypeScript 6.0, Zod 4, Hono 4, Drizzle ORM 0.45 + Postgres 17 (PGlite in tests), pino, Vitest 5, React 19.3, Vite 8, `@vitejs/plugin-react` 6 + `babel-plugin-react-compiler` 1.0, TanStack Router/Query, Mantine 9, ESLint 10 + typescript-eslint 8, Prettier 3.

**Spec:** `docs/superpowers/specs/2026-09-23-bcp-analyzer-design.md`

**This is plan 1 of 3.**

- **Plan 2:** the tournament finder (size presets, the "Latest" default view, deep search, catalogue coverage gaps and `GET /api/catalog/coverage`), the event page, players & lists, list export, the remaining read routes, freshness rules (§7), and the Playwright smoke test.
- **Plan 3:** rounds, standings, team detail and the faction matrix (§9).

Plans 2 and 3 are written after this plan is executed, so they can build on real code.

**Deliberate refinements of the spec (apply when reading it):**

- **Primary keys are the BCP ids** (text), so there's no separate `bcp_id` column. `players.team_id`, `games.player_*_id` and `games.team_matchup_id` have no foreign keys, because BCP can reference entries that no longer exist. They are indexed instead.
- **The spec's `FixtureSource`** is implemented as `new BcpSource(new FixtureTransport(dir))`, so fixtures go through the real parsing code.
- **`army_lists`** is keyed by `player_id`, with one list per player.
- **The BCP session** (access token, refresh token and expiry) is stored in a single-row `bcp_session` table, because BCP may issue a new refresh token each time the old one is used.

## Global Constraints

- **Node:** Node 24 LTS (`.nvmrc` = `lts/krypton`), with `"engines": { "node": ">=24" }`.
- **pnpm:** pnpm 12 through corepack (`"packageManager": "pnpm@12.5.1"`).
- **TypeScript:** pin `typescript@~6.0.3`. typescript-eslint 8 supports only TypeScript `<6.1`, so do not upgrade to TypeScript 7.
- **Zod:** Zod 4 APIs only (`z.iso.datetime()`, `z.iso.date()`, `z.prettifyError`, `z.looseObject`).
- **Type strictness:**
  - `strict` and `noUncheckedIndexedAccess` are on.
  - No `any`.
  - `eslint . --max-warnings=0` must pass, using the strict type-checked rules.
- **All BCP HTTP traffic** goes through `HttpTransport`: headers `client-id: web-app` and `env: bcp`, with the user's token when one is configured. Tokens and `Authorization` headers are never logged.
- **Tests never touch the network or a real Postgres.** They use `FixtureTransport` and PGlite.
- **Error bodies** always look like `{ error: { code, message, details? } }`.
- **Code style:**
  - Prettier: single quotes, `printWidth` 100, trailing commas.
  - File names are kebab-case, except React components, which use PascalCase `.tsx` names.
  - Tests sit next to the code they test, named `*.test.ts(x)`.
- **Commits:** commit at the end of every task. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, tsconfig.json
eslint.config.js, .prettierrc.json, .prettierignore, .editorconfig, .gitignore
.env.example, docker-compose.yml, vitest.config.ts, .husky/pre-commit, README.md

packages/shared/src/
  domain.ts        EventSummary, Team, Player, TeamMatchup, Game, ArmyList
  sync.ts          SyncKind, SyncStatus, SyncRequest, SyncRun
  api.ts           ApiErrorBody, EventListQuery/Item/Response, BcpStatus
  index.ts         re-exports
  schemas.test.ts

apps/api/
  drizzle.config.ts, drizzle/ (generated migrations)
  scripts/record-fixtures.ts         record + anonymise live BCP responses
  src/main.ts                        process entry: wires everything, starts server
  src/app.ts                         createApp(deps): Hono app, error handling, routes
  src/config.ts                      env → typed Config
  src/logger.ts                      pino with token redaction
  src/errors.ts                      AppError + subclasses, toErrorBody
  src/validation.ts                  parseInput, formatIssues
  src/db/schema.ts                   Drizzle tables
  src/db/client.ts                   createDb (node-postgres), Db type
  src/db/test-db.ts                  createTestDb (PGlite), resetDb
  src/bcp/transport.ts               BcpRequest, BcpTransport, AccessTokenProvider
  src/bcp/raw.ts                     Zod schemas for BCP JSON, parseBcp, parseItems
  src/bcp/mappers.ts                 raw → domain
  src/bcp/fixture-transport.ts       fixtureFileFor, FixtureTransport
  src/bcp/rate-limiter.ts            RateLimiter
  src/bcp/http-transport.ts          HttpTransport (+ retry helpers)
  src/bcp/auth.ts                    BcpAuth, decodeJwtExpiry, memory session store
  src/bcp/auth-store.ts              createDbSessionStore
  src/bcp/source.ts                  TournamentSource, BcpSource, Fetched<T>
  src/bcp/create-source.ts           config → source + status provider
  src/bcp/anonymise.ts               Anonymiser (used by record-fixtures)
  src/repo/upsert.ts                 excludedColumns helper
  src/repo/events.ts                 event upserts + search
  src/repo/participants.ts           team/player upserts
  src/repo/pairings.ts               matchup/game upserts
  src/repo/lists.ts                  missing lists, saveArmyList
  src/repo/sync-runs.ts              sync_runs lifecycle
  src/sync/jobs.ts                   catalog / event / pairings / lists jobs
  src/sync/runner.ts                 SyncRunner
  src/routes/events.ts, sync.ts, bcp.ts
  src/test/helpers.ts                silentLogger, SAMPLE_FIXTURES_DIR, sampleSource

apps/web/
  index.html, vite.config.ts, postcss.config.js
  src/main.tsx, router.ts, theme.ts, routeTree.gen.ts (generated, committed)
  src/api/client.ts, src/api/query-client.ts
  src/routes/__root.tsx, index.tsx, settings.tsx
  src/components/AppLayout.tsx
  src/features/settings/bcp-status-query.ts, BcpStatusCard.tsx, BcpStatusCard.test.tsx
  src/test/setup.ts, src/test/render.tsx

fixtures/bcp/sample/                 hand-written BCP-shaped JSON (committed)
fixtures/bcp/recorded/               anonymised live recordings (git-ignored)
```

---

### Task 1: Monorepo tooling and shared schemas

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.gitignore`, `vitest.config.ts`, `.husky/pre-commit`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/domain.ts`, `packages/shared/src/sync.ts`, `packages/shared/src/api.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas.test.ts`

**Interfaces:**

- Produces (`@bcp/shared`): `EventSummarySchema`/`EventSummary`, `TeamSchema`/`Team`, `PlayerSchema`/`Player`, `TeamMatchupSchema`/`TeamMatchup`, `GameSchema`/`Game`, `GameResultSchema`/`GameResult` (`'a_win'|'b_win'|'draw'`), `SideSchema`/`Side` (`'a'|'b'`), `ArmyListSchema`/`ArmyList`, `SyncKindSchema`/`SyncKind`, `SyncStatusSchema`/`SyncStatus`, `SyncRequestSchema`/`SyncRequest`, `SyncRunSchema`/`SyncRun`, `ApiErrorCodeSchema`/`ApiErrorCode`, `ApiErrorBodySchema`/`ApiErrorBody`, `EventSortSchema`/`EventSort` (`'date'|'players'`), `EventListQuerySchema`/`EventListQuery`, `EventListItemSchema`/`EventListItem`, `EventListResponseSchema`/`EventListResponse`, `BcpStatusSchema`/`BcpStatus`.
- Root scripts: `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm format:check`, `pnpm test`, `pnpm check`, `pnpm dev`, `pnpm db:up`.

- [ ] **Step 1: Enable pnpm and create the root package**

```bash
source ~/.nvm/nvm.sh && nvm use
corepack enable
```

Create `package.json`:

```json
{
  "name": "bcp-analyzer",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.5.1",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "pnpm --filter \"./apps/*\" --parallel run dev",
    "typecheck": "tsc -p tsconfig.json && pnpm -r run typecheck",
    "lint": "eslint . --max-warnings=0",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm test",
    "db:up": "docker compose up -d --wait db",
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{ts,tsx,js}": ["eslint --max-warnings=0 --fix", "prettier --write"],
    "*.{json,md,yml,yaml,css,html}": ["prettier --write"]
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

- [ ] **Step 2: Install root dev tooling**

```bash
pnpm add -Dw typescript@~6.0.3 @types/node eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-config-prettier globals prettier vitest husky lint-staged
```

If pnpm prints "Ignored build scripts", run `pnpm approve-builds` and approve only `esbuild`.

- [ ] **Step 3: Write the shared config files**

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "Preserve",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": []
  }
}
```

`tsconfig.json` (type-checks root-level config files):

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["vitest.config.ts"]
}
```

`eslint.config.js`:

```js
// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules',
    '**/dist',
    '**/coverage',
    '**/routeTree.gen.ts',
    'apps/api/drizzle',
    'fixtures',
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '*.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Vitest matchers (expect.any, expect.stringContaining) are typed `any`, and asserting
    // on mocked methods (expect(obj.method)) is idiomatic in tests.
    files: ['**/*.test.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  { files: ['**/*.{js,cjs,mjs}'], extends: [tseslint.configs.disableTypeChecked] },
  prettier,
]);
```

`.prettierrc.json`:

```json
{ "singleQuote": true, "printWidth": 100, "trailingComma": "all" }
```

`.prettierignore`:

```
pnpm-lock.yaml
apps/api/drizzle
**/routeTree.gen.ts
fixtures/bcp/recorded
coverage
dist
```

`.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

`.gitignore`:

```
node_modules/
dist/
coverage/
.env
.env.*.local
*.log
.DS_Store
.tanstack/
fixtures/bcp/recorded/
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { projects: ['packages/*', 'apps/*'] },
});
```

- [ ] **Step 4: Create the shared package skeleton**

`packages/shared/package.json`:

```json
{
  "name": "@bcp/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc -p tsconfig.json" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "vitest.config.ts"]
}
```

`packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { name: 'shared', environment: 'node' } });
```

```bash
pnpm --filter @bcp/shared add zod
```

- [ ] **Step 5: Write the failing schema tests**

`packages/shared/src/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EventListQuerySchema, SyncRequestSchema } from './index';

describe('SyncRequestSchema', () => {
  it('accepts a catalogue sync with a valid date range', () => {
    const request = { kind: 'catalog', from: '2026-01-01', to: '2026-03-31' };
    expect(SyncRequestSchema.parse(request)).toEqual(request);
  });

  it('rejects a catalogue sync whose range is reversed', () => {
    const result = SyncRequestSchema.safeParse({
      kind: 'catalog',
      from: '2026-03-31',
      to: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('requires an eventId for event-scoped syncs', () => {
    expect(SyncRequestSchema.safeParse({ kind: 'lists' }).success).toBe(false);
    expect(SyncRequestSchema.safeParse({ kind: 'lists', eventId: 'EVT1' }).success).toBe(true);
  });

  it('rejects unknown kinds', () => {
    expect(SyncRequestSchema.safeParse({ kind: 'everything' }).success).toBe(false);
  });
});

describe('EventListQuerySchema', () => {
  it('coerces query-string values and applies defaults', () => {
    expect(EventListQuerySchema.parse({ minPlayers: '40' })).toEqual({
      minPlayers: 40,
      type: 'all',
      sort: 'date',
      page: 1,
      pageSize: 50,
    });
  });

  it('accepts a player-size window and a biggest-first sort', () => {
    expect(
      EventListQuerySchema.parse({ minPlayers: '50', maxPlayers: '120', sort: 'players' }),
    ).toMatchObject({ minPlayers: 50, maxPlayers: 120, sort: 'players' });
  });

  it('rejects a size window whose maximum is below its minimum', () => {
    expect(EventListQuerySchema.safeParse({ minPlayers: '100', maxPlayers: '40' }).success).toBe(
      false,
    );
  });

  it('rejects page sizes above 100', () => {
    expect(EventListQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});
```

- [ ] **Step 6: Run the tests and watch them fail**

Run: `pnpm test`
Expected: FAIL, because `./index` does not exist.

- [ ] **Step 7: Implement the schemas**

`packages/shared/src/domain.ts`:

```ts
import { z } from 'zod';

/** Which side of a pairing: player/team A (BCP "player1") or B ("player2"). */
export const SideSchema = z.enum(['a', 'b']);
export type Side = z.infer<typeof SideSchema>;

export const GameResultSchema = z.enum(['a_win', 'b_win', 'draw']);
export type GameResult = z.infer<typeof GameResultSchema>;

/** A tournament as we know it, from BCP search results or event detail. */
export const EventSummarySchema = z.object({
  bcpId: z.string().min(1),
  name: z.string(),
  startDate: z.iso.datetime(),
  endDate: z.iso.datetime().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  playerCount: z.number().int().nonnegative(),
  /** Teams in a team event. Only event detail knows it; null from search results and for singles. */
  teamCount: z.number().int().nonnegative().nullable(),
  isTeamEvent: z.boolean(),
  isOnline: z.boolean(),
  roundCount: z.number().int().nonnegative(),
  ended: z.boolean(),
  hideLists: z.boolean(),
});
export type EventSummary = z.infer<typeof EventSummarySchema>;

/** A team's entry in one event. `roundPoints[i]` is the team score in round i + 1. */
export const TeamSchema = z.object({
  bcpId: z.string().min(1),
  eventBcpId: z.string().min(1),
  name: z.string(),
  placing: z.number().int().nullable(),
  roundPoints: z.array(z.number()),
});
export type Team = z.infer<typeof TeamSchema>;

/** A player's entry in one event. */
export const PlayerSchema = z.object({
  bcpId: z.string().min(1),
  eventBcpId: z.string().min(1),
  teamBcpId: z.string().nullable(),
  name: z.string(),
  faction: z.string().nullable(),
  parentFaction: z.string().nullable(),
  placing: z.number().int().nullable(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  dropped: z.boolean(),
  listBcpId: z.string().nullable(),
});
export type Player = z.infer<typeof PlayerSchema>;

/** Two teams paired against each other in one round. `teamBBcpId` is null for a bye. */
export const TeamMatchupSchema = z.object({
  bcpId: z.string().min(1),
  eventBcpId: z.string().min(1),
  round: z.number().int().positive(),
  tableNo: z.number().int().nullable(),
  teamABcpId: z.string().min(1),
  teamBBcpId: z.string().nullable(),
  pointsA: z.number().nullable(),
  pointsB: z.number().nullable(),
});
export type TeamMatchup = z.infer<typeof TeamMatchupSchema>;

/** One game between two players. Scores are null until entered. `playerBBcpId` is null for a bye. */
export const GameSchema = z.object({
  bcpId: z.string().min(1),
  eventBcpId: z.string().min(1),
  round: z.number().int().positive(),
  tableNo: z.number().int().nullable(),
  teamMatchupBcpId: z.string().nullable(),
  playerABcpId: z.string().min(1),
  playerBBcpId: z.string().nullable(),
  vpA: z.number().nullable(),
  vpB: z.number().nullable(),
  primaryA: z.number().nullable(),
  primaryB: z.number().nullable(),
  secondaryA: z.number().nullable(),
  secondaryB: z.number().nullable(),
  gamePointsA: z.number().nullable(),
  gamePointsB: z.number().nullable(),
  firstTurn: SideSchema.nullable(),
  result: GameResultSchema.nullable(),
});
export type Game = z.infer<typeof GameSchema>;

export const ArmyListSchema = z.object({
  bcpId: z.string().min(1),
  text: z.string().nullable(),
});
export type ArmyList = z.infer<typeof ArmyListSchema>;
```

`packages/shared/src/sync.ts`:

```ts
import { z } from 'zod';

export const SyncKindSchema = z.enum(['catalog', 'event', 'pairings', 'lists']);
export type SyncKind = z.infer<typeof SyncKindSchema>;

export const SyncStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed']);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

const eventId = z.string().min(1);

export const SyncRequestSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('catalog'), from: z.iso.date(), to: z.iso.date() }),
    z.object({ kind: z.literal('event'), eventId }),
    z.object({ kind: z.literal('pairings'), eventId }),
    z.object({ kind: z.literal('lists'), eventId }),
  ])
  .refine((request) => request.kind !== 'catalog' || request.from <= request.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const SyncRunSchema = z.object({
  id: z.number().int().positive(),
  kind: SyncKindSchema,
  eventId: z.string().nullable(),
  status: SyncStatusSchema,
  total: z.number().int().nullable(),
  done: z.number().int(),
  failed: z.number().int(),
  error: z.string().nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});
export type SyncRun = z.infer<typeof SyncRunSchema>;
```

`packages/shared/src/api.ts`:

```ts
import { z } from 'zod';
import { EventSummarySchema } from './domain';

export const ApiErrorCodeSchema = z.enum([
  'BCP_UNAVAILABLE',
  'BCP_RATE_LIMITED',
  'BCP_SCHEMA_MISMATCH',
  'BCP_AUTH',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'INTERNAL',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

/** `date`: newest first. `players`: biggest first. */
export const EventSortSchema = z.enum(['date', 'players']);
export type EventSort = z.infer<typeof EventSortSchema>;

/** Query string for GET /api/events. Values arrive as strings, hence the coercion. */
export const EventListQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    country: z.string().trim().min(1).optional(),
    minPlayers: z.coerce.number().int().nonnegative().default(0),
    maxPlayers: z.coerce.number().int().nonnegative().optional(),
    type: z.enum(['all', 'singles', 'teams']).default('all'),
    q: z.string().trim().min(1).optional(),
    sort: EventSortSchema.default('date'),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((query) => query.maxPlayers === undefined || query.maxPlayers >= query.minPlayers, {
    message: '`maxPlayers` must be at least `minPlayers`',
    path: ['maxPlayers'],
  });
export type EventListQuery = z.infer<typeof EventListQuerySchema>;

export const EventListItemSchema = EventSummarySchema.extend({
  lastSyncedAt: z.iso.datetime().nullable(),
});
export type EventListItem = z.infer<typeof EventListItemSchema>;

export const EventListResponseSchema = z.object({
  items: z.array(EventListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type EventListResponse = z.infer<typeof EventListResponseSchema>;

export const BcpStatusSchema = z.object({
  source: z.enum(['bcp', 'fixtures']),
  authenticated: z.boolean(),
  accessTokenExpiresAt: z.iso.datetime().nullable(),
  lastRefreshAt: z.iso.datetime().nullable(),
});
export type BcpStatus = z.infer<typeof BcpStatusSchema>;
```

`packages/shared/src/index.ts`:

```ts
export * from './api';
export * from './domain';
export * from './sync';
```

- [ ] **Step 8: Run the tests and watch them pass**

Run: `pnpm test`
Expected: PASS, 8 tests in project `shared`.

- [ ] **Step 9: Set up git hooks and run the full check**

```bash
pnpm exec husky init
printf 'pnpm exec lint-staged\n' > .husky/pre-commit
pnpm format
pnpm check
```

Expected: typecheck, lint, format check and tests all pass.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: set up pnpm monorepo, tooling and shared schemas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: API skeleton (config, logging, errors, health route)

**Files:**

- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`
- Create: `apps/api/src/config.ts`, `apps/api/src/logger.ts`, `apps/api/src/errors.ts`, `apps/api/src/validation.ts`, `apps/api/src/app.ts`, `apps/api/src/main.ts`, `apps/api/src/test/helpers.ts`
- Create: `.env.example`
- Test: `apps/api/src/config.test.ts`, `apps/api/src/app.test.ts`

**Interfaces:**

- Consumes: `ApiErrorBody`, `ApiErrorCode` from `@bcp/shared`.
- Produces:
  - `loadConfig(env?: NodeJS.ProcessEnv): Config`
  - `createLogger(level: string, pretty: boolean): Logger`, where `type Logger = pino.Logger`
  - The error classes `AppError(code, status, message, { details?, cause? })`, `NotFoundError(message)`, `ValidationError(issues)`, `BcpUnavailableError(message, cause?)`, `BcpRateLimitedError(retryAfterSeconds)`, `BcpSchemaError(endpoint, issues)` and `BcpAuthError(message)`, plus `toErrorBody(error: AppError): ApiErrorBody`
  - `parseInput<S>(schema: S, input: unknown): z.output<S>`, which throws `ValidationError`
  - `formatIssues(error: z.ZodError): { path: string; message: string }[]`
  - `createApp(deps: AppDeps): Hono`
  - `silentLogger`

- [ ] **Step 1: Create the package**

`apps/api/package.json`:

```json
{
  "name": "@bcp/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=../../.env src/main.ts",
    "start": "tsx --env-file-if-exists=../../.env src/main.ts",
    "typecheck": "tsc -p tsconfig.json",
    "db:generate": "drizzle-kit generate",
    "record-fixtures": "tsx --env-file-if-exists=../../.env scripts/record-fixtures.ts"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "scripts", "vitest.config.ts", "drizzle.config.ts"]
}
```

`apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'api', environment: 'node', testTimeout: 20_000, hookTimeout: 60_000 },
});
```

```bash
pnpm --filter @bcp/api add hono @hono/node-server zod pino @bcp/shared@workspace:*
pnpm --filter @bcp/api add -D tsx pino-pretty
```

- [ ] **Step 2: Write the failing tests**

`apps/api/src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults when the environment is empty', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3001);
    expect(config.TOURNAMENT_SOURCE).toBe('fixtures');
    expect(config.BCP_REQUESTS_PER_SECOND).toBe(2);
    expect(config.BCP_REFRESH_TOKEN).toBeUndefined();
  });

  it('treats empty strings as unset, so a blank .env line does not fail validation', () => {
    expect(loadConfig({ BCP_REFRESH_TOKEN: '' }).BCP_REFRESH_TOKEN).toBeUndefined();
  });

  it('reports every invalid variable in one error', () => {
    expect(() => loadConfig({ PORT: 'abc', TOURNAMENT_SOURCE: 'ftp' })).toThrow(
      /PORT[\s\S]*TOURNAMENT_SOURCE/,
    );
  });
});
```

`apps/api/src/app.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { BcpRateLimitedError, NotFoundError } from './errors';
import { silentLogger } from './test/helpers';

function appWithBoomRoutes() {
  const app = createApp({ logger: silentLogger });
  app.get('/boom/not-found', () => {
    throw new NotFoundError('Event X not found');
  });
  app.get('/boom/rate-limited', () => {
    throw new BcpRateLimitedError(30);
  });
  app.get('/boom/unexpected', () => {
    throw new Error('kaboom');
  });
  return app;
}

describe('createApp', () => {
  it('answers the health check', async () => {
    const response = await createApp({ logger: silentLogger }).request('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('returns the standard error body for unknown routes', async () => {
    const response = await createApp({ logger: silentLogger }).request('/api/nope');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'No route for GET /api/nope' },
    });
  });

  it('maps AppErrors to their status and code', async () => {
    const response = await appWithBoomRoutes().request('/boom/not-found');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Event X not found' },
    });
  });

  it('adds Retry-After when BCP rate limits us', async () => {
    const response = await appWithBoomRoutes().request('/boom/rate-limited');
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const response = await appWithBoomRoutes().request('/boom/unexpected');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Something went wrong' },
    });
  });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `pnpm vitest run --project api`
Expected: FAIL, because the modules `./config`, `./app` and `./errors` do not exist.

- [ ] **Step 4: Implement config, logger, errors and validation**

`apps/api/src/config.ts`:

```ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1).default('postgres://bcp:bcp@localhost:5432/bcp'),
  TOURNAMENT_SOURCE: z.enum(['bcp', 'fixtures']).default('fixtures'),
  /** Resolved against the API's working directory (apps/api when run via pnpm). */
  FIXTURES_DIR: z.string().min(1).default('../../fixtures/bcp/sample'),
  BCP_API_URL: z.url().default('https://newprod-api.bestcoastpairings.com'),
  BCP_REFRESH_TOKEN: z.string().min(1).optional(),
  BCP_ACCESS_TOKEN: z.string().min(1).optional(),
  BCP_REQUESTS_PER_SECOND: z.coerce.number().positive().default(2),
  BCP_MAX_CONCURRENCY: z.coerce.number().int().positive().default(2),
  BCP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  BCP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(4),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // `KEY=` in .env yields "", which should mean "not set" rather than "invalid".
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const result = EnvSchema.safeParse(defined);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
```

`apps/api/src/logger.ts`:

```ts
import { pino } from 'pino';

export type Logger = pino.Logger;

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'headers.authorization',
        'accessToken',
        'refreshToken',
        '*.accessToken',
        '*.refreshToken',
      ],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty' } } : {}),
  });
}
```

`apps/api/src/errors.ts`:

```ts
import type { ApiErrorBody, ApiErrorCode } from '@bcp/shared';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** An error we expect, with the status and code API clients should see. */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: ContentfulStatusCode;
  readonly details: unknown;

  constructor(
    code: ApiErrorCode,
    status: ContentfulStatusCode,
    message: string,
    options: { details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = options.details;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NOT_FOUND', 404, message);
  }
}

export class ValidationError extends AppError {
  constructor(issues: { path: string; message: string }[]) {
    super('VALIDATION_ERROR', 400, 'Request validation failed', { details: { issues } });
  }
}

export class BcpUnavailableError extends AppError {
  constructor(message: string, cause?: unknown) {
    super('BCP_UNAVAILABLE', 502, message, { cause });
  }
}

export class BcpRateLimitedError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('BCP_RATE_LIMITED', 503, 'BCP is rate limiting us; try again shortly', {
      details: { retryAfterSeconds },
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class BcpSchemaError extends AppError {
  constructor(endpoint: string, issues: { path: string; message: string }[]) {
    super('BCP_SCHEMA_MISMATCH', 502, `BCP response from ${endpoint} had an unexpected shape`, {
      details: { endpoint, issues },
    });
  }
}

export class BcpAuthError extends AppError {
  constructor(message: string) {
    super('BCP_AUTH', 502, message);
  }
}

export function toErrorBody(error: AppError): ApiErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}
```

`apps/api/src/validation.ts`:

```ts
import type { z } from 'zod';
import { ValidationError } from './errors';

export function formatIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/** Parses untrusted request input, turning failures into a 400 VALIDATION_ERROR. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(formatIssues(result.error));
  return result.data;
}
```

`apps/api/src/test/helpers.ts`:

```ts
import { pino } from 'pino';

export const silentLogger = pino({ level: 'silent' });
```

- [ ] **Step 5: Implement the app and the entry point**

`apps/api/src/app.ts`:

```ts
import type { ApiErrorBody } from '@bcp/shared';
import { Hono } from 'hono';
import { AppError, BcpRateLimitedError, toErrorBody } from './errors';
import type { Logger } from './logger';

export interface AppDeps {
  logger: Logger;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof AppError) {
      if (error instanceof BcpRateLimitedError) {
        c.header('Retry-After', String(error.retryAfterSeconds));
      }
      return c.json(toErrorBody(error), error.status);
    }
    deps.logger.error({ err: error }, 'Unhandled error');
    const body: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Something went wrong' } };
    return c.json(body, 500);
  });

  app.notFound((c) => {
    const body: ApiErrorBody = {
      error: { code: 'NOT_FOUND', message: `No route for ${c.req.method} ${c.req.path}` },
    };
    return c.json(body, 404);
  });

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  return app;
}
```

`apps/api/src/main.ts`:

```ts
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';
import { createLogger } from './logger';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');
const app = createApp({ logger });

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info(`API listening on http://localhost:${info.port}`);
});
```

`.env.example`:

```bash
# --- API ---
PORT=3001
LOG_LEVEL=info
DATABASE_URL=postgres://bcp:bcp@localhost:5432/bcp

# "fixtures" serves FIXTURES_DIR; "bcp" scrapes bestcoastpairings.com as your account.
TOURNAMENT_SOURCE=fixtures
FIXTURES_DIR=../../fixtures/bcp/sample

# --- BCP ---
BCP_API_URL=https://newprod-api.bestcoastpairings.com
# Log in at bestcoastpairings.com, open DevTools → Application → Local Storage and copy
# the value of AuthIdentityServiceProvider.web-app.refreshToken
BCP_REFRESH_TOKEN=
# Fallback only if refreshing fails: AuthIdentityServiceProvider.web-app.accessToken (short-lived)
BCP_ACCESS_TOKEN=
BCP_REQUESTS_PER_SECOND=2
BCP_MAX_CONCURRENCY=2
BCP_TIMEOUT_MS=15000
BCP_MAX_ATTEMPTS=4
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm vitest run --project api`
Expected: PASS, 8 tests.

- [ ] **Step 7: Smoke-test the server**

```bash
cp .env.example .env
pnpm --filter @bcp/api start &
sleep 2 && curl -s localhost:3001/api/health; kill %1
```

Expected: `{"status":"ok"}`

- [ ] **Step 8: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): add Hono app skeleton with config, logging and error handling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Postgres schema, migrations and test database

**Files:**

- Create: `docker-compose.yml`, `apps/api/drizzle.config.ts`, `apps/api/src/db/schema.ts`, `apps/api/src/db/client.ts`, `apps/api/src/db/test-db.ts`
- Generated: `apps/api/drizzle/0000_init.sql` and `apps/api/drizzle/meta/*`
- Test: `apps/api/src/db/schema.test.ts`

**Interfaces:**

- Produces:
  - Tables `events`, `teams`, `players`, `armyLists`, `teamMatchups`, `games`, `syncRuns`, `bcpSession`
  - `type Db = PgDatabase<PgQueryResultHKT, typeof schema>`
  - `createDb(url): { db: Db; migrate(): Promise<void>; close(): Promise<void> }`
  - `MIGRATIONS_DIR`
  - `createTestDb(): Promise<{ db: Db; close(): Promise<void> }>`
  - `resetDb(db: Db): Promise<void>`

- [ ] **Step 1: Add dependencies and Docker Compose**

```bash
pnpm --filter @bcp/api add drizzle-orm pg
pnpm --filter @bcp/api add -D drizzle-kit @electric-sql/pglite @types/pg
```

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: bcp
      POSTGRES_PASSWORD: bcp
      POSTGRES_DB: bcp
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U bcp']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

`apps/api/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://bcp:bcp@localhost:5432/bcp' },
});
```

- [ ] **Step 2: Write the schema**

`apps/api/src/db/schema.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

const auditColumns = {
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const syncKind = pgEnum('sync_kind', ['catalog', 'event', 'pairings', 'lists']);
export const syncStatus = pgEnum('sync_status', ['queued', 'running', 'succeeded', 'failed']);
export const gameResult = pgEnum('game_result', ['a_win', 'b_win', 'draw']);
export const side = pgEnum('side', ['a', 'b']);

/** Primary keys are BCP ids throughout. */
export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    startDate: timestamptz('start_date').notNull(),
    endDate: timestamptz('end_date'),
    country: text('country'),
    city: text('city'),
    playerCount: integer('player_count').notNull(),
    /** Only event detail knows this; null for singles and for events only seen in the catalogue. */
    teamCount: integer('team_count'),
    isTeamEvent: boolean('is_team_event').notNull(),
    isOnline: boolean('is_online').notNull(),
    roundCount: integer('round_count').notNull(),
    ended: boolean('ended').notNull(),
    hideLists: boolean('hide_lists').notNull(),
    /** When event detail, teams and players were last fetched. Null = only seen in the catalogue. */
    lastSyncedAt: timestamptz('last_synced_at'),
    rawSummary: jsonb('raw_summary'),
    rawDetail: jsonb('raw_detail'),
    ...auditColumns,
  },
  (t) => [
    index('events_start_date_idx').on(t.startDate),
    index('events_player_count_idx').on(t.playerCount),
  ],
);

export const teams = pgTable(
  'teams',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    placing: integer('placing'),
    roundPoints: jsonb('round_points').$type<number[]>().notNull(),
    raw: jsonb('raw').notNull(),
    ...auditColumns,
  },
  (t) => [index('teams_event_idx').on(t.eventId)],
);

export const players = pgTable(
  'players',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** No FK: BCP may reference a team entry we never received. */
    teamId: text('team_id'),
    name: text('name').notNull(),
    faction: text('faction'),
    parentFaction: text('parent_faction'),
    placing: integer('placing'),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    draws: integer('draws').notNull(),
    dropped: boolean('dropped').notNull(),
    listId: text('list_id'),
    raw: jsonb('raw').notNull(),
    ...auditColumns,
  },
  (t) => [
    index('players_event_idx').on(t.eventId),
    index('players_event_faction_idx').on(t.eventId, t.faction),
    index('players_team_idx').on(t.teamId),
  ],
);

export const armyLists = pgTable('army_lists', {
  playerId: text('player_id')
    .primaryKey()
    .references(() => players.id, { onDelete: 'cascade' }),
  listId: text('list_id').notNull(),
  text: text('text'),
  raw: jsonb('raw').notNull(),
  fetchedAt: timestamptz('fetched_at').notNull().defaultNow(),
});

export const teamMatchups = pgTable(
  'team_matchups',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    tableNo: integer('table_no'),
    teamAId: text('team_a_id').notNull(),
    teamBId: text('team_b_id'),
    pointsA: real('points_a'),
    pointsB: real('points_b'),
    raw: jsonb('raw').notNull(),
    ...auditColumns,
  },
  (t) => [index('team_matchups_event_round_idx').on(t.eventId, t.round)],
);

export const games = pgTable(
  'games',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    tableNo: integer('table_no'),
    teamMatchupId: text('team_matchup_id'),
    playerAId: text('player_a_id').notNull(),
    playerBId: text('player_b_id'),
    vpA: real('vp_a'),
    vpB: real('vp_b'),
    primaryA: real('primary_a'),
    primaryB: real('primary_b'),
    secondaryA: real('secondary_a'),
    secondaryB: real('secondary_b'),
    gamePointsA: real('game_points_a'),
    gamePointsB: real('game_points_b'),
    firstTurn: side('first_turn'),
    result: gameResult('result'),
    raw: jsonb('raw').notNull(),
    ...auditColumns,
  },
  (t) => [
    index('games_event_round_idx').on(t.eventId, t.round),
    index('games_team_matchup_idx').on(t.teamMatchupId),
  ],
);

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: serial('id').primaryKey(),
    kind: syncKind('kind').notNull(),
    eventId: text('event_id'),
    params: jsonb('params').notNull(),
    status: syncStatus('status').notNull(),
    total: integer('total'),
    done: integer('done').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    error: text('error'),
    startedAt: timestamptz('started_at').notNull().defaultNow(),
    finishedAt: timestamptz('finished_at'),
  },
  (t) => [
    // At most one active run per kind and target; a second request gets the existing run.
    uniqueIndex('sync_runs_one_active_idx')
      .on(t.kind, sql`coalesce(${t.eventId}, '')`)
      .where(sql`${t.status} in ('queued', 'running')`),
    index('sync_runs_event_idx').on(t.eventId),
  ],
);

/** Single-row table holding the BCP login, so rotated refresh tokens survive restarts. */
export const bcpSession = pgTable(
  'bcp_session',
  {
    id: integer('id').primaryKey().default(1),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamptz('access_token_expires_at'),
    lastRefreshAt: timestamptz('last_refresh_at'),
    seedTokenHash: text('seed_token_hash'),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [check('bcp_session_singleton', sql`${t.id} = 1`)],
);
```

- [ ] **Step 3: Generate the first migration**

```bash
pnpm --filter @bcp/api db:generate --name init
```

Expected: `apps/api/drizzle/0000_init.sql` is created, containing `CREATE TABLE "events"` and the partial unique index `sync_runs_one_active_idx`.

- [ ] **Step 4: Write the DB clients**

`apps/api/src/db/client.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/** Driver-agnostic database handle: node-postgres in production, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function createDb(url: string) {
  const db = drizzle({ connection: url, schema });
  return {
    db: db as Db,
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
    close: () => db.$client.end(),
  };
}
```

`apps/api/src/db/test-db.ts`:

```ts
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { MIGRATIONS_DIR, type Db } from './client';
import * as schema from './schema';

/** An in-process Postgres with all migrations applied. Create one per test file. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db: db as Db, close: () => client.close() };
}

export async function resetDb(db: Db): Promise<void> {
  await db.execute(
    sql`truncate events, teams, players, army_lists, team_matchups, games, sync_runs, bcp_session restart identity cascade`,
  );
}
```

- [ ] **Step 5: Write the schema test**

`apps/api/src/db/schema.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './client';
import { events, syncRuns, teams } from './schema';
import { createTestDb, resetDb } from './test-db';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

const anEvent = {
  id: 'EVT1',
  name: 'Test Event',
  startDate: new Date('2026-03-28T09:00:00Z'),
  playerCount: 8,
  isTeamEvent: true,
  isOnline: false,
  roundCount: 2,
  ended: true,
  hideLists: false,
};

describe('database schema', () => {
  it('deletes an event’s teams when the event is deleted', async () => {
    await db.insert(events).values(anEvent);
    await db
      .insert(teams)
      .values({ id: 'T1', eventId: 'EVT1', name: 'A', roundPoints: [], raw: {} });

    await db.delete(events).where(eq(events.id, 'EVT1'));

    expect(await db.select().from(teams)).toEqual([]);
  });

  it('allows only one active sync run per kind and event', async () => {
    const run = { kind: 'lists' as const, eventId: 'EVT1', params: {}, status: 'running' as const };
    await db.insert(syncRuns).values(run);

    const duplicate = await db.insert(syncRuns).values(run).onConflictDoNothing().returning();
    expect(duplicate).toEqual([]);

    const finished = await db
      .insert(syncRuns)
      .values({ ...run, status: 'succeeded' })
      .returning();
    expect(finished).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run --project api src/db`
Expected: PASS, 2 tests. If `db as Db` fails to type-check in `client.ts`, check that `drizzle-orm` is 0.45.x (`pnpm --filter @bcp/api list drizzle-orm`).

- [ ] **Step 7: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): add Postgres schema, migrations and PGlite test database

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: BCP response schemas, mappers and sample fixtures

**Files:**

- Create: `apps/api/src/bcp/transport.ts`, `apps/api/src/bcp/raw.ts`, `apps/api/src/bcp/mappers.ts`
- Create: `fixtures/bcp/sample/**` (listed in Step 5)
- Test: `apps/api/src/bcp/mappers.test.ts`

**Interfaces:**

- Consumes: domain types from `@bcp/shared`; `BcpSchemaError` and `formatIssues`.
- Produces:
  - `interface BcpRequest { path: string; query?: Record<string, string | number | undefined> }`
  - `interface BcpTransport { get(request: BcpRequest): Promise<unknown> }`
  - `interface AccessTokenProvider { getAccessToken(): Promise<string | null>; refresh(): Promise<void> }`
  - `toNumberOrNull(value: unknown): number | null`
  - `parseBcp<S>(schema: S, data: unknown, endpoint: string): z.output<S>`
  - `parseItems<S>(schema: S, items: unknown[], endpoint: string): { parsed: z.output<S>; raw: unknown }[]`
  - The schemas `RawPageEnvelope`, `RawListEnvelope`, `RawEventSearchItem`, `RawEventDetail`, `RawPlayer`, `RawTeam`, `RawTeamPairing`, `RawPairing` and `RawArmyList`, each with a same-named type
  - `mapEventSearchItem`, `mapEventDetail`, `mapPlayer(raw, eventId)`, `mapTeam(raw, eventId)`, `mapTeamPairing(raw, eventId): TeamMatchup | null`, `mapPairing(raw, eventId): Game | null`, `mapArmyList`, `toGameResult(a, b)`

**How the BCP data is shaped** (confirmed against live data on 2026-09-23):

- Numbers arrive as numbers, as numeric strings, or as `""` when nothing was entered.
- Game results are `2` = win, `1` = draw, `0` = loss.
- A game's `metaData` stores each side's stats as `p1-<stat>` and `p2-<stat>`.
- A player's `teamPlayerId` is the id of the team's entry in that event. That's the same id `teamplayers` and team pairings use. A player's `teamId` is a different, organisation-level id; ignore it.

- [ ] **Step 1: Write the transport interfaces**

`apps/api/src/bcp/transport.ts`:

```ts
/** One GET against BCP's web API, e.g. { path: '/v1/events/X/players', query: { placings: 'true' } }. */
export interface BcpRequest {
  path: string;
  query?: Record<string, string | number | undefined>;
}

/** Anything that can answer a BcpRequest with parsed JSON: the real HTTP client or fixture files. */
export interface BcpTransport {
  get(request: BcpRequest): Promise<unknown>;
}

export interface AccessTokenProvider {
  /** The current access token, refreshing first if it is about to expire. Null = anonymous. */
  getAccessToken(): Promise<string | null>;
  /** Forces a refresh, e.g. after BCP answered 401. */
  refresh(): Promise<void>;
}
```

- [ ] **Step 2: Write the failing mapper tests**

`apps/api/src/bcp/mappers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BcpSchemaError } from '../errors';
import {
  mapArmyList,
  mapEventDetail,
  mapEventSearchItem,
  mapPairing,
  mapPlayer,
  mapTeam,
  mapTeamPairing,
} from './mappers';
import {
  parseBcp,
  parseItems,
  RawArmyList,
  RawEventDetail,
  RawEventSearchItem,
  RawPairing,
  RawPlayer,
  RawTeam,
  RawTeamPairing,
  toNumberOrNull,
} from './raw';

describe('toNumberOrNull', () => {
  it.each([
    [42, 42],
    ['17', 17],
    ['', null],
    [null, null],
    [undefined, null],
    ['n/a', null],
    [true, null],
  ])('%j → %j', (input, expected) => {
    expect(toNumberOrNull(input)).toBe(expected);
  });
});

describe('parseBcp', () => {
  it('throws BcpSchemaError naming the endpoint and field path', () => {
    const attempt = () => parseBcp(RawPlayer, { id: 'P1', placing: 'first' }, '/v1/players');
    expect(attempt).toThrow(BcpSchemaError);
    try {
      attempt();
    } catch (error) {
      expect((error as BcpSchemaError).details).toMatchObject({
        endpoint: '/v1/players',
        issues: [{ path: 'placing' }],
      });
    }
  });

  it('parseItems keeps the untouched raw object next to the parsed one', () => {
    const raw = { id: 'L1', armyListText: 'x', somethingNew: true };
    expect(parseItems(RawArmyList, [raw], '/v1/armylists')).toEqual([
      { parsed: { id: 'L1', armyListText: 'x' }, raw },
    ]);
  });
});

describe('mapEventSearchItem', () => {
  it('defaults missing counts and flags and trims the name', () => {
    const raw = parseBcp(
      RawEventSearchItem,
      { id: 'E1', name: '  Tiny RTT ', eventDate: '2026-04-12T10:00:00.000Z', eventEndDate: null },
      'test',
    );
    expect(mapEventSearchItem(raw)).toEqual({
      bcpId: 'E1',
      name: 'Tiny RTT',
      startDate: '2026-04-12T10:00:00.000Z',
      endDate: null,
      country: null,
      city: null,
      playerCount: 0,
      teamCount: null,
      isTeamEvent: false,
      isOnline: false,
      roundCount: 0,
      ended: false,
      hideLists: false,
    });
  });
});

describe('mapEventDetail', () => {
  it('reads nested location, format, status and flags', () => {
    const raw = parseBcp(
      RawEventDetail,
      {
        id: 'E1',
        name: 'Open',
        dates: { start: '2026-03-28T09:00:00.000Z', end: '2026-03-29T18:00:00.000Z' },
        location: { city: 'Springfield', country: 'United States' },
        format: { teamEvent: true },
        status: { ended: true, numberOfRounds: 5 },
        playerCounts: { total: 432 },
        teamPlayerCounts: { total: 108 },
        flags: { hideLists: true },
        isOnlineEvent: false,
      },
      'test',
    );
    expect(mapEventDetail(raw)).toMatchObject({
      city: 'Springfield',
      country: 'United States',
      isTeamEvent: true,
      ended: true,
      roundCount: 5,
      playerCount: 432,
      teamCount: 108,
      hideLists: true,
    });
  });

  it('leaves teamCount null for singles events', () => {
    const raw = parseBcp(
      RawEventDetail,
      {
        id: 'E2',
        name: 'GT',
        dates: { start: '2026-03-28T09:00:00.000Z' },
        format: { teamEvent: false },
        teamPlayerCounts: { total: 0 },
      },
      'test',
    );
    expect(mapEventDetail(raw).teamCount).toBeNull();
  });
});

describe('mapPlayer', () => {
  it('builds the name, faction and win/loss/draw record', () => {
    const raw = parseBcp(
      RawPlayer,
      {
        id: 'P1',
        user: { firstName: 'Ada', lastName: 'Archer' },
        teamPlayerId: 'T1',
        faction: { name: 'Blood Angels', parentFaction: { name: 'Space Marines' } },
        placing: 3,
        dropped: false,
        listId: 'L1',
        total_games: [
          { gameNum: 1, gameResult: 2, gamePoints: 15 },
          { gameNum: 2, gameResult: 1, gamePoints: 10 },
          { gameNum: 3, gameResult: 0, gamePoints: 4 },
          { gameNum: 4, gameResult: 2, gamePoints: 20 },
        ],
      },
      'test',
    );
    expect(mapPlayer(raw, 'E1')).toEqual({
      bcpId: 'P1',
      eventBcpId: 'E1',
      teamBcpId: 'T1',
      name: 'Ada Archer',
      faction: 'Blood Angels',
      parentFaction: 'Space Marines',
      placing: 3,
      wins: 2,
      losses: 1,
      draws: 1,
      dropped: false,
      listBcpId: 'L1',
    });
  });

  it('falls back to "Unknown player" when BCP hides the user', () => {
    const raw = parseBcp(RawPlayer, { id: 'P2', user: null }, 'test');
    expect(mapPlayer(raw, 'E1')).toMatchObject({ name: 'Unknown player', teamBcpId: null });
  });
});

describe('mapTeam', () => {
  it('orders round points by game number', () => {
    const raw = parseBcp(
      RawTeam,
      {
        id: 'T1',
        name: 'Alpha ',
        placing: 1,
        total_games: [
          { gameNum: 2, gameResult: 2, gamePoints: '24' },
          { gameNum: 1, gameResult: 2, gamePoints: 25 },
        ],
      },
      'test',
    );
    expect(mapTeam(raw, 'E1')).toEqual({
      bcpId: 'T1',
      eventBcpId: 'E1',
      name: 'Alpha',
      placing: 1,
      roundPoints: [25, 24],
    });
  });
});

describe('mapTeamPairing', () => {
  it('maps both teams and their points', () => {
    const raw = parseBcp(
      RawTeamPairing,
      {
        id: 'TP1',
        round: 1,
        table: 3,
        teamPlayer1: { id: 'T1', name: 'A' },
        teamPlayer2: { id: 'T2', name: 'B' },
        player1Game: { result: 2, points: 17 },
        player2Game: { result: 0, points: 3 },
      },
      'test',
    );
    expect(mapTeamPairing(raw, 'E1')).toEqual({
      bcpId: 'TP1',
      eventBcpId: 'E1',
      round: 1,
      tableNo: 3,
      teamABcpId: 'T1',
      teamBBcpId: 'T2',
      pointsA: 17,
      pointsB: 3,
    });
  });

  it('returns null when the first team is missing', () => {
    const raw = parseBcp(RawTeamPairing, { id: 'TP1', round: 1, teamPlayer1: null }, 'test');
    expect(mapTeamPairing(raw, 'E1')).toBeNull();
  });
});

describe('mapPairing', () => {
  const pairing = (
    metaData: Record<string, unknown>,
    player2: { id: string } | null = { id: 'P2' },
  ) =>
    parseBcp(
      RawPairing,
      {
        id: 'G1',
        round: 2,
        table: 7,
        teamPairingId: 'TP1',
        player1: { id: 'P1' },
        player2,
        metaData,
      },
      'test',
    );

  it('reads scores from metaData, including numeric strings', () => {
    const game = mapPairing(
      pairing({
        'p1-firstTurn': true,
        'p2-firstTurn': '',
        'p1-primary': '45',
        'p2-primary': '30',
        'p1-secondary': '35',
        'p2-secondary': '30',
        'p1-victoryPoints': 80,
        'p2-victoryPoints': 60,
        'p1-gamePoints': '15',
        'p2-gamePoints': '5',
        'p1-gameResult': '2',
        'p2-gameResult': '0',
      }),
      'E1',
    );
    expect(game).toEqual({
      bcpId: 'G1',
      eventBcpId: 'E1',
      round: 2,
      tableNo: 7,
      teamMatchupBcpId: 'TP1',
      playerABcpId: 'P1',
      playerBBcpId: 'P2',
      vpA: 80,
      vpB: 60,
      primaryA: 45,
      primaryB: 30,
      secondaryA: 35,
      secondaryB: 30,
      gamePointsA: 15,
      gamePointsB: 5,
      firstTurn: 'a',
      result: 'a_win',
    });
  });

  it('recognises draws, player-2 first turns and unplayed games', () => {
    expect(
      mapPairing(
        pairing({ 'p2-firstTurn': true, 'p1-gameResult': '1', 'p2-gameResult': '1' }),
        'E1',
      ),
    ).toMatchObject({ firstTurn: 'b', result: 'draw' });
    expect(mapPairing(pairing({}), 'E1')).toMatchObject({
      firstTurn: null,
      result: null,
      vpA: null,
    });
  });

  it('maps a bye (no player 2)', () => {
    expect(mapPairing(pairing({ 'p1-gameResult': 2 }, null), 'E1')).toMatchObject({
      playerBBcpId: null,
      result: 'a_win',
    });
  });
});

describe('mapArmyList', () => {
  it('treats blank text as no list', () => {
    expect(mapArmyList(parseBcp(RawArmyList, { id: 'L1', armyListText: '  ' }, 't'))).toEqual({
      bcpId: 'L1',
      text: null,
    });
    expect(mapArmyList(parseBcp(RawArmyList, { id: 'L2', armyListText: ' Orks\n' }, 't'))).toEqual({
      bcpId: 'L2',
      text: 'Orks',
    });
  });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `pnpm vitest run --project api src/bcp/mappers`
Expected: FAIL, because the modules `./mappers` and `./raw` do not exist.

- [ ] **Step 4: Implement the raw schemas and the mappers**

`apps/api/src/bcp/raw.ts`:

```ts
import { z } from 'zod';
import { BcpSchemaError } from '../errors';
import { formatIssues } from '../validation';

/**
 * Schemas for the parts of BCP's JSON we rely on. Unknown fields are ignored (and kept in
 * `raw` columns), so BCP adding fields never breaks us; removing or retyping one fails loudly.
 */

/** BCP sends numbers as numbers, numeric strings, or "" for "not entered". */
export function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const bcpNumber = z.unknown().transform(toNumberOrNull);

export const RawPageEnvelope = z.object({
  data: z.array(z.unknown()),
  nextKey: z.string().nullish(),
});

export const RawListEnvelope = z.object({ active: z.array(z.unknown()) });

export const RawEventSearchItem = z.object({
  id: z.string(),
  name: z.string(),
  eventDate: z.string(),
  eventEndDate: z.string().nullish(),
  country: z.string().nullish(),
  totalPlayers: z.number().nullish(),
  teamEvent: z.boolean().nullish(),
  isOnlineEvent: z.boolean().nullish(),
  numberOfRounds: z.number().nullish(),
  ended: z.boolean().nullish(),
  hideLists: z.boolean().nullish(),
});
export type RawEventSearchItem = z.output<typeof RawEventSearchItem>;

export const RawEventDetail = z.object({
  id: z.string(),
  name: z.string(),
  dates: z.object({ start: z.string(), end: z.string().nullish() }),
  location: z.object({ city: z.string().nullish(), country: z.string().nullish() }).nullish(),
  format: z.object({ teamEvent: z.boolean().nullish() }).nullish(),
  status: z
    .object({ ended: z.boolean().nullish(), numberOfRounds: z.number().nullish() })
    .nullish(),
  playerCounts: z.object({ total: z.number().nullish() }).nullish(),
  teamPlayerCounts: z.object({ total: z.number().nullish() }).nullish(),
  flags: z.object({ hideLists: z.boolean().nullish() }).nullish(),
  isOnlineEvent: z.boolean().nullish(),
});
export type RawEventDetail = z.output<typeof RawEventDetail>;

const RawGameSummary = z.object({
  gameNum: z.number(),
  gameResult: bcpNumber,
  gamePoints: bcpNumber,
});
export type RawGameSummary = z.output<typeof RawGameSummary>;

export const RawPlayer = z.object({
  id: z.string(),
  user: z.object({ firstName: z.string().nullish(), lastName: z.string().nullish() }).nullish(),
  teamPlayerId: z.string().nullish(),
  faction: z
    .object({ name: z.string(), parentFaction: z.object({ name: z.string() }).nullish() })
    .nullish(),
  placing: z.number().nullish(),
  dropped: z.boolean().nullish(),
  listId: z.string().nullish(),
  total_games: z.array(RawGameSummary).nullish(),
});
export type RawPlayer = z.output<typeof RawPlayer>;

export const RawTeam = z.object({
  id: z.string(),
  name: z.string(),
  placing: z.number().nullish(),
  total_games: z.array(RawGameSummary).nullish(),
});
export type RawTeam = z.output<typeof RawTeam>;

const RawSideResult = z.object({ result: bcpNumber, points: bcpNumber }).nullish();

export const RawTeamPairing = z.object({
  id: z.string(),
  round: z.number(),
  table: z.number().nullish(),
  teamPlayer1: z.object({ id: z.string() }).nullish(),
  teamPlayer2: z.object({ id: z.string() }).nullish(),
  player1Game: RawSideResult,
  player2Game: RawSideResult,
});
export type RawTeamPairing = z.output<typeof RawTeamPairing>;

export const RawPairing = z.object({
  id: z.string(),
  round: z.number(),
  table: z.number().nullish(),
  teamPairingId: z.string().nullish(),
  player1: z.object({ id: z.string() }).nullish(),
  player2: z.object({ id: z.string() }).nullish(),
  metaData: z.record(z.string(), z.unknown()).nullish(),
});
export type RawPairing = z.output<typeof RawPairing>;

export const RawArmyList = z.object({
  id: z.string(),
  armyListText: z.string().nullish(),
});
export type RawArmyList = z.output<typeof RawArmyList>;

export function parseBcp<S extends z.ZodType>(
  schema: S,
  data: unknown,
  endpoint: string,
): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new BcpSchemaError(endpoint, formatIssues(result.error));
  return result.data;
}

/** Parses each item separately so errors name the item, and keeps each item's original JSON. */
export function parseItems<S extends z.ZodType>(
  schema: S,
  items: unknown[],
  endpoint: string,
): { parsed: z.output<S>; raw: unknown }[] {
  return items.map((raw, index) => ({
    parsed: parseBcp(schema, raw, `${endpoint}[${index}]`),
    raw,
  }));
}
```

`apps/api/src/bcp/mappers.ts`:

```ts
import type {
  ArmyList,
  EventSummary,
  Game,
  GameResult,
  Player,
  Side,
  Team,
  TeamMatchup,
} from '@bcp/shared';
import {
  toNumberOrNull,
  type RawArmyList,
  type RawEventDetail,
  type RawEventSearchItem,
  type RawGameSummary,
  type RawPairing,
  type RawPlayer,
  type RawTeam,
  type RawTeamPairing,
} from './raw';

/** BCP's numeric game results. */
const BCP_WIN = 2;
const BCP_DRAW = 1;
const BCP_LOSS = 0;

const toIso = (value: string): string => new Date(value).toISOString();

export function mapEventSearchItem(raw: RawEventSearchItem): EventSummary {
  return {
    bcpId: raw.id,
    name: raw.name.trim(),
    startDate: toIso(raw.eventDate),
    endDate: raw.eventEndDate ? toIso(raw.eventEndDate) : null,
    country: raw.country ?? null,
    city: null, // search results carry no city or team count; event detail fills them in
    playerCount: raw.totalPlayers ?? 0,
    teamCount: null,
    isTeamEvent: raw.teamEvent ?? false,
    isOnline: raw.isOnlineEvent ?? false,
    roundCount: raw.numberOfRounds ?? 0,
    ended: raw.ended ?? false,
    hideLists: raw.hideLists ?? false,
  };
}

export function mapEventDetail(raw: RawEventDetail): EventSummary {
  const isTeamEvent = raw.format?.teamEvent ?? false;
  return {
    bcpId: raw.id,
    name: raw.name.trim(),
    startDate: toIso(raw.dates.start),
    endDate: raw.dates.end ? toIso(raw.dates.end) : null,
    country: raw.location?.country ?? null,
    city: raw.location?.city ?? null,
    playerCount: raw.playerCounts?.total ?? 0,
    teamCount: isTeamEvent ? (raw.teamPlayerCounts?.total ?? null) : null,
    isTeamEvent,
    isOnline: raw.isOnlineEvent ?? false,
    roundCount: raw.status?.numberOfRounds ?? 0,
    ended: raw.status?.ended ?? false,
    hideLists: raw.flags?.hideLists ?? false,
  };
}

function tallyRecord(games: RawGameSummary[] | null | undefined) {
  const record = { wins: 0, losses: 0, draws: 0 };
  for (const game of games ?? []) {
    if (game.gameResult === BCP_WIN) record.wins += 1;
    else if (game.gameResult === BCP_DRAW) record.draws += 1;
    else if (game.gameResult === BCP_LOSS) record.losses += 1;
  }
  return record;
}

export function mapPlayer(raw: RawPlayer, eventId: string): Player {
  const name = [raw.user?.firstName, raw.user?.lastName].filter(Boolean).join(' ').trim();
  return {
    bcpId: raw.id,
    eventBcpId: eventId,
    teamBcpId: raw.teamPlayerId ?? null,
    name: name || 'Unknown player',
    faction: raw.faction?.name ?? null,
    parentFaction: raw.faction?.parentFaction?.name ?? null,
    placing: raw.placing ?? null,
    ...tallyRecord(raw.total_games),
    dropped: raw.dropped ?? false,
    listBcpId: raw.listId ?? null,
  };
}

export function mapTeam(raw: RawTeam, eventId: string): Team {
  const games = [...(raw.total_games ?? [])].sort((a, b) => a.gameNum - b.gameNum);
  return {
    bcpId: raw.id,
    eventBcpId: eventId,
    name: raw.name.trim(),
    placing: raw.placing ?? null,
    roundPoints: games.map((game) => game.gamePoints ?? 0),
  };
}

export function mapTeamPairing(raw: RawTeamPairing, eventId: string): TeamMatchup | null {
  if (!raw.teamPlayer1) return null;
  return {
    bcpId: raw.id,
    eventBcpId: eventId,
    round: raw.round,
    tableNo: raw.table ?? null,
    teamABcpId: raw.teamPlayer1.id,
    teamBBcpId: raw.teamPlayer2?.id ?? null,
    pointsA: raw.player1Game?.points ?? null,
    pointsB: raw.player2Game?.points ?? null,
  };
}

export function toGameResult(a: number | null, b: number | null): GameResult | null {
  if (a === BCP_WIN) return 'a_win';
  if (b === BCP_WIN) return 'b_win';
  if (a === BCP_DRAW && b === BCP_DRAW) return 'draw';
  return null;
}

function firstTurn(meta: Record<string, unknown>): Side | null {
  if (meta['p1-firstTurn'] === true) return 'a';
  if (meta['p2-firstTurn'] === true) return 'b';
  return null;
}

export function mapPairing(raw: RawPairing, eventId: string): Game | null {
  if (!raw.player1) return null;
  const meta = raw.metaData ?? {};
  const stat = (player: 1 | 2, name: string) => toNumberOrNull(meta[`p${player}-${name}`]);
  return {
    bcpId: raw.id,
    eventBcpId: eventId,
    round: raw.round,
    tableNo: raw.table ?? null,
    teamMatchupBcpId: raw.teamPairingId ?? null,
    playerABcpId: raw.player1.id,
    playerBBcpId: raw.player2?.id ?? null,
    vpA: stat(1, 'victoryPoints'),
    vpB: stat(2, 'victoryPoints'),
    primaryA: stat(1, 'primary'),
    primaryB: stat(2, 'primary'),
    secondaryA: stat(1, 'secondary'),
    secondaryB: stat(2, 'secondary'),
    gamePointsA: stat(1, 'gamePoints'),
    gamePointsB: stat(2, 'gamePoints'),
    firstTurn: firstTurn(meta),
    result: toGameResult(stat(1, 'gameResult'), stat(2, 'gameResult')),
  };
}

export function mapArmyList(raw: RawArmyList): ArmyList {
  const text = raw.armyListText?.trim();
  return { bcpId: raw.id, text: text === undefined || text === '' ? null : text };
}
```

- [ ] **Step 5: Add the sample fixtures**

These hand-written files copy the real BCP response shapes. They describe a two-round team event with 4 teams of 2 players (Alpha, Bravo, Charlie, Delta). Team points are the sum of the players' game points. Round 1's individual games are split over two pages to exercise paging. Later plans' analysis tests rely on these exact numbers, so don't change them.

`fixtures/bcp/sample/events/search.first.json`:

```json
{
  "data": [
    {
      "id": "EVTSINGLE01",
      "name": "Sample Singles GT",
      "eventDate": "2026-04-10T08:00:00.000Z",
      "eventEndDate": "2026-04-11T18:00:00.000Z",
      "country": "Germany",
      "totalPlayers": 64,
      "teamEvent": false,
      "isOnlineEvent": false,
      "numberOfRounds": 5,
      "ended": true,
      "hideLists": false,
      "gameType": 1
    },
    {
      "id": "EVTTEAM0001",
      "name": "Sample Team Open",
      "eventDate": "2026-03-28T09:00:00.000Z",
      "eventEndDate": "2026-03-29T18:00:00.000Z",
      "country": "United States",
      "totalPlayers": 8,
      "teamEvent": true,
      "isOnlineEvent": false,
      "numberOfRounds": 2,
      "ended": true,
      "hideLists": false,
      "gameType": 1
    }
  ],
  "nextKey": "page-2"
}
```

`fixtures/bcp/sample/events/search.page-2.json`:

```json
{
  "data": [
    {
      "id": "EVTSMALL001",
      "name": "  Tiny RTT  ",
      "eventDate": "2026-04-12T10:00:00.000Z",
      "eventEndDate": null,
      "country": null,
      "numberOfRounds": 3,
      "ended": false,
      "gameType": 1
    }
  ],
  "nextKey": null
}
```

`fixtures/bcp/sample/events/EVTTEAM0001/event.json`:

```json
{
  "id": "EVTTEAM0001",
  "name": "Sample Team Open",
  "dates": { "start": "2026-03-28T09:00:00.000Z", "end": "2026-03-29T18:00:00.000Z" },
  "location": { "city": "Springfield", "country": "United States" },
  "format": { "teamEvent": true, "pairingStyle": "swiss" },
  "status": { "started": true, "ended": true, "currentRound": 2, "numberOfRounds": 2 },
  "playerCounts": { "total": 8 },
  "teamPlayerCounts": { "total": 4 },
  "flags": { "hideLists": false },
  "isOnlineEvent": false
}
```

`fixtures/bcp/sample/events/EVTTEAM0001/teams.json`:

```json
{
  "active": [
    {
      "id": "TM-ALPHA",
      "name": "Alpha Squad",
      "placing": 2,
      "total_games": [
        { "gameNum": 1, "gameResult": 2, "gamePoints": 25 },
        { "gameNum": 2, "gameResult": 0, "gamePoints": 16 }
      ]
    },
    {
      "id": "TM-BRAVO",
      "name": "Bravo Company",
      "placing": 3,
      "total_games": [
        { "gameNum": 1, "gameResult": 0, "gamePoints": 15 },
        { "gameNum": 2, "gameResult": 2, "gamePoints": 26 }
      ]
    },
    {
      "id": "TM-CHARLIE",
      "name": "Charlie Wing",
      "placing": 1,
      "total_games": [
        { "gameNum": 1, "gameResult": 2, "gamePoints": 24 },
        { "gameNum": 2, "gameResult": 2, "gamePoints": 24 }
      ]
    },
    {
      "id": "TM-DELTA",
      "name": "Delta Force",
      "placing": 4,
      "total_games": [
        { "gameNum": 1, "gameResult": 0, "gamePoints": 16 },
        { "gameNum": 2, "gameResult": 0, "gamePoints": 14 }
      ]
    }
  ],
  "deleted": []
}
```

`fixtures/bcp/sample/events/EVTTEAM0001/players.json`:

```json
{
  "active": [
    {
      "id": "PL-ADA",
      "user": { "id": "US-ADA", "firstName": "Ada", "lastName": "Archer" },
      "teamPlayerId": "TM-ALPHA",
      "faction": { "name": "Space Marines", "parentFaction": { "name": "Space Marines" } },
      "placing": 2,
      "dropped": false,
      "listId": "LS-ADA",
      "total_games": [
        { "gameNum": 1, "gameResult": 2, "gamePoints": 15 },
        { "gameNum": 2, "gameResult": 2, "gamePoints": 13 }
      ]
    },
    {
      "id": "PL-BEN",
      "user": { "id": "US-BEN", "firstName": "Ben", "lastName": "Baker" },
      "teamPlayerId": "TM-ALPHA",
      "faction": { "name": "Aeldari", "parentFaction": { "name": "Aeldari" } },
      "placing": 6,
      "dropped": false,
      "listId": "LS-BEN",
      "total_games": [
        { "gameNum": 1, "gameResult": 1, "gamePoints": 10 },
        { "gameNum": 2, "gameResult": 0, "gamePoints": 3 }
      ]
    },
    {
      "id": "PL-CARA",
      "user": { "id": "US-CARA", "firstName": "Cara", "lastName": "Cole" },
      "teamPlayerId": "TM-BRAVO",
      "faction": { "name": "Orks", "parentFaction": { "name": "Orks" } },
      "placing": 3,
      "dropped": false,
      "listId": "LS-CARA",
      "total_games": [
        { "gameNum": 1, "gameResult": 0, "gamePoints": 5 },
        { "gameNum": 2, "gameResult": 2, "gamePoints": 16 }
      ]
    },
    {
      "id": "PL-DAN",
      "user": { "id": "US-DAN", "firstName": "Dan", "lastName": "Drake" },
      "teamPlayerId": "TM-BRAVO",
      "faction": { "name": "Necrons", "parentFaction": { "name": "Necrons" } },
      "placing": 5,
      "dropped": false,
      "listId": "LS-DAN",
      "total_games": [
        { "gameNum": 1, "gameResult": 1, "gamePoints": 10 },
        { "gameNum": 2, "gameResult": 1, "gamePoints": 10 }
      ]
    },
    {
      "id": "PL-EVE",
      "user": { "id": "US-EVE", "firstName": "Eve", "lastName": "Evans" },
      "teamPlayerId": "TM-CHARLIE",
      "faction": { "name": "Space Marines", "parentFaction": { "name": "Space Marines" } },
      "placing": 8,
      "dropped": false,
      "listId": "LS-EVE",
      "total_games": [
        { "gameNum": 1, "gameResult": 0, "gamePoints": 4 },
        { "gameNum": 2, "gameResult": 0, "gamePoints": 7 }
      ]
    },
    {
      "id": "PL-FINN",
      "user": { "id": "US-FINN", "firstName": "Finn", "lastName": "Ford" },
      "teamPlayerId": "TM-CHARLIE",
      "faction": { "name": "Orks", "parentFaction": { "name": "Orks" } },
      "placing": 1,
      "dropped": false,
      "listId": "LS-FINN",
      "total_games": [
        { "gameNum": 1, "gameResult": 2, "gamePoints": 20 },
        { "gameNum": 2, "gameResult": 2, "gamePoints": 17 }
      ]
    },
    {
      "id": "PL-GIA",
      "user": { "id": "US-GIA", "firstName": "Gia", "lastName": "Grant" },
      "teamPlayerId": "TM-DELTA",
      "faction": { "name": "Aeldari", "parentFaction": { "name": "Aeldari" } },
      "placing": 4,
      "dropped": false,
      "listId": "LS-GIA",
      "total_games": [
        { "gameNum": 1, "gameResult": 2, "gamePoints": 16 },
        { "gameNum": 2, "gameResult": 0, "gamePoints": 4 }
      ]
    },
    {
      "id": "PL-HAL",
      "user": { "id": "US-HAL", "firstName": "Hal", "lastName": "Hayes" },
      "teamPlayerId": "TM-DELTA",
      "faction": { "name": "Necrons", "parentFaction": { "name": "Necrons" } },
      "placing": 7,
      "dropped": false,
      "listId": null,
      "total_games": [
        { "gameNum": 1, "gameResult": 0, "gamePoints": 0 },
        { "gameNum": 2, "gameResult": 1, "gamePoints": 10 }
      ]
    }
  ],
  "deleted": []
}
```

`fixtures/bcp/sample/events/EVTTEAM0001/team-pairings.round-1.json`:

```json
{
  "active": [
    {
      "id": "TP-R1-1",
      "round": 1,
      "table": 1,
      "pairingType": "TeamPairing",
      "teamPlayer1": { "id": "TM-ALPHA", "name": "Alpha Squad" },
      "teamPlayer2": { "id": "TM-BRAVO", "name": "Bravo Company" },
      "player1Game": { "result": 2, "points": 25 },
      "player2Game": { "result": 0, "points": 15 }
    },
    {
      "id": "TP-R1-2",
      "round": 1,
      "table": 2,
      "pairingType": "TeamPairing",
      "teamPlayer1": { "id": "TM-CHARLIE", "name": "Charlie Wing" },
      "teamPlayer2": { "id": "TM-DELTA", "name": "Delta Force" },
      "player1Game": { "result": 2, "points": 24 },
      "player2Game": { "result": 0, "points": 16 }
    }
  ],
  "deleted": []
}
```

`fixtures/bcp/sample/events/EVTTEAM0001/team-pairings.round-2.json`:

```json
{
  "active": [
    {
      "id": "TP-R2-1",
      "round": 2,
      "table": 1,
      "pairingType": "TeamPairing",
      "teamPlayer1": { "id": "TM-ALPHA", "name": "Alpha Squad" },
      "teamPlayer2": { "id": "TM-CHARLIE", "name": "Charlie Wing" },
      "player1Game": { "result": 0, "points": 16 },
      "player2Game": { "result": 2, "points": 24 }
    },
    {
      "id": "TP-R2-2",
      "round": 2,
      "table": 2,
      "pairingType": "TeamPairing",
      "teamPlayer1": { "id": "TM-BRAVO", "name": "Bravo Company" },
      "teamPlayer2": { "id": "TM-DELTA", "name": "Delta Force" },
      "player1Game": { "result": 2, "points": 26 },
      "player2Game": { "result": 0, "points": 14 }
    }
  ],
  "deleted": []
}
```

`fixtures/bcp/sample/events/EVTTEAM0001/pairings.round-1.first.json`:

```json
{
  "data": [
    {
      "id": "GM-R1-1",
      "round": 1,
      "table": 1,
      "pairingType": "Pairing",
      "teamPairingId": "TP-R1-1",
      "player1": { "id": "PL-ADA", "firstName": "Ada", "lastName": "Archer" },
      "player2": { "id": "PL-CARA", "firstName": "Cara", "lastName": "Cole" },
      "metaData": {
        "p1-firstTurn": true,
        "p2-firstTurn": "",
        "p1-primary": "45",
        "p2-primary": "30",
        "p1-secondary": "35",
        "p2-secondary": "30",
        "p1-victoryPoints": 80,
        "p2-victoryPoints": 60,
        "p1-gamePoints": "15",
        "p2-gamePoints": "5",
        "p1-gameResult": "2",
        "p2-gameResult": "0"
      }
    },
    {
      "id": "GM-R1-2",
      "round": 1,
      "table": 2,
      "pairingType": "Pairing",
      "teamPairingId": "TP-R1-1",
      "player1": { "id": "PL-BEN", "firstName": "Ben", "lastName": "Baker" },
      "player2": { "id": "PL-DAN", "firstName": "Dan", "lastName": "Drake" },
      "metaData": {
        "p1-firstTurn": "",
        "p2-firstTurn": true,
        "p1-primary": "40",
        "p2-primary": "40",
        "p1-secondary": "30",
        "p2-secondary": "30",
        "p1-victoryPoints": 70,
        "p2-victoryPoints": 70,
        "p1-gamePoints": "10",
        "p2-gamePoints": "10",
        "p1-gameResult": "1",
        "p2-gameResult": "1"
      }
    }
  ],
  "nextKey": "r1-page-2"
}
```

`fixtures/bcp/sample/events/EVTTEAM0001/pairings.round-1.r1-page-2.json`:

```json
{
  "data": [
    {
      "id": "GM-R1-3",
      "round": 1,
      "table": 3,
      "pairingType": "Pairing",
      "teamPairingId": "TP-R1-2",
      "player1": { "id": "PL-EVE", "firstName": "Eve", "lastName": "Evans" },
      "player2": { "id": "PL-GIA", "firstName": "Gia", "lastName": "Grant" },
      "metaData": {
        "p1-firstTurn": true,
        "p2-firstTurn": "",
        "p1-primary": "25",
        "p2-primary": "45",
        "p1-secondary": "25",
        "p2-secondary": "40",
        "p1-victoryPoints": 50,
        "p2-victoryPoints": 85,
        "p1-gamePoints": "4",
        "p2-gamePoints": "16",
        "p1-gameResult": "0",
        "p2-gameResult": "2"
      }
    },
    {
      "id": "GM-R1-4",
      "round": 1,
      "table": 4,
      "pairingType": "Pairing",
      "teamPairingId": "TP-R1-2",
      "player1": { "id": "PL-FINN", "firstName": "Finn", "lastName": "Ford" },
      "player2": { "id": "PL-HAL", "firstName": "Hal", "lastName": "Hayes" },
      "metaData": {
        "p1-firstTurn": "",
        "p2-firstTurn": "",
        "p1-primary": "50",
        "p2-primary": "20",
        "p1-secondary": "40",
        "p2-secondary": "20",
        "p1-victoryPoints": 90,
        "p2-victoryPoints": 40,
        "p1-gamePoints": "20",
        "p2-gamePoints": "0",
        "p1-gameResult": "2",
        "p2-gameResult": "0"
      }
    }
  ],
  "nextKey": null
}
```

`fixtures/bcp/sample/events/EVTTEAM0001/pairings.round-2.first.json`:

```json
{
  "data": [
    {
      "id": "GM-R2-1",
      "round": 2,
      "table": 1,
      "pairingType": "Pairing",
      "teamPairingId": "TP-R2-1",
      "player1": { "id": "PL-ADA", "firstName": "Ada", "lastName": "Archer" },
      "player2": { "id": "PL-EVE", "firstName": "Eve", "lastName": "Evans" },
      "metaData": {
        "p1-firstTurn": "",
        "p2-firstTurn": true,
        "p1-primary": "40",
        "p2-primary": "35",
        "p1-secondary": "35",
        "p2-secondary": "30",
        "p1-victoryPoints": 75,
        "p2-victoryPoints": 65,
        "p1-gamePoints": "13",
        "p2-gamePoints": "7",
        "p1-gameResult": "2",
        "p2-gameResult": "0"
      }
    },
    {
      "id": "GM-R2-2",
      "round": 2,
      "table": 2,
      "pairingType": "Pairing",
      "teamPairingId": "TP-R2-1",
      "player1": { "id": "PL-BEN", "firstName": "Ben", "lastName": "Baker" },
      "player2": { "id": "PL-FINN", "firstName": "Finn", "lastName": "Ford" },
      "metaData": {
        "p1-firstTurn": true,
        "p2-firstTurn": "",
        "p1-primary": "30",
        "p2-primary": "45",
        "p1-secondary": "25",
        "p2-secondary": "35",
        "p1-victoryPoints": 55,
        "p2-victoryPoints": 80,
        "p1-gamePoints": "3",
        "p2-gamePoints": "17",
        "p1-gameResult": "0",
        "p2-gameResult": "2"
      }
    },
    {
      "id": "GM-R2-3",
      "round": 2,
      "table": 3,
      "pairingType": "Pairing",
      "teamPairingId": "TP-R2-2",
      "player1": { "id": "PL-CARA", "firstName": "Cara", "lastName": "Cole" },
      "player2": { "id": "PL-GIA", "firstName": "Gia", "lastName": "Grant" },
      "metaData": {
        "p1-firstTurn": true,
        "p2-firstTurn": "",
        "p1-primary": "48",
        "p2-primary": "32",
        "p1-secondary": "40",
        "p2-secondary": "30",
        "p1-victoryPoints": 88,
        "p2-victoryPoints": 62,
        "p1-gamePoints": "16",
        "p2-gamePoints": "4",
        "p1-gameResult": "2",
        "p2-gameResult": "0"
      }
    },
    {
      "id": "GM-R2-4",
      "round": 2,
      "table": 4,
      "pairingType": "Pairing",
      "teamPairingId": "TP-R2-2",
      "player1": { "id": "PL-DAN", "firstName": "Dan", "lastName": "Drake" },
      "player2": { "id": "PL-HAL", "firstName": "Hal", "lastName": "Hayes" },
      "metaData": {
        "p1-firstTurn": "",
        "p2-firstTurn": true,
        "p1-primary": "30",
        "p2-primary": "30",
        "p1-secondary": "30",
        "p2-secondary": "30",
        "p1-victoryPoints": 60,
        "p2-victoryPoints": 60,
        "p1-gamePoints": "10",
        "p2-gamePoints": "10",
        "p1-gameResult": "1",
        "p2-gameResult": "1"
      }
    }
  ],
  "nextKey": null
}
```

Army lists: create one file per list, `fixtures/bcp/sample/armylists/<id>.json`:

| File           | `armyListText`                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `LS-ADA.json`  | `"Space Marines – Gladius Task Force\n\nCaptain (80 pts)\nIntercessor Squad x10 (160 pts)"`    |
| `LS-BEN.json`  | `"Aeldari – Battle Host\n\nFarseer (70 pts)\nGuardian Defenders x10 (100 pts)"`                |
| `LS-CARA.json` | `"Orks – War Horde\n\nWarboss (65 pts)\nBoyz x20 (170 pts)"`                                   |
| `LS-DAN.json`  | `"Necrons – Awakened Dynasty\n\nOverlord (85 pts)\nNecron Warriors x20 (200 pts)"`             |
| `LS-EVE.json`  | `"Space Marines – Firestorm Assault Force\n\nLieutenant (65 pts)\nInfernus Squad x5 (90 pts)"` |
| `LS-FINN.json` | `"Orks – Kult of Speed\n\nWarboss on Warbike (80 pts)\nWarbikers x6 (140 pts)"`                |
| `LS-GIA.json`  | `"Aeldari – Aspect Host\n\nAutarch (75 pts)\nDire Avengers x5 (80 pts)"`                       |

Each file has the shape `{ "id": "<id without .json>", "armyListText": "<text from the table>" }`. For example, `fixtures/bcp/sample/armylists/LS-ADA.json`:

```json
{
  "id": "LS-ADA",
  "armyListText": "Space Marines – Gladius Task Force\n\nCaptain (80 pts)\nIntercessor Squad x10 (160 pts)"
}
```

(PL-HAL has `listId: null` on purpose, so there's no `LS-HAL.json`.)

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm vitest run --project api src/bcp/mappers`
Expected: PASS, all tests in `mappers.test.ts`.

- [ ] **Step 7: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): add BCP response schemas, mappers and sample fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rate limiter and HTTP transport

**Files:**

- Create: `apps/api/src/bcp/rate-limiter.ts`, `apps/api/src/bcp/http-transport.ts`
- Test: `apps/api/src/bcp/rate-limiter.test.ts`, `apps/api/src/bcp/http-transport.test.ts`

**Interfaces:**

- Consumes: `BcpRequest`, `BcpTransport`, `AccessTokenProvider` (Task 4); the error classes (Task 2); `Logger`.
- Produces:
  - `new RateLimiter({ requestsPerSecond, maxConcurrency })` with `.run<T>(task: () => Promise<T>): Promise<T>`
  - `new HttpTransport({ baseUrl, timeoutMs, maxAttempts, limiter, auth, logger, fetch? })`
  - `buildUrl(baseUrl, request): URL`
  - `retryDelayMs(attempt, retryAfterHeader, random?): number`
  - `parseRetryAfterSeconds(header): number | null`

- [ ] **Step 1: Write the failing rate-limiter tests**

`apps/api/src/bcp/rate-limiter.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './rate-limiter';

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('RateLimiter', () => {
  it('spaces task starts by 1 / requestsPerSecond', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 2, maxConcurrency: 10 });
    const starts: number[] = [];
    const all = Promise.all(
      [1, 2, 3].map(() =>
        limiter.run(() => {
          starts.push(Date.now());
          return Promise.resolve();
        }),
      ),
    );
    await vi.runAllTimersAsync();
    await all;
    expect(starts).toEqual([0, 500, 1000]);
  });

  it('never runs more than maxConcurrency tasks at once', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 1000, maxConcurrency: 1 });
    const { promise: firstBlocks, resolve: releaseFirst } = Promise.withResolvers<void>();
    const order: string[] = [];

    const first = limiter.run(async () => {
      order.push('first:start');
      await firstBlocks;
      order.push('first:end');
    });
    const second = limiter.run(() => {
      order.push('second:start');
      return Promise.resolve();
    });

    await vi.runAllTimersAsync();
    expect(order).toEqual(['first:start']);

    releaseFirst();
    await vi.runAllTimersAsync();
    await Promise.all([first, second]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('frees the slot when a task throws', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 1000, maxConcurrency: 1 });
    const failing = limiter.run(() => Promise.reject(new Error('boom')));
    const assertion = expect(failing).rejects.toThrow('boom');
    await vi.runAllTimersAsync();
    await assertion;

    const next = limiter.run(() => Promise.resolve('ok'));
    await vi.runAllTimersAsync();
    await expect(next).resolves.toBe('ok');
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm vitest run --project api src/bcp/rate-limiter`
Expected: FAIL, because the module `./rate-limiter` does not exist.

- [ ] **Step 3: Implement the rate limiter**

`apps/api/src/bcp/rate-limiter.ts`:

```ts
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Limits both how often tasks start (requestsPerSecond) and how many run at once
 * (maxConcurrency). Keeps our load on BCP polite no matter how many syncs run.
 */
export class RateLimiter {
  readonly #intervalMs: number;
  readonly #maxConcurrency: number;
  #nextStartAt = 0;
  #active = 0;
  readonly #waiting: (() => void)[] = [];

  constructor(options: { requestsPerSecond: number; maxConcurrency: number }) {
    this.#intervalMs = 1000 / options.requestsPerSecond;
    this.#maxConcurrency = options.maxConcurrency;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.#acquireSlot();
    try {
      const waitMs = this.#reserveStartTime();
      if (waitMs > 0) await sleep(waitMs);
      return await task();
    } finally {
      this.#releaseSlot();
    }
  }

  #acquireSlot(): Promise<void> {
    if (this.#active < this.#maxConcurrency) {
      this.#active += 1;
      return Promise.resolve();
    }
    // The slot is handed over directly by #releaseSlot, so #active stays unchanged.
    return new Promise((resolve) => this.#waiting.push(resolve));
  }

  #releaseSlot(): void {
    const next = this.#waiting.shift();
    if (next) next();
    else this.#active -= 1;
  }

  /** Books the next free start time and returns how long to wait for it. */
  #reserveStartTime(): number {
    const now = Date.now();
    const startAt = Math.max(now, this.#nextStartAt);
    this.#nextStartAt = startAt + this.#intervalMs;
    return startAt - now;
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run --project api src/bcp/rate-limiter`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing HTTP transport tests**

`apps/api/src/bcp/http-transport.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BcpAuthError, BcpRateLimitedError, BcpUnavailableError, NotFoundError } from '../errors';
import { silentLogger } from '../test/helpers';
import { buildUrl, HttpTransport, retryDelayMs } from './http-transport';
import { RateLimiter } from './rate-limiter';
import type { AccessTokenProvider } from './transport';

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});
afterEach(() => {
  vi.useRealTimers();
});

const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);

function makeTransport(
  fetchMock: typeof fetch,
  auth: AccessTokenProvider | null = null,
  maxAttempts = 3,
) {
  return new HttpTransport({
    baseUrl: 'https://bcp.test',
    timeoutMs: 1000,
    maxAttempts,
    limiter: new RateLimiter({ requestsPerSecond: 1000, maxConcurrency: 5 }),
    auth,
    logger: silentLogger,
    fetch: fetchMock,
  });
}

/** Runs a transport call while fast-forwarding the fake timers used for backoff. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const result = await settled;
  if (result.ok) return result.value;
  throw result.error;
}

describe('buildUrl', () => {
  it('skips undefined query values', () => {
    const url = buildUrl('https://bcp.test', {
      path: '/v1/events',
      query: { limit: 100, nextKey: undefined, gameType: 1 },
    });
    expect(url.toString()).toBe('https://bcp.test/v1/events?limit=100&gameType=1');
  });
});

describe('retryDelayMs', () => {
  it('honours Retry-After seconds', () => {
    expect(retryDelayMs(1, '7', () => 0)).toBe(7000);
  });
  it('backs off exponentially with jitter otherwise', () => {
    expect(retryDelayMs(1, null, () => 0)).toBe(500);
    expect(retryDelayMs(3, null, () => 1)).toBe(2250);
  });
});

describe('HttpTransport', () => {
  it('sends BCP headers and the access token, and returns parsed JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ hello: 'bcp' }));
    const auth = { getAccessToken: () => Promise.resolve('tok'), refresh: vi.fn() };

    const body = await settle(makeTransport(fetchMock, auth).get({ path: '/v1/x' }));

    expect(body).toEqual({ hello: 'bcp' });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({
      'client-id': 'web-app',
      env: 'bcp',
      Authorization: 'Bearer tok',
    });
  });

  it('retries 5xx responses and network errors, then succeeds', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, { status: 503 }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json({ ok: true }));

    await expect(settle(makeTransport(fetchMock).get({ path: '/v1/x' }))).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up with BcpRateLimitedError after repeated 429s', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({}, { status: 429, headers: { 'retry-after': '2' } }));

    const error = await settle(makeTransport(fetchMock).get({ path: '/v1/x' })).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(BcpRateLimitedError);
    expect((error as BcpRateLimitedError).retryAfterSeconds).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up with BcpUnavailableError after repeated 5xx', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({}, { status: 500 }));
    await expect(settle(makeTransport(fetchMock).get({ path: '/v1/x' }))).rejects.toBeInstanceOf(
      BcpUnavailableError,
    );
  });

  it('maps 404 to NotFoundError without retrying', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({}, { status: 404 }));
    await expect(settle(makeTransport(fetchMock).get({ path: '/v1/x' }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token once on 401 and retries with the new one', async () => {
    let token = 'old';
    const auth: AccessTokenProvider = {
      getAccessToken: () => Promise.resolve(token),
      refresh: vi.fn(() => {
        token = 'new';
        return Promise.resolve();
      }),
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, { status: 401 }))
      .mockResolvedValueOnce(json({ ok: true }));

    await expect(settle(makeTransport(fetchMock, auth).get({ path: '/v1/x' }))).resolves.toEqual({
      ok: true,
    });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer new' });
  });

  it('throws BcpAuthError when BCP still refuses after a refresh', async () => {
    const auth = {
      getAccessToken: () => Promise.resolve('tok'),
      refresh: vi.fn(() => Promise.resolve()),
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({}, { status: 401 }));

    await expect(
      settle(makeTransport(fetchMock, auth).get({ path: '/v1/x' })),
    ).rejects.toBeInstanceOf(BcpAuthError);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run the tests and watch them fail**

Run: `pnpm vitest run --project api src/bcp/http-transport`
Expected: FAIL, because the module `./http-transport` does not exist.

- [ ] **Step 7: Implement the HTTP transport**

`apps/api/src/bcp/http-transport.ts`:

```ts
import { BcpAuthError, BcpRateLimitedError, BcpUnavailableError, NotFoundError } from '../errors';
import type { Logger } from '../logger';
import type { RateLimiter } from './rate-limiter';
import type { AccessTokenProvider, BcpRequest, BcpTransport } from './transport';

/** Headers BCP's own web app sends; its API rejects requests without them. */
const BCP_HEADERS = {
  'client-id': 'web-app',
  env: 'bcp',
  accept: 'application/json',
  'user-agent': 'bcp-analyzer/0.1 (private team analysis tool)',
} as const;

const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10_000;
const MAX_RETRY_AFTER_MS = 60_000;
const DEFAULT_RATE_LIMIT_SECONDS = 60;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function buildUrl(baseUrl: string, { path, query = {} }: BcpRequest): URL {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

export function parseRetryAfterSeconds(header: string | null): number | null {
  if (header === null) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function retryDelayMs(
  attempt: number,
  retryAfterHeader: string | null,
  random: () => number = Math.random,
): number {
  const retryAfter = parseRetryAfterSeconds(retryAfterHeader);
  if (retryAfter !== null) return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
  const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return Math.min(backoff + random() * 250, MAX_BACKOFF_MS);
}

export interface HttpTransportOptions {
  baseUrl: string;
  timeoutMs: number;
  maxAttempts: number;
  limiter: RateLimiter;
  /** Null sends requests anonymously. */
  auth: AccessTokenProvider | null;
  logger: Logger;
  fetch?: typeof globalThis.fetch;
}

/** Talks to BCP's web API: rate limited, retried, authenticated. */
export class HttpTransport implements BcpTransport {
  readonly #options: HttpTransportOptions;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: HttpTransportOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async get(request: BcpRequest): Promise<unknown> {
    const { maxAttempts, auth, limiter } = this.#options;
    const url = buildUrl(this.#options.baseUrl, request);
    let refreshedToken = false;

    for (let attempt = 1; ; attempt += 1) {
      let response: Response;
      try {
        response = await limiter.run(() => this.#send(url, request.path, attempt));
      } catch (error) {
        if (attempt >= maxAttempts) {
          throw new BcpUnavailableError(`Could not reach BCP for ${request.path}`, error);
        }
        await sleep(retryDelayMs(attempt, null));
        continue;
      }

      if (response.ok) return (await response.json()) as unknown;

      if (response.status === 401 && auth && !refreshedToken) {
        refreshedToken = true;
        attempt -= 1; // refreshing the token is not a failed attempt
        await auth.refresh();
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new BcpAuthError(
          `BCP refused access to ${request.path} (HTTP ${response.status}). Check the BCP login in Settings.`,
        );
      }
      if (response.status === 404) {
        throw new NotFoundError(`BCP has nothing at ${request.path}`);
      }

      const retryable = response.status === 429 || response.status >= 500;
      const retryAfter = response.headers.get('retry-after');
      if (!retryable || attempt >= maxAttempts) {
        if (response.status === 429) {
          throw new BcpRateLimitedError(
            parseRetryAfterSeconds(retryAfter) ?? DEFAULT_RATE_LIMIT_SECONDS,
          );
        }
        throw new BcpUnavailableError(`BCP returned HTTP ${response.status} for ${request.path}`);
      }
      await sleep(retryDelayMs(attempt, retryAfter));
    }
  }

  async #send(url: URL, path: string, attempt: number): Promise<Response> {
    const headers: Record<string, string> = { ...BCP_HEADERS };
    const token = await this.#options.auth?.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const startedAt = performance.now();
    const response = await this.#fetch(url, {
      headers,
      signal: AbortSignal.timeout(this.#options.timeoutMs),
    });
    this.#options.logger.debug(
      {
        path,
        status: response.status,
        attempt,
        durationMs: Math.round(performance.now() - startedAt),
      },
      'BCP request',
    );
    return response;
  }
}
```

- [ ] **Step 8: Run the tests and watch them pass**

Run: `pnpm vitest run --project api src/bcp`
Expected: PASS for the rate-limiter, http-transport and mappers tests.

- [ ] **Step 9: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): add rate-limited, retrying BCP HTTP transport

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: BCP authentication (token refresh + persisted session)

**Files:**

- Create: `apps/api/src/bcp/auth.ts`, `apps/api/src/bcp/auth-store.ts`
- Test: `apps/api/src/bcp/auth.test.ts`

**Interfaces:**

- Consumes: `AccessTokenProvider` (Task 4); `BcpAuthError`; `Db` and `bcpSession` (Task 3).
- Produces:
  - `interface BcpSession { accessToken; refreshToken; accessTokenExpiresAt: Date|null; lastRefreshAt: Date|null; seedTokenHash: string|null }`
  - `interface BcpSessionStore { load(): Promise<BcpSession|null>; save(s: BcpSession): Promise<void> }`
  - `new BcpAuth({ apiUrl, store, envRefreshToken?, envAccessToken?, logger, fetch?, now? })`, implementing `AccessTokenProvider` plus `status(): Promise<BcpAuthStatus>`
  - `interface BcpAuthStatus { authenticated: boolean; accessTokenExpiresAt: string|null; lastRefreshAt: string|null }`
  - `decodeJwtExpiry(token): Date|null`
  - `createMemorySessionStore(initial?)`
  - `createDbSessionStore(db)`

**How BCP's login works** (read from BCP's own site code on 2026-09-23):

- To refresh, `POST {BCP_API_URL}/v1/oauth/token` with the headers `content-type: application/json` and `client-id: web-app`, and the body `{"refresh_token": "...", "grant_type": "refresh_token"}`.
- The response is `{ accessToken, idToken, refreshToken? }`. The access token is a JWT, and its `exp` field says when it expires.
- **Not yet confirmed against live BCP:** whether a refresh also rotates the refresh token. The code handles both cases. Task 12 checks this for real.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/bcp/auth.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb } from '../db/test-db';
import { BcpAuthError } from '../errors';
import { silentLogger } from '../test/helpers';
import { BcpAuth, createMemorySessionStore, decodeJwtExpiry, type BcpSession } from './auth';
import { createDbSessionStore } from './auth-store';

const NOW = Date.parse('2026-09-23T12:00:00Z');

function fakeJwt(expiresAtMs: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ exp: Math.floor(expiresAtMs / 1000) })}.sig`;
}

function tokenResponse(accessToken: string, refreshToken?: string) {
  return Response.json({ accessToken, idToken: 'id', ...(refreshToken ? { refreshToken } : {}) });
}

function makeAuth(options: {
  store?: ReturnType<typeof createMemorySessionStore>;
  envRefreshToken?: string;
  envAccessToken?: string;
  fetch?: typeof fetch;
}) {
  return new BcpAuth({
    apiUrl: 'https://bcp.test',
    store: options.store ?? createMemorySessionStore(),
    envRefreshToken: options.envRefreshToken,
    envAccessToken: options.envAccessToken,
    logger: silentLogger,
    fetch: options.fetch ?? vi.fn<typeof fetch>(),
    now: () => NOW,
  });
}

describe('decodeJwtExpiry', () => {
  it('reads exp from a JWT', () => {
    expect(decodeJwtExpiry(fakeJwt(NOW))?.getTime()).toBe(NOW);
  });
  it('returns null for opaque tokens', () => {
    expect(decodeJwtExpiry('not-a-jwt')).toBeNull();
  });
});

describe('BcpAuth', () => {
  it('uses a still-valid access token from the environment without refreshing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const token = fakeJwt(NOW + 3_600_000);
    const auth = makeAuth({ envAccessToken: token, fetch: fetchMock });

    expect(await auth.getAccessToken()).toBe(token);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is anonymous when no tokens are configured', async () => {
    const auth = makeAuth({});
    expect(await auth.getAccessToken()).toBeNull();
    expect((await auth.status()).authenticated).toBe(false);
  });

  it('refreshes when there is no usable access token and persists the rotated refresh token', async () => {
    const fresh = fakeJwt(NOW + 3_600_000);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(tokenResponse(fresh, 'refresh-2'));
    const store = createMemorySessionStore();
    const auth = makeAuth({ store, envRefreshToken: 'refresh-1', fetch: fetchMock });

    expect(await auth.getAccessToken()).toBe(fresh);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://bcp.test/v1/oauth/token');
    expect(JSON.parse(String(init?.body))).toEqual({
      refresh_token: 'refresh-1',
      grant_type: 'refresh_token',
    });
    expect((await store.load())?.refreshToken).toBe('refresh-2');
    expect(await auth.status()).toEqual({
      authenticated: true,
      accessTokenExpiresAt: new Date(NOW + 3_600_000).toISOString(),
      lastRefreshAt: new Date(NOW).toISOString(),
    });
  });

  it('keeps the old refresh token when BCP does not rotate it', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(tokenResponse(fakeJwt(NOW + 3_600_000)));
    const store = createMemorySessionStore();
    await makeAuth({ store, envRefreshToken: 'refresh-1', fetch: fetchMock }).refresh();
    expect((await store.load())?.refreshToken).toBe('refresh-1');
  });

  it('refreshes an access token that expires within a minute', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(tokenResponse(fakeJwt(NOW + 3_600_000)));
    const auth = makeAuth({
      envAccessToken: fakeJwt(NOW + 30_000),
      envRefreshToken: 'refresh-1',
      fetch: fetchMock,
    });
    await auth.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes a single refresh request for concurrent callers', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(tokenResponse(fakeJwt(NOW + 3_600_000)));
    const auth = makeAuth({ envRefreshToken: 'refresh-1', fetch: fetchMock });
    await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.refresh()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws BcpAuthError when BCP rejects the refresh token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('no', { status: 401 }));
    const auth = makeAuth({ envRefreshToken: 'expired', fetch: fetchMock });
    await expect(auth.refresh()).rejects.toBeInstanceOf(BcpAuthError);
  });

  it('prefers the stored session, unless .env now holds a different refresh token', async () => {
    const stored: BcpSession = {
      accessToken: fakeJwt(NOW + 3_600_000),
      refreshToken: 'rotated',
      accessTokenExpiresAt: new Date(NOW + 3_600_000),
      lastRefreshAt: new Date(NOW - 1000),
      seedTokenHash: null,
    };
    const store = createMemorySessionStore(stored);
    const sameSeed = makeAuth({ store });
    expect(await sameSeed.getAccessToken()).toBe(stored.accessToken);

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(tokenResponse(fakeJwt(NOW + 7_200_000)));
    const newSeed = makeAuth({ store, envRefreshToken: 'brand-new', fetch: fetchMock });
    await newSeed.getAccessToken();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      refresh_token: 'brand-new',
    });
  });
});

describe('createDbSessionStore', () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(() => close());

  it('round-trips a session through Postgres', async () => {
    const store = createDbSessionStore(db);
    expect(await store.load()).toBeNull();

    const session: BcpSession = {
      accessToken: 'a',
      refreshToken: 'r',
      accessTokenExpiresAt: new Date(NOW),
      lastRefreshAt: null,
      seedTokenHash: 'h',
    };
    await store.save(session);
    await store.save({ ...session, accessToken: 'b' });

    expect(await store.load()).toEqual({ ...session, accessToken: 'b' });
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm vitest run --project api src/bcp/auth`
Expected: FAIL, because the modules `./auth` and `./auth-store` do not exist.

- [ ] **Step 3: Implement BcpAuth**

`apps/api/src/bcp/auth.ts`:

```ts
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { BcpAuthError } from '../errors';
import type { Logger } from '../logger';
import type { AccessTokenProvider } from './transport';

/** Refresh this long before the access token actually expires. */
const EXPIRY_MARGIN_MS = 60_000;
const REFRESH_TIMEOUT_MS = 15_000;

export interface BcpSession {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  lastRefreshAt: Date | null;
  /** sha256 of the BCP_REFRESH_TOKEN this session was seeded from, so a new .env token takes over. */
  seedTokenHash: string | null;
}

export interface BcpSessionStore {
  load(): Promise<BcpSession | null>;
  save(session: BcpSession): Promise<void>;
}

export interface BcpAuthStatus {
  authenticated: boolean;
  accessTokenExpiresAt: string | null;
  lastRefreshAt: string | null;
}

export interface BcpAuthOptions {
  apiUrl: string;
  store: BcpSessionStore;
  envRefreshToken?: string | undefined;
  envAccessToken?: string | undefined;
  logger: Logger;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}

const RefreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).nullish(),
});

const JwtPayloadSchema = z.object({ exp: z.number() });

export function decodeJwtExpiry(token: string): Date | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const parsed = JwtPayloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    );
    return parsed.success ? new Date(parsed.data.exp * 1000) : null;
  } catch {
    return null;
  }
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function createMemorySessionStore(initial: BcpSession | null = null): BcpSessionStore {
  let session = initial;
  return {
    load: () => Promise.resolve(session),
    save: (next) => {
      session = next;
      return Promise.resolve();
    },
  };
}

/** Keeps a valid BCP access token around, refreshing it with the user's refresh token. */
export class BcpAuth implements AccessTokenProvider {
  readonly #options: BcpAuthOptions;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => number;
  #session: BcpSession | null = null;
  #refreshing: Promise<void> | null = null;

  constructor(options: BcpAuthOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? Date.now;
  }

  async getAccessToken(): Promise<string | null> {
    const session = await this.#loadSession();
    if (session.refreshToken && this.#isExpiring(session)) await this.refresh();
    return this.#session?.accessToken ?? null;
  }

  refresh(): Promise<void> {
    this.#refreshing ??= this.#doRefresh().finally(() => {
      this.#refreshing = null;
    });
    return this.#refreshing;
  }

  async status(): Promise<BcpAuthStatus> {
    const session = await this.#loadSession();
    return {
      authenticated: session.accessToken !== null && !this.#isExpired(session),
      accessTokenExpiresAt: session.accessTokenExpiresAt?.toISOString() ?? null,
      lastRefreshAt: session.lastRefreshAt?.toISOString() ?? null,
    };
  }

  async #loadSession(): Promise<BcpSession> {
    if (this.#session) return this.#session;

    const { envRefreshToken, envAccessToken, store } = this.#options;
    const seedHash = envRefreshToken ? sha256(envRefreshToken) : null;
    const stored = await store.load();
    // A stored session wins (it may hold a rotated refresh token), unless the user has
    // since put a different refresh token into .env, e.g. after logging in again.
    if (stored && (seedHash === null || stored.seedTokenHash === seedHash)) {
      this.#session = stored;
      return stored;
    }

    const seeded: BcpSession = {
      accessToken: envAccessToken ?? null,
      refreshToken: envRefreshToken ?? null,
      accessTokenExpiresAt: envAccessToken ? decodeJwtExpiry(envAccessToken) : null,
      lastRefreshAt: null,
      seedTokenHash: seedHash,
    };
    await store.save(seeded);
    this.#session = seeded;
    return seeded;
  }

  #isExpired(session: BcpSession): boolean {
    return (
      session.accessTokenExpiresAt !== null && session.accessTokenExpiresAt.getTime() <= this.#now()
    );
  }

  #isExpiring(session: BcpSession): boolean {
    if (session.accessToken === null) return true;
    if (session.accessTokenExpiresAt === null) return false;
    return session.accessTokenExpiresAt.getTime() - this.#now() < EXPIRY_MARGIN_MS;
  }

  async #doRefresh(): Promise<void> {
    const session = await this.#loadSession();
    if (!session.refreshToken) {
      throw new BcpAuthError('No BCP refresh token configured. Set BCP_REFRESH_TOKEN in .env.');
    }

    const response = await this.#fetch(new URL('/v1/oauth/token', this.#options.apiUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'client-id': 'web-app' },
      body: JSON.stringify({ refresh_token: session.refreshToken, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new BcpAuthError(
        `BCP rejected the refresh token (HTTP ${response.status}). Log in to bestcoastpairings.com again and update BCP_REFRESH_TOKEN.`,
      );
    }
    const parsed = RefreshResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new BcpAuthError('BCP token response had an unexpected shape');

    const next: BcpSession = {
      ...session,
      accessToken: parsed.data.accessToken,
      refreshToken: parsed.data.refreshToken ?? session.refreshToken,
      accessTokenExpiresAt: decodeJwtExpiry(parsed.data.accessToken),
      lastRefreshAt: new Date(this.#now()),
    };
    await this.#options.store.save(next);
    this.#session = next;
    this.#options.logger.info(
      {
        expiresAt: next.accessTokenExpiresAt?.toISOString(),
        rotated: Boolean(parsed.data.refreshToken),
      },
      'Refreshed BCP access token',
    );
  }
}
```

`apps/api/src/bcp/auth-store.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { bcpSession } from '../db/schema';
import type { BcpSession, BcpSessionStore } from './auth';

const SESSION_ROW_ID = 1;

export function createDbSessionStore(db: Db): BcpSessionStore {
  return {
    async load() {
      const [row] = await db.select().from(bcpSession).where(eq(bcpSession.id, SESSION_ROW_ID));
      if (!row) return null;
      const session: BcpSession = {
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        accessTokenExpiresAt: row.accessTokenExpiresAt,
        lastRefreshAt: row.lastRefreshAt,
        seedTokenHash: row.seedTokenHash,
      };
      return session;
    },
    async save(session) {
      const values = { ...session, updatedAt: new Date() };
      await db
        .insert(bcpSession)
        .values({ id: SESSION_ROW_ID, ...values })
        .onConflictDoUpdate({ target: bcpSession.id, set: values });
    },
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run --project api src/bcp/auth`
Expected: PASS, 11 tests.

- [ ] **Step 5: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): add BCP token refresh with persisted session

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Tournament source and fixture transport

**Files:**

- Create: `apps/api/src/bcp/fixture-transport.ts`, `apps/api/src/bcp/source.ts`
- Modify: `apps/api/src/test/helpers.ts`
- Test: `apps/api/src/bcp/fixture-transport.test.ts`, `apps/api/src/bcp/source.test.ts`

**Interfaces:**

- Consumes: the parse helpers and schemas from `raw.ts`, the mappers, `BcpTransport`, `NotFoundError`.
- Produces:
  - `type Fetched<T> = T & { raw: unknown }`
  - `interface Page<T> { items: T[]; nextCursor: string | null }`
  - `interface DateRange { from: string; to: string }`, with `YYYY-MM-DD` dates, both ends inclusive
  - `interface TournamentSource` with:
    - `listEvents(range, cursor)`
    - `getEvent(eventId)`
    - `getPlayers(eventId)`
    - `getTeams(eventId)`
    - `getTeamMatchups(eventId, round)`
    - `getGames(eventId, round)`
    - `getList(listId): Promise<Fetched<ArmyList> | null>`
  - `new BcpSource(transport)`
  - `fixtureFileFor(request): string`
  - `new FixtureTransport(rootDir)`
  - in `test/helpers.ts`: `SAMPLE_FIXTURES_DIR` and `sampleSource()`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/bcp/fixture-transport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../errors';
import { SAMPLE_FIXTURES_DIR } from '../test/helpers';
import { fixtureFileFor, FixtureTransport } from './fixture-transport';

describe('fixtureFileFor', () => {
  it.each([
    [{ path: '/v1/events', query: { limit: 100 } }, 'events/search.first.json'],
    [{ path: '/v1/events', query: { nextKey: 'ab/c=' } }, 'events/search.ab_c_.json'],
    [{ path: '/v2/events/E1' }, 'events/E1/event.json'],
    [{ path: '/v1/events/E1/players' }, 'events/E1/players.json'],
    [{ path: '/v1/events/E1/teamplayers' }, 'events/E1/teams.json'],
    [
      { path: '/v1/events/E1/pairings', query: { round: 2 } },
      'events/E1/team-pairings.round-2.json',
    ],
    [
      { path: '/v1/pairings', query: { eventId: 'E1', round: 1, nextKey: 'p2' } },
      'events/E1/pairings.round-1.p2.json',
    ],
    [{ path: '/v1/armylists/L1' }, 'armylists/L1.json'],
  ])('%j → %s', (request, file) => {
    expect(fixtureFileFor(request)).toBe(file);
  });

  it('rejects paths it has no mapping for', () => {
    expect(() => fixtureFileFor({ path: '/v1/unknown' })).toThrow(/No fixture mapping/);
  });
});

describe('FixtureTransport', () => {
  const transport = new FixtureTransport(SAMPLE_FIXTURES_DIR);

  it('reads the mapped JSON file', async () => {
    await expect(transport.get({ path: '/v1/armylists/LS-ADA' })).resolves.toMatchObject({
      id: 'LS-ADA',
    });
  });

  it('throws NotFoundError for missing files, like BCP answering 404', async () => {
    await expect(transport.get({ path: '/v1/armylists/NOPE' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
```

`apps/api/src/bcp/source.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sampleSource } from '../test/helpers';

const EVENT = 'EVTTEAM0001';
const source = sampleSource();

describe('BcpSource over the sample fixtures', () => {
  it('pages through event search results', async () => {
    const first = await source.listEvents({ from: '2026-01-01', to: '2026-12-31' }, null);
    expect(first.items.map((e) => e.bcpId)).toEqual(['EVTSINGLE01', 'EVTTEAM0001']);
    expect(first.nextCursor).toBe('page-2');

    const second = await source.listEvents({ from: '2026-01-01', to: '2026-12-31' }, 'page-2');
    expect(second.items.map((e) => e.name)).toEqual(['Tiny RTT']);
    expect(second.nextCursor).toBeNull();
  });

  it('keeps the original JSON alongside mapped values', async () => {
    const event = await source.getEvent(EVENT);
    expect(event).toMatchObject({
      bcpId: EVENT,
      city: 'Springfield',
      roundCount: 2,
      isTeamEvent: true,
      teamCount: 4,
    });
    expect(event.raw).toMatchObject({ format: { pairingStyle: 'swiss' } });
  });

  it('loads teams and players', async () => {
    const teams = await source.getTeams(EVENT);
    expect(teams.map((t) => [t.name, t.roundPoints])).toContainEqual(['Charlie Wing', [24, 24]]);

    const players = await source.getPlayers(EVENT);
    expect(players).toHaveLength(8);
    expect(players.find((p) => p.bcpId === 'PL-DAN')).toMatchObject({
      name: 'Dan Drake',
      teamBcpId: 'TM-BRAVO',
      draws: 2,
    });
  });

  it('loads team matchups and all pages of games for a round', async () => {
    const matchups = await source.getTeamMatchups(EVENT, 1);
    expect(matchups.map((m) => [m.teamABcpId, m.pointsA, m.teamBBcpId, m.pointsB])).toEqual([
      ['TM-ALPHA', 25, 'TM-BRAVO', 15],
      ['TM-CHARLIE', 24, 'TM-DELTA', 16],
    ]);

    const games = await source.getGames(EVENT, 1);
    expect(games.map((g) => g.bcpId)).toEqual(['GM-R1-1', 'GM-R1-2', 'GM-R1-3', 'GM-R1-4']);
  });

  it('returns null for a list BCP does not have', async () => {
    await expect(source.getList('LS-ADA')).resolves.toMatchObject({
      text: expect.stringContaining('Gladius'),
    });
    await expect(source.getList('LS-MISSING')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm vitest run --project api src/bcp/fixture-transport src/bcp/source`
Expected: FAIL, because the modules `./fixture-transport`, `./source` and the `SAMPLE_FIXTURES_DIR` export do not exist.

- [ ] **Step 3: Implement the fixture transport**

`apps/api/src/bcp/fixture-transport.ts`:

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NotFoundError } from '../errors';
import type { BcpRequest, BcpTransport } from './transport';

/** File-name-safe version of an id or cursor (BCP cursors are base64 and may contain / and =). */
const safeSegment = (value: string | number) => String(value).replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * Where a BCP request's response lives inside a fixtures directory. Used both to serve
 * fixtures and to record them, so the two can never disagree.
 */
export function fixtureFileFor({ path: urlPath, query = {} }: BcpRequest): string {
  const cursor = query.nextKey === undefined ? 'first' : safeSegment(query.nextKey);
  const round = safeSegment(query.round ?? 0);
  const [, version, resource, id, sub] = urlPath.split('/');

  if (version === 'v1' && resource === 'events' && id === undefined) {
    return `events/search.${cursor}.json`;
  }
  if (version === 'v2' && resource === 'events' && id && sub === undefined) {
    return `events/${safeSegment(id)}/event.json`;
  }
  if (version === 'v1' && resource === 'events' && id) {
    if (sub === 'players') return `events/${safeSegment(id)}/players.json`;
    if (sub === 'teamplayers') return `events/${safeSegment(id)}/teams.json`;
    if (sub === 'pairings') return `events/${safeSegment(id)}/team-pairings.round-${round}.json`;
  }
  if (version === 'v1' && resource === 'pairings' && query.eventId !== undefined) {
    return `events/${safeSegment(query.eventId)}/pairings.round-${round}.${cursor}.json`;
  }
  if (version === 'v1' && resource === 'armylists' && id) {
    return `armylists/${safeSegment(id)}.json`;
  }
  throw new Error(`No fixture mapping for ${urlPath}`);
}

/** Serves BCP responses from JSON files, for development and tests. */
export class FixtureTransport implements BcpTransport {
  readonly #rootDir: string;

  constructor(rootDir: string) {
    this.#rootDir = rootDir;
  }

  async get(request: BcpRequest): Promise<unknown> {
    const file = path.join(this.#rootDir, fixtureFileFor(request));
    try {
      return JSON.parse(await readFile(file, 'utf8')) as unknown;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new NotFoundError(`No fixture for ${request.path} (${file})`);
      }
      throw error;
    }
  }
}
```

- [ ] **Step 4: Implement the source**

`apps/api/src/bcp/source.ts`:

```ts
import type { ArmyList, EventSummary, Game, Player, Team, TeamMatchup } from '@bcp/shared';
import { NotFoundError } from '../errors';
import {
  mapArmyList,
  mapEventDetail,
  mapEventSearchItem,
  mapPairing,
  mapPlayer,
  mapTeam,
  mapTeamPairing,
} from './mappers';
import {
  parseBcp,
  parseItems,
  RawArmyList,
  RawEventDetail,
  RawEventSearchItem,
  RawListEnvelope,
  RawPageEnvelope,
  RawPairing,
  RawPlayer,
  RawTeam,
  RawTeamPairing,
} from './raw';
import type { BcpTransport } from './transport';

/** Warhammer 40,000 in BCP's game-type numbering. */
const WARHAMMER_40K = 1;
const PAGE_SIZE = 100;

/** A mapped domain object plus the untouched BCP JSON it came from (stored in `raw` columns). */
export type Fetched<T> = T & { raw: unknown };

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Inclusive date range, YYYY-MM-DD. */
export interface DateRange {
  from: string;
  to: string;
}

export interface TournamentSource {
  listEvents(range: DateRange, cursor: string | null): Promise<Page<Fetched<EventSummary>>>;
  getEvent(eventId: string): Promise<Fetched<EventSummary>>;
  getPlayers(eventId: string): Promise<Fetched<Player>[]>;
  getTeams(eventId: string): Promise<Fetched<Team>[]>;
  getTeamMatchups(eventId: string, round: number): Promise<Fetched<TeamMatchup>[]>;
  getGames(eventId: string, round: number): Promise<Fetched<Game>[]>;
  /** Null when BCP has no such list. */
  getList(listId: string): Promise<Fetched<ArmyList> | null>;
}

/** Reads tournaments from BCP's web API (or fixture files shaped like it). */
export class BcpSource implements TournamentSource {
  readonly #transport: BcpTransport;

  constructor(transport: BcpTransport) {
    this.#transport = transport;
  }

  async listEvents(range: DateRange, cursor: string | null): Promise<Page<Fetched<EventSummary>>> {
    const path = '/v1/events';
    const body = parseBcp(
      RawPageEnvelope,
      await this.#transport.get({
        path,
        query: {
          gameType: WARHAMMER_40K,
          startDate: `${range.from}T00:00:00Z`,
          endDate: `${range.to}T23:59:59Z`,
          sortKey: 'eventDate',
          sortAscending: 'true',
          limit: PAGE_SIZE,
          nextKey: cursor ?? undefined,
        },
      }),
      path,
    );
    const items = parseItems(RawEventSearchItem, body.data, path).map(({ parsed, raw }) => ({
      ...mapEventSearchItem(parsed),
      raw,
    }));
    // BCP returns a nextKey even on the last page; an empty page is the real end.
    return { items, nextCursor: items.length > 0 ? (body.nextKey ?? null) : null };
  }

  async getEvent(eventId: string): Promise<Fetched<EventSummary>> {
    const path = `/v2/events/${encodeURIComponent(eventId)}`;
    const raw = await this.#transport.get({ path });
    return { ...mapEventDetail(parseBcp(RawEventDetail, raw, path)), raw };
  }

  async getPlayers(eventId: string): Promise<Fetched<Player>[]> {
    const path = `/v1/events/${encodeURIComponent(eventId)}/players`;
    const body = parseBcp(
      RawListEnvelope,
      await this.#transport.get({ path, query: { placings: 'true' } }),
      path,
    );
    return parseItems(RawPlayer, body.active, path).map(({ parsed, raw }) => ({
      ...mapPlayer(parsed, eventId),
      raw,
    }));
  }

  async getTeams(eventId: string): Promise<Fetched<Team>[]> {
    const path = `/v1/events/${encodeURIComponent(eventId)}/teamplayers`;
    const body = parseBcp(
      RawListEnvelope,
      await this.#transport.get({ path, query: { placings: 'true' } }),
      path,
    );
    return parseItems(RawTeam, body.active, path).map(({ parsed, raw }) => ({
      ...mapTeam(parsed, eventId),
      raw,
    }));
  }

  async getTeamMatchups(eventId: string, round: number): Promise<Fetched<TeamMatchup>[]> {
    const path = `/v1/events/${encodeURIComponent(eventId)}/pairings`;
    const body = parseBcp(
      RawListEnvelope,
      await this.#transport.get({ path, query: { round, pairingType: 'TeamPairing' } }),
      path,
    );
    return parseItems(RawTeamPairing, body.active, path).flatMap(({ parsed, raw }) => {
      const matchup = mapTeamPairing(parsed, eventId);
      return matchup ? [{ ...matchup, raw }] : [];
    });
  }

  async getGames(eventId: string, round: number): Promise<Fetched<Game>[]> {
    const path = '/v1/pairings';
    const games: Fetched<Game>[] = [];
    let cursor: string | null = null;
    do {
      const body = parseBcp(
        RawPageEnvelope,
        await this.#transport.get({
          path,
          query: {
            eventId,
            round,
            pairingType: 'Pairing',
            limit: PAGE_SIZE,
            nextKey: cursor ?? undefined,
          },
        }),
        path,
      );
      for (const { parsed, raw } of parseItems(RawPairing, body.data, path)) {
        const game = mapPairing(parsed, eventId);
        if (game) games.push({ ...game, raw });
      }
      cursor = body.data.length > 0 ? (body.nextKey ?? null) : null;
    } while (cursor !== null);
    return games;
  }

  async getList(listId: string): Promise<Fetched<ArmyList> | null> {
    const path = `/v1/armylists/${encodeURIComponent(listId)}`;
    try {
      const raw = await this.#transport.get({ path });
      return { ...mapArmyList(parseBcp(RawArmyList, raw, path)), raw };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
}
```

Replace `apps/api/src/test/helpers.ts` with:

```ts
import { fileURLToPath } from 'node:url';
import { pino } from 'pino';
import { FixtureTransport } from '../bcp/fixture-transport';
import { BcpSource } from '../bcp/source';

export const silentLogger = pino({ level: 'silent' });

export const SAMPLE_FIXTURES_DIR = fileURLToPath(
  new URL('../../../../fixtures/bcp/sample', import.meta.url),
);

export function sampleSource(): BcpSource {
  return new BcpSource(new FixtureTransport(SAMPLE_FIXTURES_DIR));
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm vitest run --project api src/bcp`
Expected: PASS for every test in `src/bcp`.

- [ ] **Step 6: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): add BcpSource and fixture transport

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Repositories

**Files:**

- Create: `apps/api/src/repo/upsert.ts`, `apps/api/src/repo/events.ts`, `apps/api/src/repo/participants.ts`, `apps/api/src/repo/pairings.ts`, `apps/api/src/repo/lists.ts`, `apps/api/src/repo/sync-runs.ts`
- Test: `apps/api/src/repo/events.test.ts`, `apps/api/src/repo/lists.test.ts`, `apps/api/src/repo/sync-runs.test.ts`

**Interfaces:**

- Consumes: `Db`, the tables, `Fetched<T>`, the shared types, `sampleSource()`.
- Produces:
  - `excludedColumns(table, except)`
  - `upsertEventSummaries(db, events)`, `upsertEventDetail(db, event)`, `markEventSynced(db, eventId, at?)`, `findEvent(db, id): Promise<EventRow | undefined>`, `toEventListItem(row): EventListItem`, `searchEvents(db, query: EventListQuery): Promise<EventListResponse>`, and `type EventRow`
  - `upsertTeams(db, teams)`, `upsertPlayers(db, players)`
  - `upsertTeamMatchups(db, matchups)`, `upsertGames(db, games)`
  - `findPlayersMissingLists(db, eventId): Promise<{ playerId: string; listId: string }[]>`, `saveArmyList(db, playerId, list)`
  - `eventIdOf(request): string | null`, `createSyncRun(db, request): Promise<SyncRun | null>`, `findActiveSyncRun(db, kind, eventId)`, `getSyncRun(db, id)`, `markSyncRunRunning(db, id)`, `setSyncRunTotal(db, id, total)`, `incrementSyncRun(db, id, field, by?)`, `finishSyncRun(db, id, outcome)`, `failInterruptedSyncRuns(db): Promise<number>`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/repo/events.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EventListQuerySchema } from '@bcp/shared';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { sampleSource } from '../test/helpers';
import {
  findEvent,
  markEventSynced,
  searchEvents,
  upsertEventDetail,
  upsertEventSummaries,
} from './events';

let db: Db;
let close: () => Promise<void>;
const source = sampleSource();

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const range = { from: '2026-01-01', to: '2026-12-31' };
  const first = await source.listEvents(range, null);
  const second = await source.listEvents(range, first.nextCursor);
  await upsertEventSummaries(db, [...first.items, ...second.items]);
});

const query = (input: Record<string, string>) => EventListQuerySchema.parse(input);

describe('event upserts', () => {
  it('keeps detail-only fields when the catalogue is synced again', async () => {
    await upsertEventDetail(db, await source.getEvent('EVTTEAM0001'));
    await markEventSynced(db, 'EVTTEAM0001');
    await upsertEventSummaries(
      db,
      (await source.listEvents({ from: '2026-01-01', to: '2026-12-31' }, null)).items,
    );

    const row = await findEvent(db, 'EVTTEAM0001');
    expect(row?.city).toBe('Springfield');
    expect(row?.teamCount).toBe(4);
    expect(row?.rawDetail).not.toBeNull();
    expect(row?.rawSummary).not.toBeNull();
    expect(row?.lastSyncedAt).toBeInstanceOf(Date);
  });
});

describe('searchEvents', () => {
  it('lists newest first with a total', async () => {
    const result = await searchEvents(db, query({}));
    expect(result.total).toBe(3);
    expect(result.items.map((e) => e.bcpId)).toEqual(['EVTSMALL001', 'EVTSINGLE01', 'EVTTEAM0001']);
  });

  it('filters by minimum players, type, name, country and date', async () => {
    const ids = async (input: Record<string, string>) =>
      (await searchEvents(db, query(input))).items.map((e) => e.bcpId);

    expect(await ids({ minPlayers: '40' })).toEqual(['EVTSINGLE01']);
    expect(await ids({ minPlayers: '1', maxPlayers: '10' })).toEqual(['EVTTEAM0001']);
    expect(await ids({ type: 'teams' })).toEqual(['EVTTEAM0001']);
    expect(await ids({ type: 'singles' })).toEqual(['EVTSMALL001', 'EVTSINGLE01']);
    expect(await ids({ q: 'team open' })).toEqual(['EVTTEAM0001']);
    expect(await ids({ country: 'germany' })).toEqual(['EVTSINGLE01']);
    expect(await ids({ from: '2026-04-01', to: '2026-04-10' })).toEqual(['EVTSINGLE01']);
  });

  it('sorts biggest first when asked', async () => {
    const result = await searchEvents(db, query({ sort: 'players' }));
    expect(result.items.map((e) => [e.bcpId, e.playerCount])).toEqual([
      ['EVTSINGLE01', 64],
      ['EVTTEAM0001', 8],
      ['EVTSMALL001', 0],
    ]);
  });

  it('treats % and _ in the search text literally', async () => {
    expect((await searchEvents(db, query({ q: '%' }))).total).toBe(0);
  });

  it('paginates', async () => {
    const page2 = await searchEvents(db, query({ page: '2', pageSize: '2' }));
    expect(page2.items.map((e) => e.bcpId)).toEqual(['EVTTEAM0001']);
    expect(page2.total).toBe(3);
  });
});
```

`apps/api/src/repo/lists.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb } from '../db/test-db';
import { sampleSource } from '../test/helpers';
import { upsertEventDetail } from './events';
import { findPlayersMissingLists, saveArmyList } from './lists';
import { upsertPlayers, upsertTeams } from './participants';

let db: Db;
let close: () => Promise<void>;
const source = sampleSource();
const EVENT = 'EVTTEAM0001';

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await upsertEventDetail(db, await source.getEvent(EVENT));
  await upsertTeams(db, await source.getTeams(EVENT));
  await upsertPlayers(db, await source.getPlayers(EVENT));
});
afterAll(() => close());

describe('army lists', () => {
  it('finds players that have a BCP list we have not stored yet', async () => {
    const missing = await findPlayersMissingLists(db, EVENT);
    expect(missing).toHaveLength(7); // PL-HAL has no list at all
    expect(missing).toContainEqual({ playerId: 'PL-ADA', listId: 'LS-ADA' });

    const list = await source.getList('LS-ADA');
    if (!list) throw new Error('fixture missing');
    await saveArmyList(db, 'PL-ADA', list);

    expect(await findPlayersMissingLists(db, EVENT)).not.toContainEqual(
      expect.objectContaining({ playerId: 'PL-ADA' }),
    );
  });

  it('re-saving a list replaces it', async () => {
    const list = await source.getList('LS-BEN');
    if (!list) throw new Error('fixture missing');
    await saveArmyList(db, 'PL-BEN', list);
    await saveArmyList(db, 'PL-BEN', { ...list, text: 'updated' });
    expect(await findPlayersMissingLists(db, EVENT)).toHaveLength(5);
  });
});
```

`apps/api/src/repo/sync-runs.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import {
  createSyncRun,
  failInterruptedSyncRuns,
  findActiveSyncRun,
  finishSyncRun,
  getSyncRun,
  incrementSyncRun,
  markSyncRunRunning,
  setSyncRunTotal,
} from './sync-runs';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

describe('sync runs', () => {
  it('tracks a run from queued to succeeded', async () => {
    const run = await createSyncRun(db, { kind: 'lists', eventId: 'E1' });
    expect(run).toMatchObject({
      kind: 'lists',
      eventId: 'E1',
      status: 'queued',
      done: 0,
      total: null,
    });
    if (!run) throw new Error('not created');

    await markSyncRunRunning(db, run.id);
    await setSyncRunTotal(db, run.id, 3);
    await incrementSyncRun(db, run.id, 'done');
    await incrementSyncRun(db, run.id, 'done');
    await incrementSyncRun(db, run.id, 'failed');
    await finishSyncRun(db, run.id, { status: 'succeeded' });

    const finished = await getSyncRun(db, run.id);
    expect(finished).toMatchObject({
      status: 'succeeded',
      total: 3,
      done: 2,
      failed: 1,
      error: null,
    });
    expect(finished?.finishedAt).toEqual(expect.any(String));
  });

  it('refuses a second active run for the same kind and event', async () => {
    const first = await createSyncRun(db, { kind: 'lists', eventId: 'E1' });
    expect(await createSyncRun(db, { kind: 'lists', eventId: 'E1' })).toBeNull();
    expect(await findActiveSyncRun(db, 'lists', 'E1')).toEqual(first);
    expect(await createSyncRun(db, { kind: 'lists', eventId: 'E2' })).not.toBeNull();
    expect(
      await createSyncRun(db, { kind: 'catalog', from: '2026-01-01', to: '2026-01-31' }),
    ).not.toBeNull();
    expect(await findActiveSyncRun(db, 'catalog', null)).not.toBeNull();
  });

  it('marks runs left running by a crashed process as failed', async () => {
    const run = await createSyncRun(db, { kind: 'event', eventId: 'E1' });
    if (!run) throw new Error('not created');
    await markSyncRunRunning(db, run.id);

    expect(await failInterruptedSyncRuns(db)).toBe(1);
    expect(await getSyncRun(db, run.id)).toMatchObject({
      status: 'failed',
      error: 'Interrupted by a server restart',
    });
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm vitest run --project api src/repo`
Expected: FAIL, because the `./events`, `./lists` and `./sync-runs` modules do not exist.

- [ ] **Step 3: Implement the upsert helper and the event repository**

`apps/api/src/repo/upsert.ts`:

```ts
import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * `SET column = excluded.column` for every column except `except`, for use in
 * `onConflictDoUpdate({ set })`: "overwrite the stored row with the incoming one".
 */
export function excludedColumns<T extends PgTable>(
  table: T,
  except: (keyof T['$inferInsert'])[] = [],
): Partial<Record<keyof T['$inferInsert'], SQL>> {
  const skip = new Set<PropertyKey>(except);
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([key]) => !skip.has(key))
      .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
  ) as Partial<Record<keyof T['$inferInsert'], SQL>>;
}
```

`apps/api/src/repo/events.ts`:

```ts
import type { EventListItem, EventListQuery, EventListResponse, EventSummary } from '@bcp/shared';
import { and, desc, eq, gte, ilike, lt, lte, type SQL } from 'drizzle-orm';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import { events } from '../db/schema';
import { excludedColumns } from './upsert';

export type EventRow = typeof events.$inferSelect;

function toRow(event: EventSummary) {
  return {
    id: event.bcpId,
    name: event.name,
    startDate: new Date(event.startDate),
    endDate: event.endDate ? new Date(event.endDate) : null,
    country: event.country,
    city: event.city,
    playerCount: event.playerCount,
    teamCount: event.teamCount,
    isTeamEvent: event.isTeamEvent,
    isOnline: event.isOnline,
    roundCount: event.roundCount,
    ended: event.ended,
    hideLists: event.hideLists,
  };
}

/** Catalogue results: never overwrite what only event detail knows (city, team count, raw detail). */
export async function upsertEventSummaries(db: Db, list: Fetched<EventSummary>[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(events)
    .values(list.map((event) => ({ ...toRow(event), rawSummary: event.raw })))
    .onConflictDoUpdate({
      target: events.id,
      set: excludedColumns(events, [
        'id',
        'createdAt',
        'city',
        'teamCount',
        'rawDetail',
        'lastSyncedAt',
      ]),
    });
}

export async function upsertEventDetail(db: Db, event: Fetched<EventSummary>): Promise<void> {
  await db
    .insert(events)
    .values({ ...toRow(event), rawDetail: event.raw })
    .onConflictDoUpdate({
      target: events.id,
      set: excludedColumns(events, ['id', 'createdAt', 'rawSummary', 'lastSyncedAt']),
    });
}

export async function markEventSynced(db: Db, eventId: string, at = new Date()): Promise<void> {
  await db.update(events).set({ lastSyncedAt: at }).where(eq(events.id, eventId));
}

export async function findEvent(db: Db, id: string): Promise<EventRow | undefined> {
  const [row] = await db.select().from(events).where(eq(events.id, id));
  return row;
}

export function toEventListItem(row: EventRow): EventListItem {
  return {
    bcpId: row.id,
    name: row.name,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate?.toISOString() ?? null,
    country: row.country,
    city: row.city,
    playerCount: row.playerCount,
    teamCount: row.teamCount,
    isTeamEvent: row.isTeamEvent,
    isOnline: row.isOnline,
    roundCount: row.roundCount,
    ended: row.ended,
    hideLists: row.hideLists,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
  };
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

const startOfDay = (date: string) => new Date(`${date}T00:00:00Z`);

function startOfNextDay(date: string): Date {
  const next = startOfDay(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export async function searchEvents(db: Db, query: EventListQuery): Promise<EventListResponse> {
  const filters: SQL[] = [];
  if (query.from) filters.push(gte(events.startDate, startOfDay(query.from)));
  if (query.to) filters.push(lt(events.startDate, startOfNextDay(query.to)));
  if (query.country) filters.push(ilike(events.country, escapeLike(query.country)));
  if (query.minPlayers > 0) filters.push(gte(events.playerCount, query.minPlayers));
  if (query.maxPlayers !== undefined) filters.push(lte(events.playerCount, query.maxPlayers));
  if (query.type !== 'all') filters.push(eq(events.isTeamEvent, query.type === 'teams'));
  if (query.q) filters.push(ilike(events.name, `%${escapeLike(query.q)}%`));
  const where = and(...filters);

  // Ties fall back to newest first, then id, so paging is stable.
  const order =
    query.sort === 'players'
      ? [desc(events.playerCount), desc(events.startDate), events.id]
      : [desc(events.startDate), events.id];

  const [rows, total] = await Promise.all([
    db
      .select()
      .from(events)
      .where(where)
      .orderBy(...order)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.$count(events, where),
  ]);
  return { items: rows.map(toEventListItem), total, page: query.page, pageSize: query.pageSize };
}
```

- [ ] **Step 4: Implement the participant, pairing and list repositories**

`apps/api/src/repo/participants.ts`:

```ts
import type { Player, Team } from '@bcp/shared';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import { players, teams } from '../db/schema';
import { excludedColumns } from './upsert';

export async function upsertTeams(db: Db, list: Fetched<Team>[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(teams)
    .values(
      list.map((team) => ({
        id: team.bcpId,
        eventId: team.eventBcpId,
        name: team.name,
        placing: team.placing,
        roundPoints: team.roundPoints,
        raw: team.raw,
      })),
    )
    .onConflictDoUpdate({ target: teams.id, set: excludedColumns(teams, ['id', 'createdAt']) });
}

export async function upsertPlayers(db: Db, list: Fetched<Player>[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(players)
    .values(
      list.map((player) => ({
        id: player.bcpId,
        eventId: player.eventBcpId,
        teamId: player.teamBcpId,
        name: player.name,
        faction: player.faction,
        parentFaction: player.parentFaction,
        placing: player.placing,
        wins: player.wins,
        losses: player.losses,
        draws: player.draws,
        dropped: player.dropped,
        listId: player.listBcpId,
        raw: player.raw,
      })),
    )
    .onConflictDoUpdate({ target: players.id, set: excludedColumns(players, ['id', 'createdAt']) });
}
```

`apps/api/src/repo/pairings.ts`:

```ts
import type { Game, TeamMatchup } from '@bcp/shared';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import { games, teamMatchups } from '../db/schema';
import { excludedColumns } from './upsert';

export async function upsertTeamMatchups(db: Db, list: Fetched<TeamMatchup>[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(teamMatchups)
    .values(
      list.map((matchup) => ({
        id: matchup.bcpId,
        eventId: matchup.eventBcpId,
        round: matchup.round,
        tableNo: matchup.tableNo,
        teamAId: matchup.teamABcpId,
        teamBId: matchup.teamBBcpId,
        pointsA: matchup.pointsA,
        pointsB: matchup.pointsB,
        raw: matchup.raw,
      })),
    )
    .onConflictDoUpdate({
      target: teamMatchups.id,
      set: excludedColumns(teamMatchups, ['id', 'createdAt']),
    });
}

export async function upsertGames(db: Db, list: Fetched<Game>[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(games)
    .values(
      list.map((game) => ({
        id: game.bcpId,
        eventId: game.eventBcpId,
        round: game.round,
        tableNo: game.tableNo,
        teamMatchupId: game.teamMatchupBcpId,
        playerAId: game.playerABcpId,
        playerBId: game.playerBBcpId,
        vpA: game.vpA,
        vpB: game.vpB,
        primaryA: game.primaryA,
        primaryB: game.primaryB,
        secondaryA: game.secondaryA,
        secondaryB: game.secondaryB,
        gamePointsA: game.gamePointsA,
        gamePointsB: game.gamePointsB,
        firstTurn: game.firstTurn,
        result: game.result,
        raw: game.raw,
      })),
    )
    .onConflictDoUpdate({ target: games.id, set: excludedColumns(games, ['id', 'createdAt']) });
}
```

`apps/api/src/repo/lists.ts`:

```ts
import type { ArmyList } from '@bcp/shared';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import { armyLists, players } from '../db/schema';

/** Players whose BCP list id we know but whose list text we have not stored yet. */
export async function findPlayersMissingLists(
  db: Db,
  eventId: string,
): Promise<{ playerId: string; listId: string }[]> {
  const rows = await db
    .select({ playerId: players.id, listId: players.listId })
    .from(players)
    .leftJoin(armyLists, eq(armyLists.playerId, players.id))
    .where(and(eq(players.eventId, eventId), isNotNull(players.listId), isNull(armyLists.playerId)))
    .orderBy(players.id);
  return rows.flatMap(({ playerId, listId }) => (listId === null ? [] : [{ playerId, listId }]));
}

export async function saveArmyList(
  db: Db,
  playerId: string,
  list: Fetched<ArmyList>,
): Promise<void> {
  const values = { listId: list.bcpId, text: list.text, raw: list.raw, fetchedAt: new Date() };
  await db
    .insert(armyLists)
    .values({ playerId, ...values })
    .onConflictDoUpdate({ target: armyLists.playerId, set: values });
}
```

- [ ] **Step 5: Implement the sync-run repository**

`apps/api/src/repo/sync-runs.ts`:

```ts
import type { SyncKind, SyncRequest, SyncRun } from '@bcp/shared';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { syncRuns } from '../db/schema';

type SyncRunRow = typeof syncRuns.$inferSelect;
const ACTIVE = ['queued', 'running'] as const;

export function eventIdOf(request: SyncRequest): string | null {
  return request.kind === 'catalog' ? null : request.eventId;
}

function toSyncRun(row: SyncRunRow): SyncRun {
  return {
    id: row.id,
    kind: row.kind,
    eventId: row.eventId,
    status: row.status,
    total: row.total,
    done: row.done,
    failed: row.failed,
    error: row.error,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/** Creates a queued run, or returns null if an equivalent run is already active. */
export async function createSyncRun(db: Db, request: SyncRequest): Promise<SyncRun | null> {
  const [row] = await db
    .insert(syncRuns)
    .values({ kind: request.kind, eventId: eventIdOf(request), params: request, status: 'queued' })
    .onConflictDoNothing()
    .returning();
  return row ? toSyncRun(row) : null;
}

export async function findActiveSyncRun(
  db: Db,
  kind: SyncKind,
  eventId: string | null,
): Promise<SyncRun | null> {
  const [row] = await db
    .select()
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.kind, kind),
        eventId === null ? isNull(syncRuns.eventId) : eq(syncRuns.eventId, eventId),
        inArray(syncRuns.status, [...ACTIVE]),
      ),
    );
  return row ? toSyncRun(row) : null;
}

export async function getSyncRun(db: Db, id: number): Promise<SyncRun | null> {
  const [row] = await db.select().from(syncRuns).where(eq(syncRuns.id, id));
  return row ? toSyncRun(row) : null;
}

export async function markSyncRunRunning(db: Db, id: number): Promise<void> {
  await db.update(syncRuns).set({ status: 'running' }).where(eq(syncRuns.id, id));
}

export async function setSyncRunTotal(db: Db, id: number, total: number): Promise<void> {
  await db.update(syncRuns).set({ total }).where(eq(syncRuns.id, id));
}

/** Atomic `done += by` / `failed += by`, safe with concurrent workers. */
export async function incrementSyncRun(
  db: Db,
  id: number,
  field: 'done' | 'failed',
  by = 1,
): Promise<void> {
  const column = syncRuns[field];
  await db
    .update(syncRuns)
    .set({ [field]: sql`${column} + ${by}` })
    .where(eq(syncRuns.id, id));
}

export async function finishSyncRun(
  db: Db,
  id: number,
  outcome: { status: 'succeeded' } | { status: 'failed'; error: string },
): Promise<void> {
  await db
    .update(syncRuns)
    .set({
      status: outcome.status,
      error: outcome.status === 'failed' ? outcome.error : null,
      finishedAt: new Date(),
    })
    .where(eq(syncRuns.id, id));
}

/** Runs are in-process; any still active at startup were cut off by a restart. */
export async function failInterruptedSyncRuns(db: Db): Promise<number> {
  const rows = await db
    .update(syncRuns)
    .set({ status: 'failed', error: 'Interrupted by a server restart', finishedAt: new Date() })
    .where(inArray(syncRuns.status, [...ACTIVE]))
    .returning({ id: syncRuns.id });
  return rows.length;
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm vitest run --project api src/repo`
Expected: PASS, 11 tests.

- [ ] **Step 7: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): add repositories for events, participants, pairings, lists and sync runs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Sync jobs and runner

**Files:**

- Create: `apps/api/src/sync/jobs.ts`, `apps/api/src/sync/runner.ts`
- Test: `apps/api/src/sync/runner.test.ts`

**Interfaces:**

- Consumes: `TournamentSource`, every repository function (Task 8), `BcpAuthError`, `Logger`.
- Produces:
  - `interface Progress { setTotal(n): Promise<void>; succeeded(n?): Promise<void>; failed(n?): Promise<void> }`
  - `interface JobContext { db; source; progress; logger }`
  - `runJob(ctx, request): Promise<void>`
  - `new SyncRunner({ db, source, logger })`, with `.start(request): Promise<SyncRun>` and `.idle(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/sync/runner.test.ts`:

```ts
import { count, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BcpSource } from '../bcp/source';
import type { Db } from '../db/client';
import { armyLists, events, games, players, teamMatchups, teams } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { BcpAuthError, BcpUnavailableError } from '../errors';
import { findEvent } from '../repo/events';
import { getSyncRun } from '../repo/sync-runs';
import { sampleSource, silentLogger } from '../test/helpers';
import { SyncRunner } from './runner';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

const EVENT = 'EVTTEAM0001';

async function runToCompletion(runner: SyncRunner, request: Parameters<SyncRunner['start']>[0]) {
  const run = await runner.start(request);
  await runner.idle();
  return getSyncRun(db, run.id);
}

const rowCount = async (table: PgTable) => (await db.select({ n: count() }).from(table))[0]?.n;

describe('SyncRunner', () => {
  it('catalog: pages through every search page', async () => {
    const runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
    const run = await runToCompletion(runner, {
      kind: 'catalog',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(run).toMatchObject({ status: 'succeeded', done: 3 });
    expect(await rowCount(events)).toBe(3);
  });

  it('event: stores detail, teams and players', async () => {
    const runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
    const run = await runToCompletion(runner, { kind: 'event', eventId: EVENT });
    expect(run).toMatchObject({ status: 'succeeded', total: 1, done: 1 });
    expect(await rowCount(teams)).toBe(4);
    expect(await rowCount(players)).toBe(8);
    expect((await findEvent(db, EVENT))?.lastSyncedAt).toBeInstanceOf(Date);
  });

  it('pairings: syncs the event first when needed, then every round', async () => {
    const runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
    const run = await runToCompletion(runner, { kind: 'pairings', eventId: EVENT });
    expect(run).toMatchObject({ status: 'succeeded', total: 2, done: 2 });
    expect(await rowCount(players)).toBe(8);
    expect(await rowCount(teamMatchups)).toBe(4);
    expect(await rowCount(games)).toBe(8);
    const [draw] = await db.select().from(games).where(eq(games.id, 'GM-R2-4'));
    expect(draw).toMatchObject({ result: 'draw', firstTurn: 'b', teamMatchupId: 'TP-R2-2' });
  });

  it('lists: fetches every missing list and counts failures without failing the run', async () => {
    const source = sampleSource();
    const flaky: BcpSource = Object.assign(Object.create(source) as BcpSource, {
      getList: (listId: string) =>
        listId === 'LS-GIA'
          ? Promise.reject(new BcpUnavailableError('BCP hiccup'))
          : source.getList(listId),
    });
    const runner = new SyncRunner({ db, source: flaky, logger: silentLogger });

    const run = await runToCompletion(runner, { kind: 'lists', eventId: EVENT });

    expect(run).toMatchObject({ status: 'succeeded', total: 7, done: 6, failed: 1 });
    expect(await rowCount(armyLists)).toBe(6);
  });

  it('lists: aborts the whole run when the BCP login is broken', async () => {
    const source = sampleSource();
    const loggedOut: BcpSource = Object.assign(Object.create(source) as BcpSource, {
      getList: () => Promise.reject(new BcpAuthError('Session expired')),
    });
    const runner = new SyncRunner({ db, source: loggedOut, logger: silentLogger });

    const run = await runToCompletion(runner, { kind: 'lists', eventId: EVENT });

    expect(run).toMatchObject({ status: 'failed', error: 'Session expired', done: 0 });
  });

  it('returns the already-active run instead of starting a duplicate', async () => {
    const runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
    const [a, b] = await Promise.all([
      runner.start({ kind: 'event', eventId: EVENT }),
      runner.start({ kind: 'event', eventId: EVENT }),
    ]);
    await runner.idle();
    expect(a.id).toBe(b.id);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm vitest run --project api src/sync`
Expected: FAIL, because the module `./runner` does not exist.

- [ ] **Step 3: Implement the jobs**

`apps/api/src/sync/jobs.ts`:

```ts
import type { SyncRequest } from '@bcp/shared';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { BcpAuthError } from '../errors';
import type { Logger } from '../logger';
import {
  findEvent,
  markEventSynced,
  upsertEventDetail,
  upsertEventSummaries,
  type EventRow,
} from '../repo/events';
import { findPlayersMissingLists, saveArmyList } from '../repo/lists';
import { upsertGames, upsertTeamMatchups } from '../repo/pairings';
import { upsertPlayers, upsertTeams } from '../repo/participants';

export interface Progress {
  setTotal(total: number): Promise<void>;
  succeeded(count?: number): Promise<void>;
  failed(count?: number): Promise<void>;
}

export interface JobContext {
  db: Db;
  source: TournamentSource;
  progress: Progress;
  logger: Logger;
}

type RequestOf<K extends SyncRequest['kind']> = Extract<SyncRequest, { kind: K }>;

export function runJob(ctx: JobContext, request: SyncRequest): Promise<void> {
  switch (request.kind) {
    case 'catalog':
      return syncCatalog(ctx, request);
    case 'event':
      return syncEventJob(ctx, request);
    case 'pairings':
      return syncPairings(ctx, request);
    case 'lists':
      return syncLists(ctx, request);
  }
}

/** Every 40k event in the range, page by page. Progress counts events stored. */
async function syncCatalog(ctx: JobContext, { from, to }: RequestOf<'catalog'>): Promise<void> {
  let cursor: string | null = null;
  do {
    const page = await ctx.source.listEvents({ from, to }, cursor);
    await upsertEventSummaries(ctx.db, page.items);
    await ctx.progress.succeeded(page.items.length);
    cursor = page.nextCursor;
  } while (cursor !== null);
}

/** Event detail, teams (team events only) and players. */
async function syncEvent(ctx: JobContext, eventId: string): Promise<EventRow> {
  const event = await ctx.source.getEvent(eventId);
  await upsertEventDetail(ctx.db, event);
  if (event.isTeamEvent) await upsertTeams(ctx.db, await ctx.source.getTeams(eventId));
  await upsertPlayers(ctx.db, await ctx.source.getPlayers(eventId));
  await markEventSynced(ctx.db, eventId);

  const row = await findEvent(ctx.db, eventId);
  if (!row) throw new Error(`Event ${eventId} vanished right after being stored`);
  return row;
}

/** Pairings and lists need players in the database; fetch them once if we never have. */
async function ensureEventSynced(ctx: JobContext, eventId: string): Promise<EventRow> {
  const existing = await findEvent(ctx.db, eventId);
  return existing?.lastSyncedAt ? existing : syncEvent(ctx, eventId);
}

async function syncEventJob(ctx: JobContext, { eventId }: RequestOf<'event'>): Promise<void> {
  await ctx.progress.setTotal(1);
  await syncEvent(ctx, eventId);
  await ctx.progress.succeeded();
}

/** Team matchups and games for every round. Progress counts rounds. */
async function syncPairings(ctx: JobContext, { eventId }: RequestOf<'pairings'>): Promise<void> {
  const event = await ensureEventSynced(ctx, eventId);
  await ctx.progress.setTotal(event.roundCount);
  for (let round = 1; round <= event.roundCount; round += 1) {
    if (event.isTeamEvent) {
      await upsertTeamMatchups(ctx.db, await ctx.source.getTeamMatchups(eventId, round));
    }
    await upsertGames(ctx.db, await ctx.source.getGames(eventId, round));
    await ctx.progress.succeeded();
  }
}

/**
 * One request per missing list. A single failure is counted and skipped, so a retry
 * fetches only what is still missing. A broken login aborts, since every later list would fail too.
 */
async function syncLists(ctx: JobContext, { eventId }: RequestOf<'lists'>): Promise<void> {
  await ensureEventSynced(ctx, eventId);
  const missing = await findPlayersMissingLists(ctx.db, eventId);
  await ctx.progress.setTotal(missing.length);

  for (const { playerId, listId } of missing) {
    try {
      const list = await ctx.source.getList(listId);
      if (list === null) {
        ctx.logger.warn({ playerId, listId }, 'BCP has no list for this player');
        await ctx.progress.failed();
        continue;
      }
      await saveArmyList(ctx.db, playerId, list);
      await ctx.progress.succeeded();
    } catch (error) {
      if (error instanceof BcpAuthError) throw error;
      ctx.logger.warn({ err: error, playerId, listId }, 'Could not fetch list');
      await ctx.progress.failed();
    }
  }
}
```

- [ ] **Step 4: Implement the runner**

`apps/api/src/sync/runner.ts`:

```ts
import type { SyncRequest, SyncRun } from '@bcp/shared';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import type { Logger } from '../logger';
import {
  createSyncRun,
  eventIdOf,
  findActiveSyncRun,
  finishSyncRun,
  incrementSyncRun,
  markSyncRunRunning,
  setSyncRunTotal,
} from '../repo/sync-runs';
import { runJob, type Progress } from './jobs';

export interface SyncRunnerDeps {
  db: Db;
  source: TournamentSource;
  logger: Logger;
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Runs sync jobs in the background of this process and records their progress in sync_runs. */
export class SyncRunner {
  readonly #deps: SyncRunnerDeps;
  readonly #inFlight = new Set<Promise<void>>();

  constructor(deps: SyncRunnerDeps) {
    this.#deps = deps;
  }

  /** Starts a sync in the background, or returns the equivalent run that is already active. */
  async start(request: SyncRequest): Promise<SyncRun> {
    const { db } = this.#deps;
    const created = await createSyncRun(db, request);
    if (!created) {
      const active = await findActiveSyncRun(db, request.kind, eventIdOf(request));
      // The active run finished between our insert and select: try again.
      return active ?? this.start(request);
    }

    const job = this.#execute(created.id, request);
    this.#inFlight.add(job);
    void job.finally(() => this.#inFlight.delete(job));
    return created;
  }

  /** Resolves once every background job has settled. */
  async idle(): Promise<void> {
    while (this.#inFlight.size > 0) await Promise.allSettled([...this.#inFlight]);
  }

  async #execute(runId: number, request: SyncRequest): Promise<void> {
    const { db, source } = this.#deps;
    const logger = this.#deps.logger.child({ syncRunId: runId, kind: request.kind });
    const progress: Progress = {
      setTotal: (total) => setSyncRunTotal(db, runId, total),
      succeeded: (count = 1) => incrementSyncRun(db, runId, 'done', count),
      failed: (count = 1) => incrementSyncRun(db, runId, 'failed', count),
    };

    try {
      await markSyncRunRunning(db, runId);
      await runJob({ db, source, progress, logger }, request);
      await finishSyncRun(db, runId, { status: 'succeeded' });
      logger.info('Sync finished');
    } catch (error) {
      logger.error({ err: error }, 'Sync failed');
      await finishSyncRun(db, runId, { status: 'failed', error: describeError(error) }).catch(
        (finishError: unknown) => {
          logger.error({ err: finishError }, 'Could not record sync failure');
        },
      );
    }
  }
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm vitest run --project api src/sync`
Expected: PASS, 6 tests.

- [ ] **Step 6: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): add background sync jobs for catalogue, events, pairings and lists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: HTTP routes and process wiring

**Files:**

- Create: `apps/api/src/routes/events.ts`, `apps/api/src/routes/sync.ts`, `apps/api/src/routes/bcp.ts`, `apps/api/src/bcp/create-source.ts`
- Modify: `apps/api/src/app.ts` (replace the whole file), `apps/api/src/main.ts` (replace the whole file), `apps/api/src/app.test.ts` (update `createApp` calls)
- Test: `apps/api/src/routes/routes.test.ts`

**Interfaces:**

- Consumes: the repositories, `SyncRunner`, `BcpAuth`, `HttpTransport`, `RateLimiter`, `FixtureTransport`, `BcpSource`, `createDbSessionStore`, `Config`.
- Produces:
  - Routes:
    - `GET /api/events` → `EventListResponse`
    - `GET /api/events/:id` → `EventListItem`
    - `POST /api/sync` → 202 `SyncRun`
    - `GET /api/sync-runs/:id` → `SyncRun`
    - `GET /api/bcp/status` → `BcpStatus`
  - `interface AppDeps { db; runner; bcpStatus: () => Promise<BcpStatus>; logger }`
  - `createSource(config, { db, logger }): { source; status }`

- [ ] **Step 1: Write the failing route tests**

`apps/api/src/routes/routes.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BcpStatus } from '@bcp/shared';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { SyncRunner } from '../sync/runner';
import { sampleSource, silentLogger } from '../test/helpers';

let db: Db;
let close: () => Promise<void>;
let runner: SyncRunner;
let app: ReturnType<typeof createApp>;

const status: BcpStatus = {
  source: 'fixtures',
  authenticated: false,
  accessTokenExpiresAt: null,
  lastRefreshAt: null,
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
  app = createApp({ db, runner, bcpStatus: () => Promise.resolve(status), logger: silentLogger });
});
afterAll(() => close());
beforeEach(() => resetDb(db));

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('API routes', () => {
  it('syncs the catalogue and then searches it', async () => {
    const started = await post('/api/sync', {
      kind: 'catalog',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(started.status).toBe(202);
    const run = (await started.json()) as { id: number };
    await runner.idle();

    const progress = await app.request(`/api/sync-runs/${run.id}`);
    expect(await progress.json()).toMatchObject({ status: 'succeeded', done: 3 });

    const search = await app.request('/api/events?minPlayers=40');
    expect(await search.json()).toMatchObject({ total: 1, items: [{ bcpId: 'EVTSINGLE01' }] });
  });

  it('returns a synced event, and 404 for an unknown one', async () => {
    await post('/api/sync', { kind: 'event', eventId: 'EVTTEAM0001' });
    await runner.idle();

    const found = await app.request('/api/events/EVTTEAM0001');
    expect(await found.json()).toMatchObject({
      city: 'Springfield',
      lastSyncedAt: expect.any(String),
    });

    const missing = await app.request('/api/events/NOPE');
    expect(missing.status).toBe(404);
  });

  it('validates sync requests and query strings', async () => {
    const badSync = await post('/api/sync', {
      kind: 'catalog',
      from: '2026-12-31',
      to: '2026-01-01',
    });
    expect(badSync.status).toBe(400);
    expect(await badSync.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    expect((await app.request('/api/events?pageSize=1000')).status).toBe(400);
    expect((await app.request('/api/sync-runs/abc')).status).toBe(400);
    expect((await app.request('/api/sync-runs/999')).status).toBe(404);
  });

  it('reports the BCP connection status', async () => {
    expect(await (await app.request('/api/bcp/status')).json()).toEqual(status);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm vitest run --project api src/routes`
Expected: FAIL, because `createApp` does not accept `db`, `runner` or `bcpStatus` yet (a type error), and the routes return 404.

- [ ] **Step 3: Implement the routes**

`apps/api/src/routes/events.ts`:

```ts
import { EventListQuerySchema } from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { findEvent, searchEvents, toEventListItem } from '../repo/events';
import { parseInput } from '../validation';

export function eventRoutes(deps: { db: Db }) {
  return new Hono()
    .get('/events', async (c) => {
      const query = parseInput(EventListQuerySchema, c.req.query());
      return c.json(await searchEvents(deps.db, query));
    })
    .get('/events/:id', async (c) => {
      const id = c.req.param('id');
      const row = await findEvent(deps.db, id);
      if (!row) throw new NotFoundError(`Event ${id} is not in the local catalogue`);
      return c.json(toEventListItem(row));
    });
}
```

`apps/api/src/routes/sync.ts`:

```ts
import { SyncRequestSchema } from '@bcp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { getSyncRun } from '../repo/sync-runs';
import type { SyncRunner } from '../sync/runner';
import { parseInput } from '../validation';

const SyncRunIdSchema = z.coerce.number().int().positive();

export function syncRoutes(deps: { db: Db; runner: SyncRunner }) {
  return new Hono()
    .post('/sync', async (c) => {
      const body = await c.req.json<unknown>().catch(() => null);
      const run = await deps.runner.start(parseInput(SyncRequestSchema, body));
      return c.json(run, 202);
    })
    .get('/sync-runs/:id', async (c) => {
      const id = parseInput(SyncRunIdSchema, c.req.param('id'));
      const run = await getSyncRun(deps.db, id);
      if (!run) throw new NotFoundError(`Sync run ${id} not found`);
      return c.json(run);
    });
}
```

`apps/api/src/routes/bcp.ts`:

```ts
import type { BcpStatus } from '@bcp/shared';
import { Hono } from 'hono';

export function bcpRoutes(deps: { bcpStatus: () => Promise<BcpStatus> }) {
  return new Hono().get('/bcp/status', async (c) => c.json(await deps.bcpStatus()));
}
```

Replace `apps/api/src/app.ts` with:

```ts
import type { ApiErrorBody, BcpStatus } from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from './db/client';
import { AppError, BcpRateLimitedError, toErrorBody } from './errors';
import type { Logger } from './logger';
import { bcpRoutes } from './routes/bcp';
import { eventRoutes } from './routes/events';
import { syncRoutes } from './routes/sync';
import type { SyncRunner } from './sync/runner';

export interface AppDeps {
  db: Db;
  runner: SyncRunner;
  bcpStatus: () => Promise<BcpStatus>;
  logger: Logger;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof AppError) {
      if (error instanceof BcpRateLimitedError) {
        c.header('Retry-After', String(error.retryAfterSeconds));
      }
      return c.json(toErrorBody(error), error.status);
    }
    deps.logger.error({ err: error }, 'Unhandled error');
    const body: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Something went wrong' } };
    return c.json(body, 500);
  });

  app.notFound((c) => {
    const body: ApiErrorBody = {
      error: { code: 'NOT_FOUND', message: `No route for ${c.req.method} ${c.req.path}` },
    };
    return c.json(body, 404);
  });

  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  app.route('/api', eventRoutes(deps));
  app.route('/api', syncRoutes(deps));
  app.route('/api', bcpRoutes(deps));

  return app;
}
```

In `apps/api/src/app.test.ts`, the app now needs real dependencies. Replace everything from the top of the file down to the first `describe(` with:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { Db } from './db/client';
import { createTestDb } from './db/test-db';
import { BcpRateLimitedError, NotFoundError } from './errors';
import { SyncRunner } from './sync/runner';
import { sampleSource, silentLogger } from './test/helpers';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

function makeApp() {
  return createApp({
    db,
    runner: new SyncRunner({ db, source: sampleSource(), logger: silentLogger }),
    bcpStatus: () =>
      Promise.resolve({
        source: 'fixtures',
        authenticated: false,
        accessTokenExpiresAt: null,
        lastRefreshAt: null,
      }),
    logger: silentLogger,
  });
}

function appWithBoomRoutes() {
  const app = makeApp();
  app.get('/boom/not-found', () => {
    throw new NotFoundError('Event X not found');
  });
  app.get('/boom/rate-limited', () => {
    throw new BcpRateLimitedError(30);
  });
  app.get('/boom/unexpected', () => {
    throw new Error('kaboom');
  });
  return app;
}
```

Then, in the tests, replace both occurrences of `createApp({ logger: silentLogger })` with `makeApp()`.

- [ ] **Step 4: Wire the real process**

`apps/api/src/bcp/create-source.ts`:

```ts
import path from 'node:path';
import type { BcpStatus } from '@bcp/shared';
import type { Config } from '../config';
import type { Db } from '../db/client';
import type { Logger } from '../logger';
import { BcpAuth } from './auth';
import { createDbSessionStore } from './auth-store';
import { FixtureTransport } from './fixture-transport';
import { HttpTransport } from './http-transport';
import { RateLimiter } from './rate-limiter';
import { BcpSource, type TournamentSource } from './source';

export interface SourceBundle {
  source: TournamentSource;
  status: () => Promise<BcpStatus>;
}

export function createSource(config: Config, deps: { db: Db; logger: Logger }): SourceBundle {
  if (config.TOURNAMENT_SOURCE === 'fixtures') {
    const dir = path.resolve(config.FIXTURES_DIR);
    deps.logger.info({ dir }, 'Serving BCP data from fixtures');
    return {
      source: new BcpSource(new FixtureTransport(dir)),
      status: () =>
        Promise.resolve({
          source: 'fixtures',
          authenticated: false,
          accessTokenExpiresAt: null,
          lastRefreshAt: null,
        }),
    };
  }

  if (!config.BCP_REFRESH_TOKEN && !config.BCP_ACCESS_TOKEN) {
    deps.logger.warn(
      'No BCP_REFRESH_TOKEN or BCP_ACCESS_TOKEN set: requests are anonymous and army lists will fail',
    );
  }
  const logger = deps.logger.child({ module: 'bcp' });
  const auth = new BcpAuth({
    apiUrl: config.BCP_API_URL,
    store: createDbSessionStore(deps.db),
    envRefreshToken: config.BCP_REFRESH_TOKEN,
    envAccessToken: config.BCP_ACCESS_TOKEN,
    logger,
  });
  const transport = new HttpTransport({
    baseUrl: config.BCP_API_URL,
    timeoutMs: config.BCP_TIMEOUT_MS,
    maxAttempts: config.BCP_MAX_ATTEMPTS,
    limiter: new RateLimiter({
      requestsPerSecond: config.BCP_REQUESTS_PER_SECOND,
      maxConcurrency: config.BCP_MAX_CONCURRENCY,
    }),
    auth,
    logger,
  });
  return {
    source: new BcpSource(transport),
    status: async () => ({ source: 'bcp', ...(await auth.status()) }),
  };
}
```

Replace `apps/api/src/main.ts` with:

```ts
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createSource } from './bcp/create-source';
import { loadConfig } from './config';
import { createDb } from './db/client';
import { createLogger } from './logger';
import { failInterruptedSyncRuns } from './repo/sync-runs';
import { SyncRunner } from './sync/runner';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');

const database = createDb(config.DATABASE_URL);
await database.migrate();
const interrupted = await failInterruptedSyncRuns(database.db);
if (interrupted > 0)
  logger.warn({ interrupted }, 'Marked sync runs cut off by a restart as failed');

const { source, status } = createSource(config, { db: database.db, logger });
const runner = new SyncRunner({ db: database.db, source, logger });
const app = createApp({ db: database.db, runner, bcpStatus: status, logger });

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info(
    `API listening on http://localhost:${info.port} (source: ${config.TOURNAMENT_SOURCE})`,
  );
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down');
  server.close();
  await database.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm vitest run --project api`
Expected: every `api` test passes, including `app.test.ts` and `routes.test.ts`.

- [ ] **Step 6: Smoke-test against real Postgres, serving fixtures**

```bash
pnpm db:up
pnpm --filter @bcp/api start &
sleep 3
curl -s -X POST localhost:3001/api/sync -H 'content-type: application/json' \
  -d '{"kind":"pairings","eventId":"EVTTEAM0001"}'
sleep 1
curl -s localhost:3001/api/sync-runs/1
curl -s 'localhost:3001/api/events/EVTTEAM0001'
kill %1
```

Expected:

- The first call returns 202 with `{"id":1,"kind":"pairings",...,"status":"queued"}`.
- The second shows `"status":"succeeded","total":2,"done":2`.
- The third returns the event with `"city":"Springfield"`.

- [ ] **Step 7: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): expose events, sync and BCP status routes and wire the server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Web shell — React Compiler, Mantine sci-fi dark theme, router, settings page

**Files:**

- Create:
  - `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/postcss.config.js`
  - `apps/web/src/main.tsx`, `apps/web/src/router.ts`, `apps/web/src/theme.ts`, `apps/web/src/styles/global.css`
  - `apps/web/src/api/client.ts`, `apps/web/src/api/query-client.ts`, `apps/web/src/lib/format.ts`
  - `apps/web/src/components/AppLayout.tsx`, `apps/web/src/components/AppLayout.module.css`, `apps/web/src/components/Panel.tsx`, `apps/web/src/components/Panel.module.css`
  - `apps/web/src/routes/__root.tsx`, `apps/web/src/routes/index.tsx`, `apps/web/src/routes/settings.tsx`
  - `apps/web/src/features/settings/bcp-status-query.ts`, `apps/web/src/features/settings/BcpStatusCard.tsx`, `apps/web/src/features/settings/BcpStatusCard.module.css`
  - `apps/web/src/test/setup.ts`, `apps/web/src/test/render.tsx`
- Generated and committed: `apps/web/src/routeTree.gen.ts`
- Test: `apps/web/src/features/settings/BcpStatusCard.test.tsx`, `apps/web/src/api/client.test.ts`

**Interfaces:**

- Consumes: `BcpStatusSchema`, `ApiErrorBodySchema`, `ApiErrorCode` from `@bcp/shared`; `GET /api/bcp/status` (Task 10).
- Produces:
  - `apiGet<S>(path, schema): Promise<z.output<S>>`
  - `class ApiError { status; code; details }`
  - `queryClient`
  - `theme`
  - `<Panel title?>`, the standard surface every later UI plan uses for content blocks
  - `<AppLayout>`
  - `formatDateTime(iso)`
  - `renderWithProviders(ui)`

**Design direction: sci-fi HUD, dark only.**

- **Colour scheme:**
  - The whole app is forced to the dark colour scheme (`forceColorScheme="dark"`). There is no light theme and no toggle.
  - The page is a near-black navy with a faint neon grid.
  - Content sits in `Panel`s: translucent dark surfaces with a thin cyan edge, a glowing accent bar, and a cut top-right corner.
  - The primary accent is **neon cyan** (actions, focus, highlights). **Plasma magenta** is a secondary accent, used sparingly (e.g. "side B" in matchups later).
  - Status colours stay Mantine's green, red and yellow, so they read correctly in heatmaps later.
- **Type:**
  - **Orbitron** for headings, uppercase and letter-spaced.
  - **Exo 2** for body text, which stays readable in dense tables.
  - **JetBrains Mono** with tabular numbers for all figures.
- **Motion and accessibility:**
  - Motion is limited to a slow pulse on the "connected" status light, switched off under `prefers-reduced-motion`.
  - Glow effects are decoration only. Text contrast stays at WCAG AA or better against the backgrounds.

- [ ] **Step 1: Create the package and install dependencies**

`apps/web/package.json`:

```json
{
  "name": "@bcp/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsr generate && tsc -p tsconfig.json && vite build",
    "preview": "vite preview",
    "typecheck": "tsr generate && tsc -p tsconfig.json"
  }
}
```

```bash
pnpm --filter @bcp/web add react react-dom @mantine/core @mantine/hooks @tanstack/react-router @tanstack/react-query zod @bcp/shared@workspace:* @fontsource-variable/orbitron @fontsource-variable/exo-2 @fontsource-variable/jetbrains-mono
pnpm --filter @bcp/web add -D vite @vitejs/plugin-react @rolldown/plugin-babel @babel/core @types/babel__core babel-plugin-react-compiler @tanstack/router-plugin @tanstack/router-cli postcss postcss-preset-mantine @types/react @types/react-dom jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client", "node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`apps/web/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import babel from '@rolldown/plugin-babel';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // Generates src/routeTree.gen.ts from src/routes; must run before the React plugin.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    // React Compiler 1.0 (stable Babel version): memoises components automatically,
    // so the code never needs manual useMemo/useCallback.
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
```

`apps/web/postcss.config.js`:

```js
export default { plugins: { 'postcss-preset-mantine': {} } };
```

`apps/web/index.html`:

```html
<!doctype html>
<html lang="en" data-mantine-color-scheme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <meta name="theme-color" content="#0b1122" />
    <title>BCP Analyzer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the theme and global styles**

`apps/web/src/theme.ts`:

```ts
import { createTheme, Title, type MantineColorsTuple } from '@mantine/core';

/**
 * Near-black navy. Mantine's dark scheme uses dark[7] for the page, dark[6] for surfaces,
 * dark[4] for borders and dark[0] for text, so this tuple sets the whole mood.
 */
const dark: MantineColorsTuple = [
  '#d5def0',
  '#a9b7d1',
  '#7f8fb0',
  '#5a6a8e',
  '#3d4c70',
  '#2a3656',
  '#1b2440',
  '#121a30',
  '#0b1122',
  '#060a16',
];

/** Neon cyan: the primary accent for actions, focus rings and highlights. */
const neon: MantineColorsTuple = [
  '#e0fdff',
  '#b3f7ff',
  '#80f0ff',
  '#4de8ff',
  '#26e2ff',
  '#00dcff',
  '#00c4e6',
  '#00a3bf',
  '#008299',
  '#006173',
];

/** Plasma magenta: secondary accent. Use sparingly so cyan stays the lead colour. */
const plasma: MantineColorsTuple = [
  '#ffe3fb',
  '#ffb8f3',
  '#ff8ceb',
  '#ff5fe3',
  '#ff3bdc',
  '#ff1fd6',
  '#e600bf',
  '#b80099',
  '#8a0073',
  '#5c004d',
];

export const theme = createTheme({
  colors: { dark, neon, plasma },
  primaryColor: 'neon',
  primaryShade: { light: 6, dark: 5 },
  white: '#eef3ff',
  black: '#060a16',
  fontFamily: '"Exo 2 Variable", system-ui, sans-serif',
  fontFamilyMonospace: '"JetBrains Mono Variable", ui-monospace, monospace',
  headings: { fontFamily: '"Orbitron Variable", "Exo 2 Variable", sans-serif', fontWeight: '700' },
  defaultRadius: 0,
  cursorType: 'pointer',
  components: {
    Title: Title.extend({
      styles: { root: { textTransform: 'uppercase', letterSpacing: '0.08em' } },
    }),
  },
});
```

`apps/web/src/styles/global.css`:

```css
/* Page backdrop: a faint cyan glow from the top over a 32px tactical grid. */
body {
  min-height: 100vh;
  background-color: var(--mantine-color-dark-8);
  background-image:
    radial-gradient(ellipse 80% 50% at 50% 0%, rgb(0 220 255 / 0.1), transparent 70%),
    linear-gradient(rgb(0 220 255 / 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgb(0 220 255 / 0.035) 1px, transparent 1px);
  background-size:
    100% 100%,
    32px 32px,
    32px 32px;
  background-attachment: fixed;
}

::selection {
  background: rgb(0 220 255 / 0.35);
  color: var(--mantine-color-white);
}

/* Figures line up in columns: use on every number shown in tables and stats. */
.numeric {
  font-family: var(--mantine-font-family-monospace);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Write the Panel and layout components**

`apps/web/src/components/Panel.module.css`:

```css
.panel {
  position: relative;
  background: linear-gradient(180deg, rgb(18 26 48 / 0.92), rgb(11 17 34 / 0.92));
  border: 1px solid rgb(0 220 255 / 0.22);
  box-shadow: inset 0 0 32px rgb(0 220 255 / 0.05);
  /* Cut top-right corner: the signature HUD shape. */
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%);
  backdrop-filter: blur(4px);
}

/* Glowing accent bar on the top-left edge. */
.panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 72px;
  height: 2px;
  background: var(--mantine-color-neon-5);
  box-shadow: 0 0 10px var(--mantine-color-neon-5);
}

.label {
  margin-bottom: var(--mantine-spacing-sm);
  font-family: var(--mantine-font-family-headings);
  font-size: var(--mantine-font-size-xs);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--mantine-color-neon-3);
}
```

`apps/web/src/components/Panel.tsx`:

```tsx
import { Paper, Text, type PaperProps } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './Panel.module.css';

interface PanelProps extends PaperProps {
  /** Small uppercase caption above the content, like a HUD readout label. */
  title?: string;
  children: ReactNode;
}

/** The standard surface for every content block: dark glass, neon edge, cut corner. */
export function Panel({ title, children, ...paperProps }: PanelProps) {
  return (
    <Paper component="section" className={classes.panel} p="lg" {...paperProps}>
      {title !== undefined && <Text className={classes.label}>{title}</Text>}
      {children}
    </Paper>
  );
}
```

`apps/web/src/components/AppLayout.module.css`:

```css
.header {
  background: rgb(6 10 22 / 0.85);
  border-bottom: 1px solid rgb(0 220 255 / 0.3);
  box-shadow: 0 1px 16px rgb(0 220 255 / 0.12);
  backdrop-filter: blur(6px);
}

.brand {
  font-family: var(--mantine-font-family-headings);
  font-size: var(--mantine-font-size-lg);
  font-weight: 800;
  text-decoration: none;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--mantine-color-neon-4);
  text-shadow: 0 0 12px rgb(0 220 255 / 0.55);
}

.brandAccent {
  color: var(--mantine-color-plasma-4);
  text-shadow: 0 0 12px rgb(255 31 214 / 0.5);
}

.navLink {
  padding: 6px 2px;
  font-family: var(--mantine-font-family-headings);
  font-size: var(--mantine-font-size-xs);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--mantine-color-dark-1);
  border-bottom: 2px solid transparent;
  transition:
    color 150ms ease,
    border-color 150ms ease;
}

.navLink:hover {
  color: var(--mantine-color-neon-3);
}

.navLink[data-status='active'] {
  color: var(--mantine-color-neon-4);
  border-bottom-color: var(--mantine-color-neon-5);
}
```

`apps/web/src/components/AppLayout.tsx`:

```tsx
import { AppShell, Container, Group } from '@mantine/core';
import { Link, Outlet } from '@tanstack/react-router';
import classes from './AppLayout.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'Tournaments' },
  { to: '/settings', label: 'Settings' },
] as const;

export function AppLayout() {
  return (
    <AppShell header={{ height: 60 }} padding="lg">
      <AppShell.Header className={classes.header}>
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between">
            <Link to="/" className={classes.brand}>
              BCP<span className={classes.brandAccent}>//</span>Analyzer
            </Link>
            <Group component="nav" gap="xl">
              {NAV_ITEMS.map((item) => (
                <Link key={item.to} to={item.to} className={classes.navLink}>
                  {item.label}
                </Link>
              ))}
            </Group>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
```

(TanStack Router's `Link` sets `data-status="active"` on the current route, which the CSS above styles.)

- [ ] **Step 4: Write the failing tests**

`apps/web/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom lacks these browser APIs; Mantine needs them.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;
```

`apps/web/src/test/render.tsx`:

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
    <MantineProvider theme={theme} forceColorScheme="dark">
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MantineProvider>,
  );
}

/** Makes fetch answer every request with the given JSON body and status. */
export function stubFetchJson(body: unknown, status = 200) {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json(body, { status })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
```

`apps/web/src/api/client.test.ts`:

```ts
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { stubFetchJson } from '../test/render';
import { ApiError, apiGet } from './client';

describe('apiGet', () => {
  it('parses successful responses with the given schema', async () => {
    stubFetchJson({ status: 'ok' });
    await expect(apiGet('/api/health', z.object({ status: z.literal('ok') }))).resolves.toEqual({
      status: 'ok',
    });
  });

  it('turns API error bodies into ApiError with code and status', async () => {
    stubFetchJson({ error: { code: 'BCP_AUTH', message: 'Session expired' } }, 502);
    const error = await apiGet('/api/x', z.unknown()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'BCP_AUTH', message: 'Session expired' });
  });

  it('reports an unreachable API server clearly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(apiGet('/api/x', z.unknown())).rejects.toMatchObject({
      code: 'NETWORK',
      message: expect.stringContaining('API server') as unknown,
    });
  });
});
```

`apps/web/src/features/settings/BcpStatusCard.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchJson } from '../../test/render';
import { BcpStatusCard } from './BcpStatusCard';

describe('BcpStatusCard', () => {
  it('shows a live connection with its token expiry', async () => {
    stubFetchJson({
      source: 'bcp',
      authenticated: true,
      accessTokenExpiresAt: '2026-09-23T13:00:00.000Z',
      lastRefreshAt: '2026-09-23T12:00:00.000Z',
    });
    renderWithProviders(<BcpStatusCard />);
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText(/Token valid until/)).toBeInTheDocument();
  });

  it('explains fixture mode', async () => {
    stubFetchJson({
      source: 'fixtures',
      authenticated: false,
      accessTokenExpiresAt: null,
      lastRefreshAt: null,
    });
    renderWithProviders(<BcpStatusCard />);
    expect(await screen.findByText('Offline · fixtures')).toBeInTheDocument();
    expect(screen.getByText(/TOURNAMENT_SOURCE=bcp/)).toBeInTheDocument();
  });

  it('tells the user how to fix a missing login', async () => {
    stubFetchJson({
      source: 'bcp',
      authenticated: false,
      accessTokenExpiresAt: null,
      lastRefreshAt: null,
    });
    renderWithProviders(<BcpStatusCard />);
    expect(await screen.findByText('Not connected')).toBeInTheDocument();
    expect(screen.getByText(/BCP_REFRESH_TOKEN/)).toBeInTheDocument();
  });

  it('shows the API error with a retry button', async () => {
    stubFetchJson({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500);
    renderWithProviders(<BcpStatusCard />);
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the tests and watch them fail**

Run: `pnpm vitest run --project web`
Expected: FAIL, because the modules `./client` and `./BcpStatusCard` do not exist.

- [ ] **Step 6: Implement the API client, formatting, the query and the status card**

`apps/web/src/api/client.ts`:

```ts
import { ApiErrorBodySchema, type ApiErrorCode } from '@bcp/shared';
import type { z } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | 'NETWORK';
  readonly details: unknown;

  constructor(status: number, code: ApiErrorCode | 'NETWORK', message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** GETs JSON from our API and validates it, so components only ever see well-typed data. */
export async function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  let response: Response;
  try {
    response = await fetch(path, { headers: { accept: 'application/json' } });
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
  return schema.parse(body);
}
```

`apps/web/src/api/query-client.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

/** Retrying cannot fix bad requests or an expired BCP login, so only retry the rest. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!(error instanceof ApiError)) return true;
  return error.code !== 'BCP_AUTH' && (error.status === 0 || error.status >= 500);
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: shouldRetry } },
});
```

`apps/web/src/lib/format.ts`:

```ts
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
```

`apps/web/src/features/settings/bcp-status-query.ts`:

```ts
import { BcpStatusSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

export const bcpStatusQuery = queryOptions({
  queryKey: ['bcp', 'status'],
  queryFn: () => apiGet('/api/bcp/status', BcpStatusSchema),
});
```

`apps/web/src/features/settings/BcpStatusCard.module.css`:

```css
.light {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--light-color);
  box-shadow: 0 0 10px var(--light-color);
}

.pulse {
  animation: pulse 2.4s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pulse {
    animation: none;
  }
}
```

`apps/web/src/features/settings/BcpStatusCard.tsx`:

```tsx
import type { BcpStatus } from '@bcp/shared';
import { Alert, Badge, Button, Group, Skeleton, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Panel } from '../../components/Panel';
import { formatDateTime } from '../../lib/format';
import { bcpStatusQuery } from './bcp-status-query';
import classes from './BcpStatusCard.module.css';

const PANEL_TITLE = 'BCP uplink';

interface StatusView {
  label: string;
  color: string;
  live: boolean;
  description: string;
}

function describeStatus(status: BcpStatus): StatusView {
  if (status.source === 'fixtures') {
    return {
      label: 'Offline · fixtures',
      color: 'gray',
      live: false,
      description:
        'Serving saved sample data. Set TOURNAMENT_SOURCE=bcp in .env to connect to Best Coast Pairings.',
    };
  }
  if (status.authenticated) {
    return {
      label: 'Connected',
      color: 'neon',
      live: true,
      description: status.accessTokenExpiresAt
        ? `Token valid until ${formatDateTime(status.accessTokenExpiresAt)}. It refreshes automatically.`
        : 'Token active. It refreshes automatically.',
    };
  }
  return {
    label: 'Not connected',
    color: 'red',
    live: false,
    description:
      'No valid BCP login. Add BCP_REFRESH_TOKEN to .env (see the README) and restart the API.',
  };
}

export function BcpStatusCard() {
  const { data, error, isPending, refetch } = useQuery(bcpStatusQuery);

  if (isPending) {
    return (
      <Panel title={PANEL_TITLE}>
        <Skeleton height={56} />
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title={PANEL_TITLE}>
        <Alert color="red" title="Status unavailable">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">{error.message}</Text>
            <Button size="xs" color="red" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </Stack>
        </Alert>
      </Panel>
    );
  }

  const view = describeStatus(data);
  const lightStyle = { '--light-color': `var(--mantine-color-${view.color}-5)` } as CSSProperties;
  return (
    <Panel title={PANEL_TITLE}>
      <Stack gap="xs">
        <Group gap="sm">
          <span
            className={view.live ? `${classes.light} ${classes.pulse}` : classes.light}
            style={lightStyle}
            aria-hidden
          />
          <Badge color={view.color} variant="outline" size="lg" radius={0}>
            {view.label}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {view.description}
        </Text>
        {data.lastRefreshAt && (
          <Text size="xs" c="dimmed" className="numeric">
            Last refresh {formatDateTime(data.lastRefreshAt)}
          </Text>
        )}
      </Stack>
    </Panel>
  );
}
```

- [ ] **Step 7: Write the routes, router and entry point**

`apps/web/src/routes/__root.tsx`:

```tsx
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';
import { AppLayout } from '../components/AppLayout';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({ component: AppLayout });
```

`apps/web/src/routes/index.tsx`:

```tsx
import { Stack, Text, Title } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { Panel } from '../components/Panel';

export const Route = createFileRoute('/')({ component: TournamentsPage });

function TournamentsPage() {
  return (
    <Stack gap="lg">
      <Title order={1}>Tournaments</Title>
      <Panel title="Systems online">
        <Text>
          The data layer is operational. The tournament finder is the next build phase; until then,
          check the BCP uplink under Settings.
        </Text>
      </Panel>
    </Stack>
  );
}
```

`apps/web/src/routes/settings.tsx`:

```tsx
import { Stack, Title } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { BcpStatusCard } from '../features/settings/BcpStatusCard';

export const Route = createFileRoute('/settings')({ component: SettingsPage });

function SettingsPage() {
  return (
    <Stack gap="lg" maw={720}>
      <Title order={1}>Settings</Title>
      <BcpStatusCard />
    </Stack>
  );
}
```

`apps/web/src/router.ts`:

```ts
import { createRouter } from '@tanstack/react-router';
import { queryClient } from './api/query-client';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

`apps/web/src/main.tsx`:

```tsx
import '@fontsource-variable/exo-2';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/orbitron';
import '@mantine/core/styles.css';
import './styles/global.css';

import { MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { queryClient } from './api/query-client';
import { router } from './router';
import { theme } from './theme';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element in index.html');

createRoot(rootElement).render(
  <StrictMode>
    <MantineProvider theme={theme} forceColorScheme="dark">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
```

```bash
pnpm --filter @bcp/web exec tsr generate
```

Expected: `apps/web/src/routeTree.gen.ts` is created. Commit it; it's regenerated on every `dev`, `build` and `typecheck`.

- [ ] **Step 8: Run the tests and watch them pass**

Run: `pnpm vitest run --project web`
Expected: PASS, 7 tests.

- [ ] **Step 9: Verify the React Compiler is active and the app renders**

```bash
pnpm --filter @bcp/web build
grep -l "react.memo_cache_sentinel" apps/web/dist/assets/*.js
```

Expected: at least one file is listed. The compiler's runtime marker is only present when the compiler transformed our components.

```bash
pnpm db:up
pnpm dev
```

Open http://localhost:5173/settings. Expected:

- A dark navy page with a faint grid.
- The header reads "BCP//ANALYZER", with the `//` in magenta.
- A "BCP uplink" panel with a cut corner and a cyan accent bar, showing the badge **Offline · fixtures**.
- The headings use Orbitron.
- Clicking "Tournaments" navigates and underlines the active link.

Stop the dev servers.

- [ ] **Step 10: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(web): add sci-fi dark shell with React Compiler, Mantine, router and BCP status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Record real BCP data, verify the live login, write the README

**Files:**

- Create: `apps/api/src/bcp/anonymise.ts`, `apps/api/scripts/record-fixtures.ts`, `README.md`
- Test: `apps/api/src/bcp/anonymise.test.ts`

**Interfaces:**

- Consumes: `BcpAuth`, `createMemorySessionStore`, `HttpTransport`, `RateLimiter`, `BcpSource`, `fixtureFileFor`, `BcpTransport`, `loadConfig`, `createLogger`.
- Produces: `new Anonymiser()` with `.anonymise(value: unknown): unknown`; the script `pnpm --filter @bcp/api record-fixtures <eventId> [--lists N] [--out DIR]`.

- [ ] **Step 1: Write the failing anonymiser tests**

`apps/api/src/bcp/anonymise.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Anonymiser } from './anonymise';

describe('Anonymiser', () => {
  it('replaces player names consistently across objects and metaData', () => {
    const anonymiser = new Anonymiser();
    const result = anonymiser.anonymise({
      user: { id: 'U1', firstName: 'Ada', lastName: 'Archer', email: 'ada@example.com' },
      metaData: {
        'p1-firstName': 'Ada',
        'p1-lastName': 'Archer',
        'lbl-player1': 'Ada Archer',
        'p2-firstName': 'Ben',
        'p2-lastName': 'Baker',
        'p1-victoryPoints': 80,
      },
    });

    expect(result).toEqual({
      user: { id: 'U1', firstName: 'Player', lastName: '001' },
      metaData: {
        'p1-firstName': 'Player',
        'p1-lastName': '001',
        'lbl-player1': 'Player 001',
        'p2-firstName': 'Player',
        'p2-lastName': '002',
        'p1-victoryPoints': 80,
      },
    });
  });

  it('renames teams but keeps factions, armies and event names', () => {
    const anonymiser = new Anonymiser();
    const result = anonymiser.anonymise({
      name: 'AdeptiCon Teams',
      teams: [
        { id: 'T1', name: 'Salt Miners', captainId: 'C1', captain: { firstName: 'X' } },
        { id: 'T2', name: 'Tiki Gods', captainId: 'C2' },
      ],
      player: {
        team: { id: 'T1', name: 'Salt Miners' },
        faction: { name: 'Orks' },
        army: { name: 'Orks' },
      },
      pairingPlayer: { team: 'Tiki Gods' },
    });

    expect(result).toEqual({
      name: 'AdeptiCon Teams',
      teams: [
        { id: 'T1', name: 'Team 001', captainId: 'C1' },
        { id: 'T2', name: 'Team 002', captainId: 'C2' },
      ],
      player: {
        team: { id: 'T1', name: 'Team 001' },
        faction: { name: 'Orks' },
        army: { name: 'Orks' },
      },
      pairingPlayer: { team: 'Team 002' },
    });
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm vitest run --project api src/bcp/anonymise`
Expected: FAIL, because the module `./anonymise` does not exist.

- [ ] **Step 3: Implement the anonymiser**

`apps/api/src/bcp/anonymise.ts`:

```ts
/** Keys that identify or describe people; dropped entirely from recordings. */
const DROPPED_KEYS = new Set([
  'email',
  'username',
  'phone',
  'owner',
  'eventUsers',
  'captain',
  'description',
]);

/** Objects under these keys are teams, so their `name` is a team name. */
const TEAM_OBJECT_KEYS = new Set(['team', 'teamPlayer1', 'teamPlayer2']);

/** `firstName`, `lastName`, and metaData's `p1-firstName` / `p2-lastName` variants. */
const NAME_KEY = /^(p[12]-)?(firstName|lastName)$/;
const LABEL_KEY = /^lbl-player[12]$/;

type AliasKind = 'person' | 'team';

/**
 * Replaces player and team names in BCP JSON with stable pseudonyms ("Player 007",
 * "Team 012"), so recorded fixtures keep their structure but identify nobody.
 */
export class Anonymiser {
  readonly #aliases = new Map<string, string>();
  readonly #counters: Record<AliasKind, number> = { person: 0, team: 0 };

  anonymise(value: unknown, parentKey = ''): unknown {
    if (Array.isArray(value)) return value.map((item) => this.anonymise(item, parentKey));
    if (value === null || typeof value !== 'object') return value;

    const owner = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(owner)) {
      if (DROPPED_KEYS.has(key)) continue;
      result[key] =
        typeof child === 'string'
          ? this.#anonymiseString(owner, key, child, parentKey)
          : this.anonymise(child, key);
    }
    return result;
  }

  #anonymiseString(owner: Record<string, unknown>, key: string, value: string, parentKey: string) {
    const nameMatch = NAME_KEY.exec(key);
    if (nameMatch) {
      const prefix = nameMatch[1] ?? '';
      const fullName = [owner[`${prefix}firstName`], owner[`${prefix}lastName`]]
        .filter((part): part is string => typeof part === 'string')
        .join(' ');
      return nameMatch[2] === 'firstName' ? 'Player' : this.#alias('person', fullName);
    }
    if (LABEL_KEY.test(key)) return `Player ${this.#alias('person', value)}`;
    if (key === 'name' && (TEAM_OBJECT_KEYS.has(parentKey) || 'captainId' in owner)) {
      return `Team ${this.#alias('team', value)}`;
    }
    // Some endpoints give a player's team as a plain string.
    if (key === 'team') return `Team ${this.#alias('team', value)}`;
    return value;
  }

  #alias(kind: AliasKind, realName: string): string {
    const key = `${kind}:${realName.trim().toLowerCase()}`;
    let alias = this.#aliases.get(key);
    if (alias === undefined) {
      this.#counters[kind] += 1;
      alias = String(this.#counters[kind]).padStart(3, '0');
      this.#aliases.set(key, alias);
    }
    return alias;
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run --project api src/bcp/anonymise`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the recording script**

`apps/api/scripts/record-fixtures.ts`:

```ts
/**
 * Records one real BCP event as anonymised fixtures, going through the real BcpSource,
 * so a successful run also proves our schemas match live BCP data.
 *
 *   pnpm --filter @bcp/api record-fixtures <eventId> [--lists 10] [--out ../../fixtures/bcp/recorded]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Anonymiser } from '../src/bcp/anonymise';
import { BcpAuth, createMemorySessionStore } from '../src/bcp/auth';
import { fixtureFileFor } from '../src/bcp/fixture-transport';
import { HttpTransport } from '../src/bcp/http-transport';
import { RateLimiter } from '../src/bcp/rate-limiter';
import { BcpSource } from '../src/bcp/source';
import type { BcpRequest, BcpTransport } from '../src/bcp/transport';
import { loadConfig } from '../src/config';
import { createLogger } from '../src/logger';

/** Passes requests through and writes an anonymised copy of each response to disk. */
class RecordingTransport implements BcpTransport {
  readonly #inner: BcpTransport;
  readonly #outDir: string;
  readonly #anonymiser = new Anonymiser();

  constructor(inner: BcpTransport, outDir: string) {
    this.#inner = inner;
    this.#outDir = outDir;
  }

  async get(request: BcpRequest): Promise<unknown> {
    const body = await this.#inner.get(request);
    const file = path.join(this.#outDir, fixtureFileFor(request));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(this.#anonymiser.anonymise(body), null, 2)}\n`);
    return body;
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    lists: { type: 'string', default: '10' },
    out: { type: 'string', default: '../../fixtures/bcp/recorded' },
  },
});
const eventId = positionals[0];
if (!eventId) {
  console.error('Usage: pnpm --filter @bcp/api record-fixtures <eventId> [--lists 10] [--out DIR]');
  process.exit(1);
}

const config = loadConfig();
const logger = createLogger('info', true);
const auth = new BcpAuth({
  apiUrl: config.BCP_API_URL,
  store: createMemorySessionStore(),
  envRefreshToken: config.BCP_REFRESH_TOKEN,
  envAccessToken: config.BCP_ACCESS_TOKEN,
  logger,
});
const http = new HttpTransport({
  baseUrl: config.BCP_API_URL,
  timeoutMs: config.BCP_TIMEOUT_MS,
  maxAttempts: config.BCP_MAX_ATTEMPTS,
  limiter: new RateLimiter({
    requestsPerSecond: config.BCP_REQUESTS_PER_SECOND,
    maxConcurrency: config.BCP_MAX_CONCURRENCY,
  }),
  auth,
  logger,
});
const outDir = path.resolve(values.out);
const source = new BcpSource(new RecordingTransport(http, outDir));

const event = await source.getEvent(eventId);
logger.info({ name: event.name, rounds: event.roundCount, team: event.isTeamEvent }, 'Event');

const day = event.startDate.slice(0, 10);
await source.listEvents({ from: day, to: day }, null);

const players = await source.getPlayers(eventId);
if (event.isTeamEvent) await source.getTeams(eventId);
for (let round = 1; round <= event.roundCount; round += 1) {
  if (event.isTeamEvent) await source.getTeamMatchups(eventId, round);
  const games = await source.getGames(eventId, round);
  logger.info({ round, games: games.length }, 'Round recorded');
}

const listIds = players.flatMap((player) => (player.listBcpId ? [player.listBcpId] : []));
let listsFetched = 0;
for (const listId of listIds.slice(0, Number(values.lists))) {
  if (await source.getList(listId)) listsFetched += 1;
}

logger.info(
  { outDir, players: players.length, listsFetched, auth: await auth.status() },
  'Recording complete',
);
```

- [ ] **Step 6: Write the README**

`README.md`:

````markdown
# BCP Analyzer

Finds big Warhammer 40k tournaments on [Best Coast Pairings](https://www.bestcoastpairings.com),
fetches army lists on demand, and analyses how team events were paired and played.

It reads BCP's web API **as your own logged-in BCP subscriber account**, slowly (2 requests/second
by default) and only when you ask. The data is for private team analysis: please don't republish it.

## Requirements

- Node 24 LTS: `nvm use` (reads `.nvmrc`)
- pnpm via corepack: `corepack enable`
- Docker (for Postgres)

## Setup

```bash
nvm use && corepack enable
pnpm install
cp .env.example .env
pnpm db:up          # Postgres 17 in Docker
pnpm dev            # API on :3001, web on http://localhost:5173
```

Out of the box the API serves the sample data in `fixtures/bcp/sample` (`TOURNAMENT_SOURCE=fixtures`).

## Connecting to BCP

1. Log in at https://www.bestcoastpairings.com.
2. Open DevTools → Application → Local Storage → `https://www.bestcoastpairings.com`.
3. Copy the value of `AuthIdentityServiceProvider.web-app.refreshToken` into `.env` as `BCP_REFRESH_TOKEN`.
4. Set `TOURNAMENT_SOURCE=bcp` and restart `pnpm dev`.
5. The **Settings** page should show **Connected**.

The API refreshes access tokens itself and stores the session in Postgres. If Settings shows
**Not connected** later, repeat steps 1–3 and restart.

## Commands

| Command                                                       | What it does                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                                                    | API and web app with reload                                           |
| `pnpm check`                                                  | Typecheck, lint, format check and all tests (run before pushing)      |
| `pnpm test`                                                   | All tests (no network, no Docker needed)                              |
| `pnpm format`                                                 | Format everything with Prettier                                       |
| `pnpm --filter @bcp/api db:generate --name <change>`          | New migration after editing `apps/api/src/db/schema.ts`               |
| `pnpm --filter @bcp/api record-fixtures <eventId> --lists 10` | Record a real event as anonymised fixtures in `fixtures/bcp/recorded` |

## Layout

```
apps/api        Hono API: BCP scraper (src/bcp), Postgres (src/db), sync jobs (src/sync), routes
apps/web        React 19 + React Compiler, Mantine, TanStack Router/Query
packages/shared Zod schemas and types shared by both apps
fixtures/bcp    BCP-shaped JSON: sample/ (committed), recorded/ (git-ignored)
docs/superpowers Design spec and implementation plans
```
````

- [ ] **Step 7: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): add anonymised fixture recording and README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Live verification with the user's BCP account (needs a human)**

This step needs the user's BCP refresh token. **Ask the user** to do steps 1–3 of "Connecting to BCP" in the README, putting the token only into `.env`. Never paste a token into chat or commit it. Then run:

```bash
pnpm --filter @bcp/api record-fixtures YlZ0Eu7zlVn3 --lists 5
```

(`YlZ0Eu7zlVn3` is AdeptiCon 2026 40K Teams: 432 players, 5 rounds.)

Expected log lines:

- `Refreshed BCP access token` with `rotated: true` or `rotated: false`. **Tell the user which one it was.** It confirms the refresh flow and whether BCP rotates refresh tokens.
- `Round recorded` five times, with `games` around 216 each.
- `Recording complete` with `players: 432`, `listsFetched: 5` and `auth.authenticated: true`.

Then confirm the recorded data parses end to end:

```bash
FIXTURES_DIR=../../fixtures/bcp/recorded pnpm --filter @bcp/api start &
sleep 3
curl -s -X POST localhost:3001/api/sync -H 'content-type: application/json' -d '{"kind":"pairings","eventId":"YlZ0Eu7zlVn3"}'
sleep 3 && curl -s localhost:3001/api/sync-runs/1; kill %1
```

(The run id may not be 1 if earlier runs exist. Use the `id` from the POST response.)

Expected: `"status":"succeeded","total":5,"done":5`.

**If the refresh fails** (a `BcpAuthError` mentioning HTTP 4xx from `/v1/oauth/token`):

1. Copy `AuthIdentityServiceProvider.web-app.accessToken` into `BCP_ACCESS_TOKEN` instead, and re-run.
2. Record the refresh request and response the BCP site itself makes (DevTools → Network → `oauth/token`) in the spec's "Authentication" section.
3. Stop and report to the user before changing `BcpAuth`.

**If a schema error appears** (`BCP_SCHEMA_MISMATCH` with a field path):

1. Look at the recorded JSON at that path.
2. Loosen or fix the schema in `raw.ts`.
3. Add a mapper test using the real shape, and re-run.
