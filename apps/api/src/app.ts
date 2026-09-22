import type { ApiErrorBody } from '@bcp/shared';
import { Hono } from 'hono';
import { AppError, BcpRateLimitedError, toErrorBody } from './errors';
import type { Logger } from './logger';

export interface AppDeps {
  logger: Logger;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof AppError) {
      if (error instanceof BcpRateLimitedError) {
        c.header('Retry-After', String(error.retryAfterSeconds));
      }
      return c.json(toErrorBody(error), error.status);
    }
    deps.logger.error({ err: error }, 'Unhandled error');
    const body: ApiErrorBody = { error: { code: 'INTERNAL', message: 'Something went wrong' } };
    return c.json(body, 500);
  });

  app.notFound((c) => {
    const body: ApiErrorBody = {
      error: { code: 'NOT_FOUND', message: `No route for ${c.req.method} ${c.req.path}` },
    };
    return c.json(body, 404);
  });

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  return app;
}
