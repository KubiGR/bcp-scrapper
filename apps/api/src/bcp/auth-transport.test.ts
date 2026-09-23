import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BcpAuthError } from '../errors';
import { settle, silentLogger } from '../test/helpers';
import { BcpAuth, createMemorySessionStore } from './auth';
import { HttpTransport } from './http-transport';
import { RateLimiter } from './rate-limiter';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const API_URL = 'https://bcp.test';

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

const pathOf = (input: Parameters<typeof fetch>[0]) =>
  new URL(input instanceof Request ? input.url : input).pathname;

/** One fake BCP behind one fetch: /oauth/token refuses the login, data routes answer `dataStatus`. */
function fakeBcp(dataStatus = 200) {
  const fetchMock = vi.fn<typeof fetch>((input) =>
    Promise.resolve(
      pathOf(input) === '/oauth/token'
        ? Response.json({ error: 'invalid session, please log in again' }, { status: 401 })
        : Response.json({ ok: true }, { status: dataStatus }),
    ),
  );
  const count = (tokenRoute: boolean) =>
    fetchMock.mock.calls.filter(([input]) => (pathOf(input) === '/oauth/token') === tokenRoute)
      .length;
  return { fetchMock, tokenPosts: () => count(true), dataRequests: () => count(false) };
}

function wire(fetchMock: typeof fetch, accessTokenExpiresAt: Date) {
  const store = createMemorySessionStore({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    accessTokenExpiresAt,
    lastRefreshAt: null,
    seedTokenHash: null,
  });
  const auth = new BcpAuth({
    apiUrl: API_URL,
    store,
    logger: silentLogger,
    fetch: fetchMock,
    now: () => NOW,
  });
  return new HttpTransport({
    baseUrl: API_URL,
    timeoutMs: 1000,
    maxAttempts: 4,
    limiter: new RateLimiter({ requestsPerSecond: 1000, maxConcurrency: 2 }),
    auth,
    logger: silentLogger,
    fetch: fetchMock,
  });
}

describe('BcpAuth + HttpTransport with a login BCP rejects', () => {
  it('fails a planned refresh with BcpAuthError after one POST, then never POSTs again', async () => {
    const bcp = fakeBcp();
    const transport = wire(bcp.fetchMock, new Date(NOW - 60_000));

    await expect(settle(transport.get({ path: '/v1/armylists/L1' }))).rejects.toBeInstanceOf(
      BcpAuthError,
    );
    expect(bcp.tokenPosts()).toBe(1);

    await expect(settle(transport.get({ path: '/v1/armylists/L2' }))).rejects.toBeInstanceOf(
      BcpAuthError,
    );
    expect(bcp.tokenPosts()).toBe(1);
    expect(bcp.dataRequests()).toBe(0);
  });

  it('fails a 401-triggered refresh the same way, without re-sending the refused token', async () => {
    const bcp = fakeBcp(401);
    const transport = wire(bcp.fetchMock, new Date(NOW + 3_600_000));

    await expect(settle(transport.get({ path: '/v1/armylists/L1' }))).rejects.toBeInstanceOf(
      BcpAuthError,
    );
    expect(bcp.tokenPosts()).toBe(1);
    expect(bcp.dataRequests()).toBe(1);

    await expect(settle(transport.get({ path: '/v1/armylists/L2' }))).rejects.toBeInstanceOf(
      BcpAuthError,
    );
    expect(bcp.tokenPosts()).toBe(1);
    expect(bcp.dataRequests()).toBe(1);
  });
});
