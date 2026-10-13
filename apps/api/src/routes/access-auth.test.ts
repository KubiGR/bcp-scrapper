import type { MeResponse } from '@bcp/shared';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { serveWebApp } from '../static';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';

const HOST = 'bcp.example.com';
const ORIGIN = `https://${HOST}`;
const TEAM = 'myteam.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const ADMIN = 'boss@example.com';

let db: Db;
let close: () => Promise<void>;
let privateKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

/** A token as Cloudflare Access signs it; each override changes one claim or the key. */
async function token(
  claims: { email?: string; aud?: string; iss?: string; exp?: number; key?: CryptoKey } = {},
) {
  return new SignJWT({ email: claims.email ?? ADMIN })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(claims.iss ?? `https://${TEAM}`)
    .setAudience(claims.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(claims.key ?? privateKey);
}

function makeApp(now?: () => Date) {
  return createApp({
    now,
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
    allowedHosts: new Set(['localhost', HOST]),
    auth: {
      required: true,
      secret: '',
      access: { teamDomain: TEAM, aud: AUD, adminEmails: [ADMIN], keys: jwks },
    },
  });
}

/** A visitor who was let in: their account approved (enabled). */
async function approve(email: string) {
  await db.update(users).set({ disabled: false }).where(eq(users.username, email));
}

function send(
  app: ReturnType<typeof makeApp>,
  method: string,
  path: string,
  options: { jwt?: string | null; origin?: string | null; body?: unknown } = {},
) {
  const headers: Record<string, string> = { host: HOST };
  if (options.jwt !== null && options.jwt !== undefined) {
    headers['cf-access-jwt-assertion'] = options.jwt;
  }
  if (method !== 'GET' && options.origin !== null) headers.origin = options.origin ?? ORIGIN;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return app.request(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  jwks = createLocalJWKSet({ keys: [jwk] });
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
});

describe('Cloudflare Access login', () => {
  it('knows the visitor by the email in a valid token, and makes the admin an admin', async () => {
    const response = await send(makeApp(), 'GET', '/api/auth/me', { jwt: await token() });
    expect(response.status).toBe(200);
    const body = (await response.json()) as MeResponse;
    expect(body).toMatchObject({
      authRequired: true,
      access: true,
      user: { username: ADMIN, role: 'admin', mustChangePassword: false, disabled: false },
    });
  });

  it('makes anyone else a member who waits for approval, remembered as the same user', async () => {
    const app = makeApp();
    const jwt = await token({ email: 'Ana@Example.com' });
    // Waiting: the API refuses them until an admin approves.
    expect((await send(app, 'GET', '/api/auth/me', { jwt })).status).toBe(403);
    expect((await send(app, 'GET', '/api/events', { jwt })).status).toBe(403);
    expect(await db.select().from(users)).toMatchObject([
      { username: 'ana@example.com', role: 'member', disabled: true },
    ]);
    await approve('ana@example.com');
    const me = (await (await send(app, 'GET', '/api/auth/me', { jwt })).json()) as MeResponse;
    expect(me.user).toMatchObject({ username: 'ana@example.com', role: 'member', disabled: false });
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it('keeps admin rights tied to ADMIN_EMAILS, not to what was stored', async () => {
    await db.insert(users).values({ username: ADMIN, passwordHash: '!', role: 'member' });
    const me = (await (
      await send(makeApp(), 'GET', '/api/auth/me', { jwt: await token() })
    ).json()) as MeResponse;
    expect(me.user?.role).toBe('admin');
  });

  it('lets a valid token reach the API, and a member not the admin-only actions', async () => {
    const app = makeApp();
    expect((await send(app, 'GET', '/api/events', { jwt: await token() })).status).toBe(200);
    const member = await token({ email: 'ana@example.com' });
    await send(app, 'GET', '/api/events', { jwt: member });
    await approve('ana@example.com');
    expect((await send(app, 'GET', '/api/events', { jwt: member })).status).toBe(200);
    expect((await send(app, 'POST', '/api/rules/refresh', { jwt: member })).status).toBe(403);
  });

  it('refuses a request with no token', async () => {
    const app = makeApp();
    expect((await send(app, 'GET', '/api/events')).status).toBe(401);
    expect((await send(app, 'GET', '/api/auth/me')).status).toBe(401);
  });

  it('refuses a token with the wrong audience, issuer, signature or expiry', async () => {
    const app = makeApp();
    const other = await generateKeyPair('RS256');
    const bad = [
      await token({ aud: 'someone-elses-app' }),
      await token({ iss: 'https://evil.cloudflareaccess.com' }),
      await token({ key: other.privateKey }),
      await token({ exp: Math.floor(Date.now() / 1000) - 60 }),
      'not-a-token',
    ];
    for (const jwt of bad) {
      expect((await send(app, 'GET', '/api/events', { jwt })).status).toBe(401);
    }
  });

  it('refuses a token without an email', async () => {
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(`https://${TEAM}`)
      .setAudience(AUD)
      .setExpirationTime('1h')
      .sign(privateKey);
    expect((await send(makeApp(), 'GET', '/api/events', { jwt })).status).toBe(401);
  });

  it('refuses a disabled user', async () => {
    await db
      .insert(users)
      .values({ username: 'ana@example.com', passwordHash: '!', role: 'member', disabled: true });
    const jwt = await token({ email: 'ana@example.com' });
    expect((await send(makeApp(), 'GET', '/api/events', { jwt })).status).toBe(403);
  });

  it('still refuses a state-changing request from another site', async () => {
    const jwt = await token();
    const response = await send(makeApp(), 'POST', '/api/rules/refresh', {
      jwt,
      origin: 'https://evil.example',
    });
    expect(response.status).toBe(403);
  });

  it('has no password routes: no login, password change, new password accounts or resets', async () => {
    const app = makeApp();
    const jwt = await token();
    expect((await send(app, 'POST', '/api/auth/login', { jwt })).status).toBe(404);
    expect((await send(app, 'POST', '/api/auth/password', { jwt })).status).toBe(404);
    expect(
      (await send(app, 'POST', '/api/users', { jwt, body: { username: 'x', role: 'member' } }))
        .status,
    ).toBe(404);
    expect((await send(app, 'POST', '/api/users/1/reset-password', { jwt })).status).toBe(404);
  });

  it('lets an admin see who waits, approve them, or remove them', async () => {
    const app = makeApp();
    const admin = await token();
    await send(app, 'GET', '/api/events', { jwt: admin });
    await send(app, 'GET', '/api/events', { jwt: await token({ email: 'ana@example.com' }) });
    await send(app, 'GET', '/api/events', { jwt: await token({ email: 'bo@example.com' }) });
    const list = (await (await send(app, 'GET', '/api/users', { jwt: admin })).json()) as {
      users: { id: number; username: string; disabled: boolean }[];
    };
    const ana = list.users.find((u) => u.username === 'ana@example.com');
    const bo = list.users.find((u) => u.username === 'bo@example.com');
    expect(ana?.disabled).toBe(true);
    // Approve Ana, remove Bo.
    const approved = await send(app, 'PATCH', `/api/users/${String(ana?.id)}`, {
      jwt: admin,
      body: { disabled: false },
    });
    expect(approved.status).toBe(200);
    expect((await send(app, 'DELETE', `/api/users/${String(bo?.id)}`, { jwt: admin })).status).toBe(
      200,
    );
    const ana2 = await token({ email: 'ana@example.com' });
    expect((await send(app, 'GET', '/api/events', { jwt: ana2 })).status).toBe(200);
    // A member can't manage users.
    expect((await send(app, 'GET', '/api/users', { jwt: ana2 })).status).toBe(403);
  });

  it('tells the admin when each person was last seen, those waiting too', async () => {
    let clock = new Date('2026-10-14T10:00:00Z');
    const app = makeApp(() => clock);
    const admin = await token();
    await send(app, 'GET', '/api/events', { jwt: await token({ email: 'ana@example.com' }) });
    clock = new Date('2026-10-14T12:00:00Z');
    const list = (await (await send(app, 'GET', '/api/users', { jwt: admin })).json()) as {
      users: { username: string; lastSeenAt: string | null }[];
    };
    const seen = Object.fromEntries(list.users.map((u) => [u.username, u.lastSeenAt]));
    expect(seen).toEqual({
      [ADMIN]: '2026-10-14T12:00:00.000Z',
      'ana@example.com': '2026-10-14T10:00:00.000Z',
    });
  });

  it('records a visit at most every few minutes, not on every request', async () => {
    let clock = new Date('2026-10-14T10:00:00Z');
    const app = makeApp(() => clock);
    const admin = await token();
    const seenAt = async () =>
      (
        await db.select().from(users).where(eq(users.username, ADMIN))
      )[0]?.lastSeenAt?.toISOString();
    await send(app, 'GET', '/api/events', { jwt: admin });
    clock = new Date('2026-10-14T10:02:00Z');
    await send(app, 'GET', '/api/events', { jwt: admin });
    expect(await seenAt()).toBe('2026-10-14T10:00:00.000Z');
    clock = new Date('2026-10-14T10:06:00Z');
    await send(app, 'GET', '/api/events', { jwt: admin });
    expect(await seenAt()).toBe('2026-10-14T10:06:00.000Z');
  });

  it('lets an admin open the pairings planner to a member, who then sees it in /me', async () => {
    const app = makeApp();
    const admin = await token();
    const anaJwt = await token({ email: 'ana@example.com' });
    await send(app, 'GET', '/api/events', { jwt: anaJwt });
    await approve('ana@example.com');
    const before = (await (
      await send(app, 'GET', '/api/auth/me', { jwt: anaJwt })
    ).json()) as MeResponse;
    expect(before.user?.canPair).toBe(false);
    const changed = await send(app, 'PATCH', `/api/users/${String(before.user?.id)}`, {
      jwt: admin,
      body: { canPair: true },
    });
    expect(changed.status).toBe(200);
    const after = (await (
      await send(app, 'GET', '/api/auth/me', { jwt: anaJwt })
    ).json()) as MeResponse;
    expect(after.user?.canPair).toBe(true);
  });

  it('keeps the fetch queue’s controls for admins; an event’s own retry stays open', async () => {
    const app = makeApp();
    const anaJwt = await token({ email: 'ana@example.com' });
    await send(app, 'GET', '/api/events', { jwt: anaJwt });
    await approve('ana@example.com');
    const as = (jwt: string, path: string, body: unknown = {}) =>
      send(app, 'POST', path, { jwt, body });
    expect((await as(anaJwt, '/api/fetch-queue/pause')).status).toBe(403);
    expect((await as(anaJwt, '/api/fetch-queue/resume')).status).toBe(403);
    expect((await as(anaJwt, '/api/fetch-queue/retry-failed')).status).toBe(403);
    expect((await as(anaJwt, '/api/fetch-queue/retry-failed', { eventId: 'EVT1' })).status).toBe(
      200,
    );
    const admin = await token();
    expect((await as(admin, '/api/fetch-queue/pause')).status).toBe(200);
    expect((await as(admin, '/api/fetch-queue/resume')).status).toBe(200);
  });

  it('lets an admin ignore someone waiting: still locked out, marked ignored', async () => {
    const app = makeApp();
    const admin = await token();
    const boJwt = await token({ email: 'bo@example.com' });
    await send(app, 'GET', '/api/events', { jwt: boJwt });
    const list = (await (await send(app, 'GET', '/api/users', { jwt: admin })).json()) as {
      users: { id: number; username: string; ignored: boolean }[];
    };
    const bo = list.users.find((u) => u.username === 'bo@example.com');
    expect(bo?.ignored).toBe(false);
    const ignored = await send(app, 'PATCH', `/api/users/${String(bo?.id)}`, {
      jwt: admin,
      body: { ignored: true },
    });
    expect(((await ignored.json()) as { user: { ignored: boolean } }).user.ignored).toBe(true);
    // Ignored is not let in.
    expect((await send(app, 'GET', '/api/events', { jwt: boJwt })).status).toBe(403);
  });

  describe('the web app itself', () => {
    let dist: string;
    beforeEach(async () => {
      dist = await mkdtemp(join(tmpdir(), 'bcp-web-'));
      await writeFile(
        join(dist, 'index.html'),
        '<!doctype html><script src="/assets/app.js"></script>',
      );
    });
    const withWeb = () => {
      const app = makeApp();
      serveWebApp(app, dist);
      return app;
    };
    afterEach(async () => {
      await rm(dist, { recursive: true, force: true });
    });

    it('shows someone waiting only a page saying so: no app, no script', async () => {
      const app = withWeb();
      const jwt = await token({ email: 'ana@example.com' });
      for (const path of ['/', '/events/X', '/assets/app.js', '/robots.txt']) {
        const response = await send(app, 'GET', path, { jwt });
        expect(response.status, path).toBe(403);
        const html = await response.text();
        expect(html, path).toContain('Waiting for approval');
        expect(html, path).not.toContain('<script');
      }
    });

    it('serves the app once approved, and to an admin', async () => {
      const app = withWeb();
      const jwt = await token({ email: 'ana@example.com' });
      await send(app, 'GET', '/', { jwt });
      await approve('ana@example.com');
      expect(await (await send(app, 'GET', '/', { jwt })).text()).toContain('<script');
      expect((await send(app, 'GET', '/', { jwt: await token() })).status).toBe(200);
    });

    it('serves nothing without a valid Access token', async () => {
      const response = await send(withWeb(), 'GET', '/');
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain('<script');
    });
  });

  it('leaves the health check open', async () => {
    expect((await send(makeApp(), 'GET', '/api/health')).status).toBe(200);
  });
});
