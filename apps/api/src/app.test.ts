import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { BcpRateLimitedError, NotFoundError } from './errors';
import { silentLogger } from './test/helpers';

function appWithBoomRoutes() {
  const app = createApp({ logger: silentLogger });
  app.get('/boom/not-found', () => {
    throw new NotFoundError('Event X not found');
  });
  app.get('/boom/rate-limited', () => {
    throw new BcpRateLimitedError(30);
  });
  app.get('/boom/unexpected', () => {
    throw new Error('kaboom');
  });
  return app;
}

describe('createApp', () => {
  it('answers the health check', async () => {
    const response = await createApp({ logger: silentLogger }).request('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('returns the standard error body for unknown routes', async () => {
    const response = await createApp({ logger: silentLogger }).request('/api/nope');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'No route for GET /api/nope' },
    });
  });

  it('maps AppErrors to their status and code', async () => {
    const response = await appWithBoomRoutes().request('/boom/not-found');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Event X not found' },
    });
  });

  it('adds Retry-After when BCP rate limits us', async () => {
    const response = await appWithBoomRoutes().request('/boom/rate-limited');
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const response = await appWithBoomRoutes().request('/boom/unexpected');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Something went wrong' },
    });
  });
});
