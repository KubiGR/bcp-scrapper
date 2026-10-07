import type { MeResponse } from '@bcp/shared';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
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

function makeApp() {
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
    allowedHosts: new Set(['localhost', HOST]),
    auth: {
      required: true,
      secret: '',
      access: { teamDomain: TEAM, aud: AUD, adminEmails: [ADMIN], keys: jwks },
    },
  });
}

function send(
  app: ReturnType<typeof makeApp>,
  method: string,
  path: string,
  options: { jwt?: string | null; origin?: string | null } = {},
) {
  const headers: Record<string, string> = { host: HOST };
  if (options.jwt !== null && options.jwt !== undefined) {
    headers['cf-access-jwt-assertion'] = options.jwt;
  }
  if (method !== 'GET' && options.origin !== null) headers.origin = options.origin ?? ORIGIN;
  return app.request(path, { method, headers });
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

  it('makes anyone else a member, and remembers them as the same user next time', async () => {
    const app = makeApp();
    const jwt = await token({ email: 'Ana@Example.com' });
    const first = (await (await send(app, 'GET', '/api/auth/me', { jwt })).json()) as MeResponse;
    const again = (await (await send(app, 'GET', '/api/auth/me', { jwt })).json()) as MeResponse;
    expect(first.user).toMatchObject({ username: 'ana@example.com', role: 'member' });
    expect(again.user?.id).toBe(first.user?.id);
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

  it('has no password routes or user management', async () => {
    const app = makeApp();
    const jwt = await token();
    expect((await send(app, 'POST', '/api/auth/login', { jwt })).status).toBe(404);
    expect((await send(app, 'POST', '/api/auth/password', { jwt })).status).toBe(404);
    expect((await send(app, 'GET', '/api/users', { jwt })).status).toBe(404);
  });

  it('leaves the health check open', async () => {
    expect((await send(makeApp(), 'GET', '/api/health')).status).toBe(200);
  });
});
