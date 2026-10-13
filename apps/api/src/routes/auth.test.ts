import type { ApiErrorBody, CreateUserResponse, MeResponse, UsersResponse } from '@bcp/shared';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { hashPassword } from '../auth/passwords';
import type { Db } from '../db/client';
import { sessions, users } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { serveWebApp } from '../static';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';

const HOST = 'bcp.example.com';
const ORIGIN = `https://${HOST}`;
const SECRET = 'k'.repeat(40);
const ADMIN_PASSWORD = 'admin password 1';
const MEMBER_PASSWORD = 'member password 1';

let db: Db;
let close: () => Promise<void>;
let now: Date;
let adminId: number;
let memberId: number;

function makeApp(required = true) {
  return createApp({
    db,
    runner: new SyncRunner({
      db,
      source: sampleSource(),
      logger: silentLogger,
      eventRule: ALL_EVENTS,
    }),
    fetchQueue: testFetchQueue(db),
    bcpStatus: () =>
      Promise.resolve({
        source: 'fixtures',
        state: 'fixtures',
        accessTokenExpiresAt: null,
        lastRefreshAt: null,
      }),
    logger: silentLogger,
    eventRule: ALL_EVENTS,
    now: () => now,
    allowedHosts: new Set(['localhost', HOST]),
    auth: { required, secret: SECRET },
  });
}
type App = ReturnType<typeof makeApp>;

