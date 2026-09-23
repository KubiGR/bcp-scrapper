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
  now?: () => number;
}) {
  return new BcpAuth({
    apiUrl: 'https://bcp.test',
    store: options.store ?? createMemorySessionStore(),
    envRefreshToken: options.envRefreshToken,
    envAccessToken: options.envAccessToken,
    logger: silentLogger,
    fetch: options.fetch ?? vi.fn<typeof fetch>(),
    now: options.now ?? (() => NOW),
  });
}

const sentRefreshToken = (init: RequestInit | undefined): unknown =>
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a string in these mocks
  (JSON.parse(String(init?.body)) as { refresh_token?: unknown }).refresh_token;

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
    expect((await auth.status()).state).toBe('missing');
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
      state: 'connected',
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

  it('re-seeds from .env when only BCP_ACCESS_TOKEN changed, so the fallback works', async () => {
    const store = createMemorySessionStore();
    const refused = vi.fn<typeof fetch>().mockResolvedValue(new Response('no', { status: 401 }));
    const before = makeAuth({
      store,
      envRefreshToken: 'dead',
      envAccessToken: fakeJwt(NOW - 1000),
      fetch: refused,
    });
    await expect(before.getAccessToken()).rejects.toBeInstanceOf(BcpAuthError);

    const fetchMock = vi.fn<typeof fetch>();
    const fresh = fakeJwt(NOW + 3_600_000);
    const after = makeAuth({
      store,
      envRefreshToken: 'dead',
      envAccessToken: fresh,
      fetch: fetchMock,
    });
    expect(await after.getAccessToken()).toBe(fresh);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('BcpAuth across processes sharing one store', () => {
  /** A and B both hold r1 in memory; then the access token expires and A rotates it to r2. */
  async function afterARotates(rotatedAccessExpiresAt: (clock: number) => number) {
    let clock = NOW;
    const now = () => clock;
    const store = createMemorySessionStore({
      accessToken: fakeJwt(NOW + 120_000),
      refreshToken: 'r1',
      accessTokenExpiresAt: new Date(NOW + 120_000),
      lastRefreshAt: new Date(NOW - 3_600_000),
      seedTokenHash: null,
    });
    const fetchA = vi.fn<typeof fetch>();
    const fetchB = vi.fn<typeof fetch>();
    const a = makeAuth({ store, fetch: fetchA, now });
    const b = makeAuth({ store, fetch: fetchB, now });
    await a.getAccessToken();
    await b.getAccessToken();

    clock = NOW + 600_000;
    const rotatedAccess = fakeJwt(rotatedAccessExpiresAt(clock));
    fetchA.mockResolvedValue(tokenResponse(rotatedAccess, 'r2'));
    expect(await a.getAccessToken()).toBe(rotatedAccess);
    expect((await store.load())?.refreshToken).toBe('r2');
    return { b, fetchB, store, rotatedAccess, clock };
  }

  it("adopts the other process's rotated session instead of re-sending the old token", async () => {
    const { b, fetchB, rotatedAccess } = await afterARotates((clock) => clock + 3_600_000);

    expect(await b.getAccessToken()).toBe(rotatedAccess);
    expect(fetchB).not.toHaveBeenCalled();
  });

  it('refreshes with the rotated token when the adopted access token is also stale', async () => {
    const { b, fetchB, store, clock } = await afterARotates((now) => now + 30_000);
    const fresh = fakeJwt(clock + 3_600_000);
    fetchB.mockResolvedValue(tokenResponse(fresh, 'r3'));

    expect(await b.getAccessToken()).toBe(fresh);
    expect(fetchB).toHaveBeenCalledTimes(1);
    expect(sentRefreshToken(fetchB.mock.calls[0]?.[1])).toBe('r2');
    expect((await store.load())?.refreshToken).toBe('r3');
  });

  it('recovers from a rejected token once another process stores a newer one', async () => {
    const store = createMemorySessionStore();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('no', { status: 401 }));
    const auth = makeAuth({ store, envRefreshToken: 'r1', fetch: fetchMock });
    expect((await auth.status()).state).toBe('rejected');

    const access = fakeJwt(NOW + 3_600_000);
    const seed = await store.load();
    if (!seed) throw new Error('not seeded');
    await store.save({
      ...seed,
      accessToken: access,
      refreshToken: 'r2',
      accessTokenExpiresAt: new Date(NOW + 3_600_000),
      lastRefreshAt: new Date(NOW),
    });

    expect(await auth.getAccessToken()).toBe(access);
    expect((await auth.status()).state).toBe('connected');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a rotated token in memory even when saving it fails', async () => {
    const inner = createMemorySessionStore();
    const store = {
      load: () => inner.load(),
      save: vi
        .fn<(session: BcpSession) => Promise<void>>()
        .mockImplementationOnce((session) => inner.save(session)) // the seed
        .mockRejectedValue(new Error('database is down')),
    };
    const fresh = fakeJwt(NOW + 3_600_000);
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(tokenResponse(fresh, 'r2')));
    const auth = makeAuth({ store, envRefreshToken: 'r1', fetch: fetchMock });

    await expect(auth.getAccessToken()).rejects.toThrow('database is down');
    expect(await auth.getAccessToken()).toBe(fresh);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    await expect(auth.refresh()).rejects.toThrow('database is down');
    expect(sentRefreshToken(fetchMock.mock.calls[0]?.[1])).toBe('r2');
  });

  it('loads (and seeds) the session once for concurrent first callers', async () => {
    const inner = createMemorySessionStore();
    const store = { load: vi.fn(() => inner.load()), save: vi.fn(inner.save) };
    const auth = makeAuth({ store, envAccessToken: fakeJwt(NOW + 3_600_000) });

    await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.status()]);
    expect(store.load).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});

describe('BcpAuth.status', () => {
  it('is connected with a usable access token and no refresh token, without a POST', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const auth = makeAuth({ envAccessToken: fakeJwt(NOW + 3_600_000), fetch: fetchMock });
    expect((await auth.status()).state).toBe('connected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is missing with only an expired access token', async () => {
    const auth = makeAuth({ envAccessToken: fakeJwt(NOW - 1000) });
    expect((await auth.status()).state).toBe('missing');
  });

  it('refreshes an expired login to check it, and reports it connected', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(tokenResponse(fakeJwt(NOW + 3_600_000)));
    const auth = makeAuth({ envRefreshToken: 'refresh-1', fetch: fetchMock });

    expect(await auth.status()).toEqual({
      state: 'connected',
      accessTokenExpiresAt: new Date(NOW + 3_600_000).toISOString(),
      lastRefreshAt: new Date(NOW).toISOString(),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a login BCP rejects, without throwing or POSTing twice', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('no', { status: 401 }));
    const auth = makeAuth({ envRefreshToken: 'expired', fetch: fetchMock });

    expect((await auth.status()).state).toBe('rejected');
    expect((await auth.status()).state).toBe('rejected');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('checks concurrent status calls with a single refresh', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(tokenResponse(fakeJwt(NOW + 3_600_000)));
    const auth = makeAuth({ envRefreshToken: 'refresh-1', fetch: fetchMock });
    await Promise.all([auth.status(), auth.status()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
