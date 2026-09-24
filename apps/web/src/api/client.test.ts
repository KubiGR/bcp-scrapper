import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { stubFetchJson } from '../test/render';
import { ApiError, apiDelete, apiGet, apiPost } from './client';

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

  it('POSTs JSON and parses the response', async () => {
    const fetchMock = stubFetchJson({ status: 'ok' });
    await expect(
      apiPost('/api/x', { a: 1 }, z.object({ status: z.literal('ok') })),
    ).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/x',
      expect.objectContaining({ method: 'POST', body: '{"a":1}' }),
    );
  });

  it('turns a response that breaks the contract into an ApiError, not a raw ZodError', async () => {
    stubFetchJson({ status: 'nope' });
    await expect(apiGet('/api/x', z.object({ status: z.literal('ok') }))).rejects.toMatchObject({
      name: 'ApiError',
      code: 'INTERNAL',
      message: expect.stringContaining('/api/x') as unknown,
    });
  });

  it('DELETEs with no body and parses the response', async () => {
    const fetchMock = stubFetchJson({ removed: 2 });
    await expect(apiDelete('/api/x', z.object({ removed: z.number() }))).resolves.toEqual({
      removed: 2,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', expect.objectContaining({ method: 'DELETE' }));
  });
});
