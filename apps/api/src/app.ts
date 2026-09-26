import type { ApiErrorBody, BcpStatus, EventSizeRule } from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from './db/client';
import { AppError, BcpRateLimitedError, toErrorBody } from './errors';
import type { FetchQueueWorker } from './fetch-queue/worker';
import type { Logger } from './logger';
import { analysisRoutes } from './routes/analysis';
import { bcpRoutes } from './routes/bcp';
import { catalogRoutes } from './routes/catalog';
import { eventRoutes } from './routes/events';
import { fetchQueueRoutes } from './routes/fetch-queue';
import { matchupsRoutes } from './routes/matchups';
import { syncRoutes } from './routes/sync';
import type { SyncRunner } from './sync/runner';

export interface AppDeps {
  db: Db;
  runner: SyncRunner;
  fetchQueue: FetchQueueWorker;
  bcpStatus: () => Promise<BcpStatus>;
  logger: Logger;
  /** The finder only shows events meeting this rule; a small event still opens by direct link. */
  eventRule: EventSizeRule;
  /** Injectable clock for freshness rules; defaults to the real time. */
  now?: () => Date;
  /** Hostnames the Host guard admits (see allowedHostsOf); loopback names by default. */
  allowedHosts?: Set<string>;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** The host part of a Host header (`[::1]:3001` → `[::1]`), or null if it isn't one. */
function hostnameOf(hostHeader: string): string | null {
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return null;
  }
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

  // DNS rebinding: a web page on another origin can resolve its own name to our address and
  // call us; its requests still carry its Host. Only the names we are reached by get through.
  const allowedHosts = deps.allowedHosts ?? LOOPBACK_HOSTS;
  app.use(async (c, next) => {
    const host = c.req.header('host') ?? new URL(c.req.url).host;
    const hostname = hostnameOf(host);
    if (hostname === null || !allowedHosts.has(hostname)) {
      const body: ApiErrorBody = {
        error: { code: 'VALIDATION_ERROR', message: 'Unexpected Host header' },
      };
      return c.json(body, 403);
    }
    await next();
  });

  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  app.route('/api', eventRoutes({ ...deps, now }));
  app.route('/api', syncRoutes(deps));
  app.route('/api', bcpRoutes(deps));
  app.route('/api', catalogRoutes({ ...deps, now }));
  app.route('/api', fetchQueueRoutes(deps));
  app.route('/api', analysisRoutes(deps));
  app.route('/api', matchupsRoutes({ ...deps, now }));

  return app;
}
