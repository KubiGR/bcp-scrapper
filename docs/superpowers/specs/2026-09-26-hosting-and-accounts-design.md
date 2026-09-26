# Hosting on Portainer, and Accounts: Design Spec

- **Date:** 2026-09-26
- **Status:** Approved design, pending spec review
- **Builds on:** the main spec and plans 1–6. The app so far is local-only (loopback, no login).

## 1. Goals

Run the app on the user's existing Portainer server (x86-64), reachable **over the internet** through a **Cloudflare Tunnel**, for the user **and a few people**, each with their own login. Anyone logged in acts through the owner's BCP account (the refresh token), so the app must be locked down.

### Non-goals

- Public sign-up, OAuth/SSO, email flows.
- Multiple BCP accounts (one owner token for everyone).
- Horizontal scaling (one app container).

## 2. Packaging

- **`Dockerfile`** (repo root, multi-stage):
  - _build:_ Node 24 + pnpm 12 (corepack), `pnpm install --frozen-lockfile`, build `@bcp/shared` if needed and the web app (`pnpm --filter @bcp/web build`).
  - _runtime:_ Node 24 slim, production dependencies, the API sources (run with `tsx` as today, or compiled — whichever keeps the image small and reliable), the web `dist/`. Non-root user. `EXPOSE 3000`. Healthcheck on `/api/health`.
- **The API serves the web app** when `WEB_DIST_DIR` is set: static files from that directory, and `index.html` for any non-`/api` path (SPA routing). Assets get long-lived cache headers (hashed names); `index.html` no-cache.
- Migrations run on start (as today). The image targets `linux/amd64`.
- `.dockerignore` excludes `.env`, `node_modules`, `fixtures/bcp/recorded`, `.superpowers`, `.claude`, test output.

## 3. The Portainer stack

`deploy/portainer-stack.yml` (Compose v3), deployed in Portainer as a stack **from the Git repository** (private GitHub; Portainer builds the image):

- **`db`:** `postgres:17-alpine`, named volume `bcp-pgdata`, no published ports, `POSTGRES_PASSWORD` from the stack env.
- **`app`:** built from the repo's `Dockerfile`; env below; depends on `db` healthy; no published ports (optional `APP_PORT` publish for LAN debugging, off by default).
- **`tunnel`:** `cloudflare/cloudflared:latest` running `tunnel run` with `TUNNEL_TOKEN`; routes `https://<PUBLIC_HOSTNAME>` → `http://app:3000` (configured in the Cloudflare dashboard). Can be removed if the user already runs a tunnel (they add a route to it instead).
- All three on a private network.

**Stack environment (Portainer, never committed):** `BCP_REFRESH_TOKEN`, `TUNNEL_TOKEN`, `POSTGRES_PASSWORD`, `SESSION_SECRET` (≥ 32 random bytes), `PUBLIC_HOSTNAME`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (first start only), plus the app's existing settings (`TOURNAMENT_SOURCE=bcp`, `MIN_EVENT_*`, `FETCH_QUEUE_INTERVAL_MS`). The app gets `HOST=0.0.0.0`, `PORT=3000`, `DATABASE_URL=postgres://bcp:${POSTGRES_PASSWORD}@db:5432/bcp`, `AUTH_REQUIRED=true`, `WEB_DIST_DIR`.

## 4. Host check

The DNS-rebinding guard becomes an allow-list: `ALLOWED_HOSTS` (comma-separated), defaulting to loopback names plus `PUBLIC_HOSTNAME` when set. Listening on `0.0.0.0` no longer turns the guard off. Requests with any other `Host` → 403 as today.

## 5. Accounts

