import type { ApiErrorBody, BcpStatus } from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from './db/client';
import { AppError, BcpRateLimitedError, toErrorBody } from './errors';
import type { Logger } from './logger';
import { bcpRoutes } from './routes/bcp';
import { catalogRoutes } from './routes/catalog';
import { eventRoutes } from './routes/events';
import { syncRoutes } from './routes/sync';
import type { SyncRunner } from './sync/runner';

export interface AppDeps {
  db: Db;
  runner: SyncRunner;
  bcpStatus: () => Promise<BcpStatus>;
  logger: Logger;
  /** Injectable clock for freshness rules; defaults to the real time. */
  now?: () => Date;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();
  const now = deps.now ?? (() => new Date());

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
  app.route('/api', eventRoutes({ ...deps, now }));
  app.route('/api', syncRoutes(deps));
  app.route('/api', bcpRoutes(deps));
  app.route('/api', catalogRoutes({ ...deps, now }));

  return app;
}