/** A request as the browser sends it through the tunnel. */
function send(
  app: App,
  method: string,
  path: string,
  options: { cookie?: string; body?: unknown; ip?: string; origin?: string | null } = {},
) {
  const headers: Record<string, string> = {
    host: HOST,
    'cf-connecting-ip': options.ip ?? '203.0.113.7',
  };
  if (options.origin !== null && method !== 'GET') headers.origin = options.origin ?? ORIGIN;
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return app.request(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function cookieOf(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  return header.split(';')[0] ?? '';
}

async function login(app: App, username: string, password: string): Promise<string> {
  const response = await send(app, 'POST', '/api/auth/login', { body: { username, password } });
  expect(response.status, `login ${username}`).toBe(200);
  return cookieOf(response);
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  now = new Date('2026-09-01T10:00:00Z');
  const rows = await db
    .insert(users)
    .values([
      { username: 'Admin', passwordHash: await hashPassword(ADMIN_PASSWORD), role: 'admin' },
      { username: 'ana', passwordHash: await hashPassword(MEMBER_PASSWORD), role: 'member' },
    ])
    .returning();
  const [admin, member] = rows;
  if (admin === undefined || member === undefined) throw new Error('seed failed');
  adminId = admin.id;
  memberId = member.id;
});

describe('login', () => {
  it('sets a Secure, HttpOnly, SameSite=Lax session cookie and returns the user', async () => {
    const response = await send(makeApp(), 'POST', '/api/auth/login', {
      body: { username: 'admin', password: ADMIN_PASSWORD },
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^bcp_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(await response.json()).toEqual({
      user: {
        id: adminId,
        username: 'Admin',
        role: 'admin',
        mustChangePassword: false,
        disabled: false,
        canPair: false,
        ignored: false,
      },
    });
  });

  it('answers an unknown user and a wrong password identically', async () => {
    const app = makeApp();
    const unknown = await send(app, 'POST', '/api/auth/login', {
      body: { username: 'nobody', password: 'whatever pass' },
    });
    const wrong = await send(app, 'POST', '/api/auth/login', {
      body: { username: 'ana', password: 'whatever pass' },
    });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    const body: ApiErrorBody = {
      error: { code: 'UNAUTHORIZED', message: 'Invalid username or password' },
    };
    expect(await unknown.json()).toEqual(body);
    expect(await wrong.json()).toEqual(body);
    expect(unknown.headers.get('set-cookie')).toBeNull();
  });

  it('refuses a disabled user with the same answer', async () => {
    await db.update(users).set({ disabled: true }).where(eq(users.id, memberId));
    const response = await send(makeApp(), 'POST', '/api/auth/login', {
      body: { username: 'ana', password: MEMBER_PASSWORD },
    });
    expect(response.status).toBe(401);
  });

  it('blocks the 6th failed attempt for a user from one address, even with the right password', async () => {
    const app = makeApp();
    for (let i = 0; i < 5; i += 1) {
      const response = await send(app, 'POST', '/api/auth/login', {
        body: { username: 'ana', password: 'wrong password' },
      });
      expect(response.status).toBe(401);
    }
    const blocked = await send(app, 'POST', '/api/auth/login', {
      body: { username: 'ana', password: MEMBER_PASSWORD },
    });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(((await blocked.json()) as ApiErrorBody).error.code).toBe('RATE_LIMITED');
    // Another address is not blocked.
    const elsewhere = await send(app, 'POST', '/api/auth/login', {
      body: { username: 'ana', password: MEMBER_PASSWORD },
      ip: '198.51.100.1',
    });
    expect(elsewhere.status).toBe(200);
  });

  it('counts attempts before checking the password, so a burst of parallel guesses is still capped', async () => {
    const app = makeApp();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        Promise.resolve(
          send(app, 'POST', '/api/auth/login', {
            body: { username: 'ana', password: 'wrong password' },
          }),
        ),
      ),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((status) => status === 401)).toHaveLength(5);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
  });

  it('ends the session the browser already had when someone else logs in', async () => {
    const app = makeApp();
    const first = await login(app, 'ana', MEMBER_PASSWORD);
    const response = await send(app, 'POST', '/api/auth/login', {
      cookie: first,
      body: { username: 'Admin', password: ADMIN_PASSWORD },
    });
    expect(response.status).toBe(200);
    expect((await send(app, 'GET', '/api/events', { cookie: first })).status).toBe(401);
  });

  it('clears out expired sessions when someone logs in', async () => {
    const app = makeApp();
    await login(app, 'ana', MEMBER_PASSWORD);
    now = new Date(now.getTime() + 31 * 86_400_000);
    await login(app, 'Admin', ADMIN_PASSWORD);
    const left = await db.select().from(sessions);
    expect(left.map((row) => row.userId)).toEqual([adminId]);
  });

  it('a successful login does not use up the address’s allowance', async () => {
    const app = makeApp();
    for (let i = 0; i < 60; i += 1) await login(app, 'ana', MEMBER_PASSWORD);
  });

  it('blocks an address after 50 failures across usernames', async () => {
    const app = makeApp();
    for (let i = 0; i < 50; i += 1) {
      await send(app, 'POST', '/api/auth/login', {
        body: { username: `u${i}`, password: 'wrong password' },
      });
    }
    const blocked = await send(app, 'POST', '/api/auth/login', {
      body: { username: 'admin', password: ADMIN_PASSWORD },
    });
    expect(blocked.status).toBe(429);
  });
});

describe('the lock on the API', () => {
  it('refuses API routes without a session and lets health and me through', async () => {
    const app = makeApp();
    for (const path of ['/api/events', '/api/bcp/status', '/api/fetch-queue', '/api/users']) {
      const response = await send(app, 'GET', path);
      expect(response.status, path).toBe(401);
      expect(((await response.json()) as ApiErrorBody).error.code, path).toBe('UNAUTHORIZED');
    }
    expect((await send(app, 'POST', '/api/sync/catalog', { body: {} })).status).toBe(401);
    expect((await send(app, 'GET', '/api/health')).status).toBe(200);
    const me = await send(app, 'GET', '/api/auth/me');
    expect(await me.json()).toEqual({ authRequired: true, user: null } satisfies MeResponse);
  });

  it('opens the API with a session cookie', async () => {
    const app = makeApp();
    const cookie = await login(app, 'ana', MEMBER_PASSWORD);
    expect((await send(app, 'GET', '/api/events', { cookie })).status).toBe(200);
    const me = (await (await send(app, 'GET', '/api/auth/me', { cookie })).json()) as MeResponse;
    expect(me.user?.username).toBe('ana');
  });

  it('refuses a forged or stale cookie', async () => {
    const app = makeApp();
    expect((await send(app, 'GET', '/api/events', { cookie: 'bcp_session=forged' })).status).toBe(
      401,
    );
    const cookie = await login(app, 'ana', MEMBER_PASSWORD);
    now = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
    expect((await send(app, 'GET', '/api/events', { cookie })).status).toBe(401);
  });

  it('refuses a state change from a foreign Origin, or with none, even with a valid cookie', async () => {
    const app = makeApp();
    const cookie = await login(app, 'Admin', ADMIN_PASSWORD);
    const foreign = await send(app, 'POST', '/api/users', {
      cookie,
      body: { username: 'eve' },
      origin: 'https://evil.example',
    });
    expect(foreign.status).toBe(403);
    expect(((await foreign.json()) as ApiErrorBody).error.code).toBe('FORBIDDEN');
    const none = await send(app, 'POST', '/api/users', {
      cookie,
      body: { username: 'eve' },
      origin: null,
    });
    expect(none.status).toBe(403);
    const loginFromElsewhere = await send(app, 'POST', '/api/auth/login', {
      body: { username: 'ana', password: MEMBER_PASSWORD },
      origin: 'https://evil.example',
    });
    expect(loginFromElsewhere.status).toBe(403);
    expect(await db.select().from(users)).toHaveLength(2);
  });

  it('logout ends the session', async () => {
    const app = makeApp();
    const cookie = await login(app, 'ana', MEMBER_PASSWORD);
    const response = await send(app, 'POST', '/api/auth/logout', { cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/bcp_session=;/);
    expect((await send(app, 'GET', '/api/events', { cookie })).status).toBe(401);
  });
});

describe('passwords', () => {
  it('a new user’s temporary password works once, then only the password change is open', async () => {
    const app = makeApp();
    const adminCookie = await login(app, 'Admin', ADMIN_PASSWORD);
    const created = await send(app, 'POST', '/api/users', {
      cookie: adminCookie,
      body: { username: 'bo' },
    });
    expect(created.status).toBe(200);
    const { user, temporaryPassword } = (await created.json()) as CreateUserResponse;
    expect(user).toMatchObject({ username: 'bo', role: 'member', mustChangePassword: true });

    const cookie = await login(app, 'bo', temporaryPassword);
    expect((await send(app, 'GET', '/api/events', { cookie })).status).toBe(403);
    const me = (await (await send(app, 'GET', '/api/auth/me', { cookie })).json()) as MeResponse;
    expect(me.user?.mustChangePassword).toBe(true);

    const short = await send(app, 'POST', '/api/auth/password', {
      cookie,
      body: { current: temporaryPassword, next: 'short' },
    });
    expect(short.status).toBe(400);
    const changed = await send(app, 'POST', '/api/auth/password', {
      cookie,
      body: { current: temporaryPassword, next: 'my own password 1' },
    });
    expect(changed.status).toBe(200);
    expect((await send(app, 'GET', '/api/events', { cookie })).status).toBe(200);

    const reuse = await send(app, 'POST', '/api/auth/login', {
      body: { username: 'bo', password: temporaryPassword },
    });
    expect(reuse.status).toBe(401);
    await login(app, 'bo', 'my own password 1');
  });

  it('refuses a password change with the wrong current password', async () => {
    const app = makeApp();
    const cookie = await login(app, 'ana', MEMBER_PASSWORD);
    const response = await send(app, 'POST', '/api/auth/password', {
      cookie,
      body: { current: 'not my password', next: 'a brand new password' },
    });
    expect(response.status).toBe(400);
    await login(app, 'ana', MEMBER_PASSWORD);
  });

  it('blocks the 6th wrong current password, even a right one after', async () => {
    const app = makeApp();
    const cookie = await login(app, 'ana', MEMBER_PASSWORD);
    const change = (current: string) =>
      send(app, 'POST', '/api/auth/password', {
        cookie,
        body: { current, next: 'a brand new password' },
      });
    for (let i = 0; i < 5; i += 1) expect((await change('not my password')).status).toBe(400);
    expect((await change(MEMBER_PASSWORD)).status).toBe(429);
  });

  it('changing the password ends the user’s other sessions but keeps this one', async () => {
    const app = makeApp();
    const other = await login(app, 'ana', MEMBER_PASSWORD);
    const cookie = await login(app, 'ana', MEMBER_PASSWORD);
    await send(app, 'POST', '/api/auth/password', {
      cookie,
      body: { current: MEMBER_PASSWORD, next: 'a brand new password' },
    });
    expect((await send(app, 'GET', '/api/events', { cookie })).status).toBe(200);
    expect((await send(app, 'GET', '/api/events', { cookie: other })).status).toBe(401);
  });
});

describe('user admin', () => {
  it('is for admins only', async () => {
    const app = makeApp();
    const cookie = await login(app, 'ana', MEMBER_PASSWORD);
    expect((await send(app, 'GET', '/api/users', { cookie })).status).toBe(403);
    expect(
      (await send(app, 'POST', '/api/users', { cookie, body: { username: 'x1' } })).status,
    ).toBe(403);
  });

  it('lists users without their password hashes', async () => {
    const app = makeApp();
    const cookie = await login(app, 'Admin', ADMIN_PASSWORD);
    const response = await send(app, 'GET', '/api/users', { cookie });
    const text = await response.text();
    expect(text).not.toContain('scrypt');
    expect((JSON.parse(text) as UsersResponse).users.map((u) => u.username)).toEqual([
      'Admin',
      'ana',
    ]);
  });

  it('tells when each user was last seen: never, for one who hasn’t logged in', async () => {
    const app = makeApp();
    const cookie = await login(app, 'Admin', ADMIN_PASSWORD);
    const response = await send(app, 'GET', '/api/users', { cookie });
    const seen = (await response.json()) as UsersResponse;
    expect(seen.users.map((u) => [u.username, u.lastSeenAt])).toEqual([
      ['Admin', '2026-09-01T10:00:00.000Z'],
      ['ana', null],
    ]);
  });

  it('refuses a username that differs only in case', async () => {
    const app = makeApp();
    const cookie = await login(app, 'Admin', ADMIN_PASSWORD);
    expect(
      (await send(app, 'POST', '/api/users', { cookie, body: { username: 'ANA' } })).status,
    ).toBe(400);
  });

  it('disabling a user ends their sessions; enabling lets them log in again', async () => {
    const app = makeApp();
    const adminCookie = await login(app, 'Admin', ADMIN_PASSWORD);
    const anaCookie = await login(app, 'ana', MEMBER_PASSWORD);
    const disabled = await send(app, 'PATCH', `/api/users/${memberId}`, {
      cookie: adminCookie,
      body: { disabled: true },
    });
    expect(disabled.status).toBe(200);
    expect(await db.select().from(sessions).where(eq(sessions.userId, memberId))).toHaveLength(0);
    expect((await send(app, 'GET', '/api/events', { cookie: anaCookie })).status).toBe(401);
    await send(app, 'PATCH', `/api/users/${memberId}`, {
      cookie: adminCookie,
      body: { disabled: false },
    });
    await login(app, 'ana', MEMBER_PASSWORD);
  });

  it('reset password hands out a new temporary password and ends the user’s sessions', async () => {
    const app = makeApp();
    const adminCookie = await login(app, 'Admin', ADMIN_PASSWORD);
    const anaCookie = await login(app, 'ana', MEMBER_PASSWORD);
    const response = await send(app, 'POST', `/api/users/${memberId}/reset-password`, {
      cookie: adminCookie,
    });
    const { temporaryPassword } = (await response.json()) as { temporaryPassword: string };
    expect((await send(app, 'GET', '/api/events', { cookie: anaCookie })).status).toBe(401);
    const cookie = await login(app, 'ana', temporaryPassword);
    expect((await send(app, 'GET', '/api/events', { cookie })).status).toBe(403);
  });

  it('an admin can’t disable, demote or remove themselves', async () => {
    const app = makeApp();
    const cookie = await login(app, 'Admin', ADMIN_PASSWORD);
    for (const body of [{ disabled: true }, { role: 'member' }]) {
      const response = await send(app, 'PATCH', `/api/users/${adminId}`, { cookie, body });
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect((await send(app, 'DELETE', `/api/users/${adminId}`, { cookie })).status).toBe(400);
    expect(await db.select().from(users).where(eq(users.id, adminId))).toHaveLength(1);
  });

  it('keeps at least one active admin', async () => {
    const app = makeApp();
    const cookie = await login(app, 'Admin', ADMIN_PASSWORD);
    await send(app, 'PATCH', `/api/users/${memberId}`, { cookie, body: { role: 'admin' } });
    const anaCookie = await login(app, 'ana', MEMBER_PASSWORD);
    // ana (admin now) removes Admin: fine, ana is still an admin.
    expect((await send(app, 'DELETE', `/api/users/${adminId}`, { cookie: anaCookie })).status).toBe(
      200,
    );
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it('keeps an admin when two admins demote each other at the same moment', async () => {
    const app = makeApp();
    const cookie = await login(app, 'Admin', ADMIN_PASSWORD);
    await send(app, 'PATCH', `/api/users/${memberId}`, { cookie, body: { role: 'admin' } });
    const anaCookie = await login(app, 'ana', MEMBER_PASSWORD);
    const results = await Promise.all([
      send(app, 'PATCH', `/api/users/${memberId}`, { cookie, body: { role: 'member' } }),
      send(app, 'PATCH', `/api/users/${adminId}`, { cookie: anaCookie, body: { role: 'member' } }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const admins = await db.select().from(users).where(eq(users.role, 'admin'));
    expect(admins).toHaveLength(1);
  });

  it('says a username is taken when two admins create it at the same moment', async () => {
    const app = makeApp();
    const cookie = await login(app, 'Admin', ADMIN_PASSWORD);
    const results = await Promise.all([
      send(app, 'POST', '/api/users', { cookie, body: { username: 'bo' } }),
      send(app, 'POST', '/api/users', { cookie, body: { username: 'Bo' } }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const refused = results.find((r) => r.status === 400);
    expect(((await refused?.json()) as ApiErrorBody).error.message).toBe('That username is taken');
  });

  it('removes a user and their sessions', async () => {
    const app = makeApp();
    const cookie = await login(app, 'Admin', ADMIN_PASSWORD);
    const anaCookie = await login(app, 'ana', MEMBER_PASSWORD);
    expect((await send(app, 'DELETE', `/api/users/${memberId}`, { cookie })).status).toBe(200);
    expect((await send(app, 'GET', '/api/events', { cookie: anaCookie })).status).toBe(401);
    expect((await send(app, 'DELETE', `/api/users/9999`, { cookie })).status).toBe(404);
  });
});

describe('with auth off (local development)', () => {
  it('needs no login and says so', async () => {
    const app = makeApp(false);
    expect((await send(app, 'GET', '/api/events')).status).toBe(200);
    const me = await send(app, 'GET', '/api/auth/me');
    expect(await me.json()).toEqual({ authRequired: false, user: null });
    expect(
      (await send(app, 'POST', '/api/users', { body: { username: 'x1' }, origin: null })).status,
    ).toBe(404);
  });
});

describe('security headers', () => {
  it('are on API responses, errors included', async () => {
    const app = makeApp();
    for (const path of ['/api/health', '/api/events', '/api/nope']) {
      const response = await send(app, 'GET', path);
      expect(response.headers.get('content-security-policy'), path).toContain("default-src 'self'");
      expect(response.headers.get('content-security-policy'), path).toContain(
        "frame-ancestors 'none'",
      );
      expect(response.headers.get('x-content-type-options'), path).toBe('nosniff');
      expect(response.headers.get('referrer-policy'), path).toBe('same-origin');
      expect(response.headers.get('x-frame-options'), path).toBe('DENY');
      // Kept out of search engines: it's for friends, not the public.
      expect(response.headers.get('x-robots-tag'), path).toBe('noindex, nofollow');
    }
  });

  it('are on the web app’s pages too, which open without a session', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'bcp-web-'));
    try {
      await writeFile(join(dist, 'index.html'), '<!doctype html>');
      const app = makeApp();
      serveWebApp(app, dist);
      const response = await send(app, 'GET', '/events/X');
      expect(response.status).toBe(200);
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    } finally {
      await rm(dist, { recursive: true, force: true });
    }
  });
});
