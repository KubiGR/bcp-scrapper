import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb } from '../db/test-db';
import { BcpAuthError, BcpUnavailableError } from '../errors';
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
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- url/body are string-like in this mock
    expect(String(url)).toBe('https://bcp.test/oauth/token');
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- url/body are string-like in this mock
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

  it('never sends a refresh token BCP rejected again', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('no', { status: 401 }));
    const auth = makeAuth({ envRefreshToken: 'expired', fetch: fetchMock });

    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(BcpAuthError);
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(BcpAuthError);
    await expect(auth.refresh()).rejects.toBeInstanceOf(BcpAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws BcpAuthError for a 200 whose body is not JSON', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>oops</html>', { status: 200 }));
    const auth = makeAuth({ envRefreshToken: 'refresh-1', fetch: fetchMock });
    await expect(auth.refresh()).rejects.toThrow(
      new BcpAuthError('BCP token response had an unexpected shape'),
    );
  });

  it('treats a 5xx from the token endpoint as BCP being down, not as a rejected login', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(tokenResponse(fakeJwt(NOW + 3_600_000)));
    const auth = makeAuth({ envRefreshToken: 'refresh-1', fetch: fetchMock });

    await expect(auth.refresh()).rejects.toBeInstanceOf(BcpUnavailableError);
    await expect(auth.refresh()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- url/body are string-like in this mock
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
