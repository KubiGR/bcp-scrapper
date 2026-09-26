# Hosting and Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the app on the user's Portainer server behind a Cloudflare Tunnel, with per-user logins, so a few people can use it over the internet safely.

**Architecture:** One Docker image (API + built web) built by Portainer from a private Git repo; a stack of Postgres, the app and `cloudflared`. The API gains an allowed-hosts check, static serving of the web app, and an accounts layer (scrypt passwords, hashed session cookies, admin user management, login rate limiting, Origin check, security headers), enabled by `AUTH_REQUIRED=true`.

**Tech Stack:** as plans 1–6; Node's built-in `crypto` (scrypt, randomBytes, timingSafeEqual, SHA-256); Hono middleware; Docker multi-stage build.

**Spec:** `docs/superpowers/specs/2026-09-26-hosting-and-accounts-design.md`.

**Execution note:** build in a separate git worktree; the user's dev server runs from the main checkout.

## Global Constraints

- Node 24, pnpm 12, TypeScript `~6.0.3`, Zod 4; strict ESLint `--max-warnings=0`, no `any`; Prettier.
- Tests next to the code; no network, PGlite only; never read, print or source `.env`.
- **Never log or return** passwords, password hashes, session ids or the BCP token. Error messages for login never reveal whether a username exists.
- With `AUTH_REQUIRED` unset/false everything behaves exactly as today (local dev, existing tests, e2e).
- Mantine 9.6.2; minimal dark theme; keyboard reachable; no manual memoisation; every view has loading/empty/error states.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Foreground commands only; `pnpm vitest run --project api|web|shared <path>`, never bare `vitest`.

## Review Focus

1. **Session theft/fixation.** A new session id on every login; only its SHA-256 stored; logout, disable and remove delete sessions; expired (sliding 14 d / absolute 30 d) sessions are rejected. _Task 2._
2. **Username enumeration and timing.** Unknown user and wrong password give the same 401 body and both run a scrypt verification. _Task 2._
3. **Everything else locked.** With auth on, every `/api/*` except login and health returns 401 without a session, including SSE-less long routes like exports; a must-change-password user can only reach `/api/auth/*`. _Task 2._
4. **Cross-site writes.** A state-changing request with a foreign `Origin` is refused even with a valid cookie. _Task 2._
5. **Local dev unchanged.** Without `AUTH_REQUIRED`, no login, no Origin check change, existing tests and e2e pass untouched; the host allow-list still admits localhost. _Tasks 1–3._

---

### Task 1: Allowed hosts, static web serving, Docker image, stack and guide

**Files:** `apps/api/src/config.ts` (+ test), `apps/api/src/app.ts` (+ `app.test.ts`), `apps/api/src/static.ts` (new, + test), `apps/api/src/main.ts`, `Dockerfile`, `.dockerignore`, `deploy/portainer-stack.yml`, `docs/deploy/portainer.md`, `README.md`.

**Interfaces:**

- Config: `PUBLIC_HOSTNAME?: string`, `ALLOWED_HOSTS?: string` (comma-separated), `WEB_DIST_DIR?: string`, `AUTH_REQUIRED: boolean` (default false; `'true'|'1'` → true), `SESSION_SECRET?: string` (required when `AUTH_REQUIRED`), `ADMIN_USERNAME?`, `ADMIN_PASSWORD?`.
- `allowedHostsOf(config): Set<string>` — loopback names (`localhost`, `127.0.0.1`, `[::1]`/`::1`) ∪ `PUBLIC_HOSTNAME` ∪ `ALLOWED_HOSTS` entries (lower-cased, ports stripped).
- `AppDeps.allowedHosts: Set<string>` replaces `listenHost`; the guard always runs and admits exactly those hostnames.
- `serveWebApp(app, distDir)` in `static.ts`: serves files under `distDir` for non-`/api` GETs (correct content types; `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`, `no-cache` for `index.html`), falls back to `index.html` for paths without a file extension, 404 for missing files with an extension; never serves outside `distDir` (reject `..`).

- [ ] **Step 1: Tests first.** Config: allowed hosts combine loopback + public hostname + list; `AUTH_REQUIRED` without `SESSION_SECRET` throws "SESSION_SECRET is required when AUTH_REQUIRED is true". App: `Host: bcp.example.com` → 403 by default, 200 with `allowedHosts` containing it; `Host: localhost:3001` → 200 (update the existing loopback tests and `makeApp` to pass `allowedHosts`). Static (use a temp dir with `index.html` and `assets/app-abc.js`): `/` and `/events/X` → index.html (`no-cache`), `/assets/app-abc.js` → JS with immutable caching, `/missing.png` → 404, `/../package.json` → 404, `/api/health` still JSON.
      Run — expect FAIL.