- **Tables:** `users (id, username unique case-insensitive, password_hash, role 'admin'|'member', must_change_password bool, disabled bool, created_at, updated_at)` and `sessions (id_hash primary key, user_id → users cascade, created_at, last_seen_at, expires_at)`.
- **Passwords:** `crypto.scrypt` with a 16-byte random salt and explicit cost parameters, stored as `scrypt$N$r$p$salt$hash` (base64); verified with `timingSafeEqual`. Minimum length 12. Never logged or returned.
- **Bootstrap:** on start, if `users` is empty and `ADMIN_USERNAME` + `ADMIN_PASSWORD` are set, create that admin (`must_change_password = false`) and log "Admin created — remove ADMIN_PASSWORD from the stack". If users exist, the variables are ignored.
- **Sessions:** 32 random bytes, sent as cookie `bcp_session` (`HttpOnly; Secure; SameSite=Lax; Path=/`; `Secure` omitted only when `AUTH_REQUIRED` is off / local); only its SHA-256 is stored. Sliding expiry 14 days from last use, absolute 30 days. Logout deletes the row. Disabling or removing a user deletes their sessions.
- **Routes:**
  - `POST /api/auth/login` `{ username, password }` → sets the cookie, returns `{ user }`; wrong username or password → 401 "Invalid username or password" (same message, same timing path).
  - `POST /api/auth/logout`, `GET /api/auth/me` → `{ user: { id, username, role, mustChangePassword } }` or 401.
  - `POST /api/auth/password` `{ current, next }`.
  - Admin only: `GET /api/users`, `POST /api/users` `{ username, role }` → `{ user, temporaryPassword }` (random, shown once, `must_change_password = true`), `POST /api/users/:id/reset-password` → `{ temporaryPassword }`, `PATCH /api/users/:id` `{ role?, disabled? }`, `DELETE /api/users/:id`. An admin can't disable/delete/demote themselves, and the last admin can't be removed.
- **Enforcement:** when `AUTH_REQUIRED=true`, every `/api/*` route except `/api/auth/login` and `/api/health` requires a valid session (401 otherwise); users with `must_change_password` can only call `/api/auth/*` until they change it. When false (local dev, tests by default), no login is needed and the web app hides account UI.

## 6. Protection

- **Login rate limit:** at most 5 failed attempts per (username, client IP) per 15 minutes, and 50 per IP; then 429 with `Retry-After`. Client IP = `CF-Connecting-IP` when present (behind the tunnel), else the socket address. In-memory (one process).
- **CSRF:** `SameSite=Lax` + the existing `requireJson` on state changes + an **Origin check**: when `AUTH_REQUIRED`, state-changing requests must carry `Origin` matching `https://<PUBLIC_HOSTNAME>` (or an allowed host).
- **Headers** on every response: `Content-Security-Policy` (`default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'`; adjust to what Mantine/Vite output actually needs), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`. HSTS comes from Cloudflare.
- The BCP token stays server-side; logs never contain passwords, tokens or session ids.

## 7. Web

- **`/login`** page (username, password, error text); after login → the page they came from. With `mustChangePassword` → a **Change password** form before anything else.
- The API client, on 401 from any call, sends the user to `/login` (only when auth is on).
- Header: the signed-in username with a menu (Change password, Log out).
- **Settings → Users** (admins): table of users (username, role, status), **Add user** (shows the one-time password once, with a copy button), **Reset password**, **Disable/Enable**, **Remove**, role change.
- `GET /api/auth/me` tells the web app whether auth is on (404/`{ authRequired: false }` locally).

## 8. Docs

`docs/deploy/portainer.md`: step by step — push to a private GitHub repo (checking `.env` and recorded fixtures are ignored), create the Cloudflare Tunnel and public hostname, create a GitHub read-only token, add the stack in Portainer from Git (repo URL, compose path, env vars), deploy, first login and removing `ADMIN_PASSWORD`, updating (push + Redeploy), backups (`pg_dump` from the db container), optional Cloudflare Access in front (email one-time code).

## 9. Testing

- Password hashing/verification; bootstrap; login/logout/me; wrong password vs unknown user both 401 with the same body; must-change-password gating; session expiry (sliding/absolute, fake clock); admin routes and their guards (self, last admin); disabling kills sessions.
- Enforcement on/off; rate limit (5 fails → 429, reset after window); Origin check; allowed hosts; security headers present.
- Static serving: `index.html` for SPA routes, 404 for missing assets, `/api` unaffected.
- Web: login page, redirect on 401, change-password gate, users admin page.
- Docker: `docker build` succeeds in CI-less local run (`docker build --platform linux/amd64 .`) and the container starts against a Postgres (documented manual check).

## 10. Build order

1. Static serving + allowed hosts + Dockerfile + stack file + deploy guide.
2. Accounts backend (tables, hashing, sessions, bootstrap, auth routes, enforcement, rate limit, Origin check, headers).
3. Web: login, change password, header menu, 401 redirect, Settings → Users.
