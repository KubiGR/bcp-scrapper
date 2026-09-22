import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { stubFetchJson } from '../test/render';
import { ApiError, apiGet } from './client';

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
});
