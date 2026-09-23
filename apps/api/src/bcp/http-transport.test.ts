import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BcpAuthError, BcpRateLimitedError, BcpUnavailableError, NotFoundError } from '../errors';
import { settle, silentLogger } from '../test/helpers';
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