- [ ] **Step 2: Implement.** Config fields + refine; `allowedHostsOf`; guard rewritten to use `deps.allowedHosts` (keep the 403 body); `serveWebApp` using `node:fs/promises` + `node:path` (resolve and check the prefix) and a small extension→type map (`.html .js .css .svg .png .ico .woff2 .json .txt`); `main.ts` calls it after the API routes when `WEB_DIST_DIR` is set and passes `allowedHosts`. Update every `createApp` call in tests (grep).
- [ ] **Step 3: Docker and stack.**
  - `Dockerfile` (two stages on `node:24-slim`; `corepack enable`; build stage copies the workspace manifests first for layer caching, `pnpm install --frozen-lockfile`, copies sources, `pnpm --filter @bcp/web build`; runtime stage copies `node_modules` needed by `apps/api` + `packages/shared` + `apps/api` sources + `apps/web/dist` to `/app/web`, sets `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3000`, `WEB_DIST_DIR=/app/web`, `USER node`, `EXPOSE 3000`, `HEALTHCHECK` with `node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`, `CMD` running the API's start command without `--env-file`). Verify with `docker build --platform linux/amd64 -t bcp-analyzer:local .` (if Docker is available; report if not).
  - `.dockerignore`: `.env*` (keep `.env.example`), `node_modules`, `**/node_modules`, `fixtures/bcp/recorded`, `.superpowers`, `.claude`, `test-results`, `playwright-report`, `**/dist`, `.git`.
  - `deploy/portainer-stack.yml` per spec §3 (services `db`, `app` with `build: { context: ., dockerfile: Dockerfile }`, `tunnel`; env via `${VAR}`; `depends_on: db: condition: service_healthy`; db healthcheck `pg_isready`; volume `bcp-pgdata`; network `bcp`).
  - `docs/deploy/portainer.md` per spec §8; README "Hosting" section linking to it.
- [ ] **Step 4: Run, check, commit.** `pnpm check`, `pnpm e2e` (expect 2 passed — the e2e webServer config must pass nothing new; localhost stays allowed), commit `feat: allowed hosts, web serving from the API, Docker image and Portainer stack`.

---

### Task 2: Accounts backend

**Files:** `apps/api/src/db/schema.ts` (+ generated migration), `apps/api/src/auth/passwords.ts`, `auth/sessions.ts`, `auth/rate-limit.ts`, `auth/middleware.ts`, `auth/bootstrap.ts` (+ tests), `apps/api/src/routes/auth.ts`, `routes/users.ts` (+ tests), `packages/shared/src/auth.ts` (schemas), `packages/shared/src/error-code.ts` (+ `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`), `apps/api/src/errors.ts`, `apps/api/src/app.ts`, `main.ts`.

**Interfaces:**

- Shared: `UserSchema = { id: number; username: string; role: 'admin'|'member'; mustChangePassword: boolean; disabled: boolean }`, `MeResponseSchema = { authRequired: boolean; user: User | null }`, `LoginRequestSchema`, `ChangePasswordRequestSchema` (`next` min 12), `CreateUserRequestSchema`, `CreateUserResponseSchema = { user; temporaryPassword }`, `UpdateUserRequestSchema`.
- `hashPassword(plain): Promise<string>` → `scrypt$16384$8$1$<salt b64>$<hash b64>` (64-byte key); `verifyPassword(plain, stored): Promise<boolean>` (timingSafeEqual; malformed → false); `DUMMY_HASH` (a fixed valid hash for unknown users so both paths cost one scrypt).
- `createSession(db, userId, now) → { token, expiresAt }` (token = 32 random bytes base64url; row stores `sha256(token)`, `expires_at = min(now+14d, created+30d)`); `resolveSession(db, token, now) → { user } | null` (rejects expired/disabled; slides `last_seen_at` and `expires_at` at most once per hour); `deleteSession`, `deleteUserSessions`.
- `LoginLimiter` (in-memory): `check(key) → { allowed, retryAfterSeconds }`, `fail(key)`, `succeed(key)`; keys `user:ip` (5 / 15 min) and `ip` (50 / 15 min); injectable clock.
- `authMiddleware({ db, required, allowedOrigins, now })`: when `required`, for `/api/*` except `POST /api/auth/login`, `GET /api/auth/me` (answers `{authRequired:true,user:null}` itself when logged out) and `GET /api/health`: read cookie `bcp_session`, `resolveSession` → 401 `UNAUTHORIZED` if none; users with `mustChangePassword` → 403 `FORBIDDEN` except `/api/auth/*`; state-changing methods require `Origin` whose host is allowed (→ 403). Puts `user` in the Hono context.
- `securityHeaders` middleware (all responses): the CSP and headers of spec §6.
- Bootstrap `ensureAdmin(db, config, logger)`.
- Routes per spec §5 (`/api/auth/login|logout|me|password`, `/api/users…`); cookie `bcp_session`, `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`, plus `Secure` when auth is required.

- [ ] **Step 1: Schema + migration** (`users`, `sessions` per spec; `db:generate --name accounts`; `resetDb` truncates them).
- [ ] **Step 2: Tests first** (one file per module): hashing round trip, wrong password false, malformed stored hash false, two hashes of the same password differ; sessions: create→resolve, expired sliding and absolute (fake clock), disabled user rejected, logout deletes; limiter: 5 fails → blocked with retryAfter, success resets, window passes; routes (app with `AUTH_REQUIRED` on): login sets a `Secure; HttpOnly` cookie, unknown user and wrong password → identical 401 bodies, `/api/events` without cookie → 401, with cookie → 200, must-change user → 403 on `/api/events` but can `POST /api/auth/password`, foreign `Origin` on a POST → 403, admin creates user → temporary password works once then forces change, member → 403 on `/api/users`, can't remove the last admin or yourself, disabling kills that user's sessions, 6th failed login → 429 with `Retry-After`; security headers present on `/api/health` and static; with auth off: `/api/events` works without cookie and `/api/auth/me` → `{ authRequired: false, user: null }`.
      Run — expect FAIL.
- [ ] **Step 3: Implement** per Interfaces; wire in `app.ts` (headers first, then host guard, then auth middleware, then routes); `main.ts` runs `ensureAdmin` after migrations and passes config. Keep all existing tests green with auth off by default.
- [ ] **Step 4: Run, check, commit.** `pnpm check`, `pnpm e2e`, commit `feat(api): user accounts, sessions and request protection`.

---

### Task 3: Web: login, password change, account menu, user admin

**Files:** `apps/web/src/features/auth/` (new: `auth-queries.ts`, `LoginPage.tsx`, `ChangePasswordForm.tsx`, `AccountMenu.tsx`, `AuthGate.tsx`, tests), `apps/web/src/routes/login.tsx` (new), `apps/web/src/api/client.ts` (401 handling), `apps/web/src/components/AppLayout.tsx`, `apps/web/src/features/settings/UsersCard.tsx` (new, + test), `apps/web/src/routes/settings.tsx`, `e2e` unchanged (auth off).

**Interfaces:**

- `meQuery` (`GET /api/auth/me`); `login`, `logout`, `changePassword`, users admin calls.
- `AuthGate` wraps the app layout: while `me` loads → skeleton; `authRequired && !user` → navigate to `/login?next=<path>`; `user.mustChangePassword` → render `ChangePasswordForm` only; otherwise children. With `authRequired: false` → children, no account UI.
- `client.ts`: on a 401 from any API call (other than `/api/auth/*`), invalidate `meQuery` so the gate redirects (no hard reload).

- [ ] **Step 1: Tests first.** Login page: submits username/password, shows "Invalid username or password" on 401, goes to `next` on success; gate: redirects when logged out (auth on), shows the change-password form when required, renders children with auth off; account menu: shows the username, Log out calls the API and returns to `/login`; users card (admin): lists users, Add user shows the one-time password once with a Copy button, Reset password, Disable/Enable, Remove (confirm), hidden for members. Run — expect FAIL.
- [ ] **Step 2: Implement** in the minimal dark theme (Panel, cyan accent), keyboard accessible, with loading/empty/error states; `/login` route outside the gated layout; register routes (`tsr generate`).
- [ ] **Step 3: Manual check** with auth on: run the API with `AUTH_REQUIRED=true SESSION_SECRET=… ADMIN_USERNAME=admin ADMIN_PASSWORD=…` against PGlite on free ports and the web dev server proxying to it (don't disturb the user's servers on 3001/5173), log in, change password, add a user; record the result in the report.
- [ ] **Step 4: Run, check, commit.** `pnpm check`, `pnpm e2e` (auth off → 2 passed), commit `feat(web): login, password change, account menu and user admin`.
