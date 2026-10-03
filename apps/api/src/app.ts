import type { ApiErrorBody, BcpStatus, EventSizeRule } from '@bcp/shared';
import { Hono } from 'hono';
import { authMiddleware, securityHeaders, type AuthOptions } from './auth/middleware';
import { LoginLimiter } from './auth/rate-limit';
import type { Db } from './db/client';
import { AppError, BcpRateLimitedError, LoginRateLimitedError, toErrorBody } from './errors';
import type { AutoFetchPlanner } from './fetch-queue/auto-fetch';
import type { FetchQueueWorker } from './fetch-queue/worker';
import type { Logger } from './logger';
import { analysisRoutes } from './routes/analysis';
import { autoFetchRoutes } from './routes/auto-fetch';
import { authRoutes } from './routes/auth';
import { bcpRoutes } from './routes/bcp';
import { catalogRoutes } from './routes/catalog';
import { detachmentLinkRoutes } from './routes/detachment-links';
import { eventRoutes } from './routes/events';
import { fetchQueueRoutes } from './routes/fetch-queue';
import { matchupsRoutes } from './routes/matchups';
import { metaRoutes } from './routes/meta';
import { bsdataRoutes } from './routes/bsdata';
import { playersSearchRoutes } from './routes/players-search';
import { rankingsRoutes } from './routes/rankings';
import { syncRoutes } from './routes/sync';
import { userRoutes } from './routes/users';
import type { SyncRunner } from './sync/runner';
import type { BsdataClient } from './bsdata/client';

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
  /** Logins (AUTH_REQUIRED); off by default, as in local development. */
  auth?: AuthOptions;
  /** The automatic fetching planner, when it runs (not in tests or e2e). */
  autoFetch?: AutoFetchPlanner;
  /** BSData on GitHub, for detachments; Refresh answers 404 without it. */
  bsdata?: BsdataClient;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

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
      if (error instanceof BcpRateLimitedError || error instanceof LoginRateLimitedError) {
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
  const auth = deps.auth ?? { required: false, secret: '' };

  app.use(securityHeaders);
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

  app.use(authMiddleware({ db: deps.db, options: auth, allowedHosts, now }));

  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  const limiters = {
    perUser: new LoginLimiter({ limit: 5, windowMs: LOGIN_WINDOW_MS, now }),
    perIp: new LoginLimiter({ limit: 50, windowMs: LOGIN_WINDOW_MS, now }),
  };
  app.route('/api', authRoutes({ db: deps.db, options: auth, limiters, now }));
  if (auth.required) app.route('/api', userRoutes({ db: deps.db }));
  app.route('/api', eventRoutes({ ...deps, now }));
  app.route('/api', syncRoutes(deps));
  app.route('/api', bcpRoutes(deps));
  app.route('/api', catalogRoutes({ ...deps, now }));
  app.route('/api', fetchQueueRoutes(deps));
  app.route('/api', analysisRoutes(deps));
  app.route('/api', matchupsRoutes({ ...deps, now }));
  app.route('/api', playersSearchRoutes({ ...deps, now }));
  app.route('/api', rankingsRoutes({ ...deps, now }));
  app.route('/api', metaRoutes({ ...deps, now }));
  app.route('/api', detachmentLinkRoutes({ db: deps.db, authRequired: auth.required }));
  app.route(
    '/api',
    bsdataRoutes({ db: deps.db, client: deps.bsdata, authRequired: auth.required, now }),
  );
  app.route(
    '/api',
    autoFetchRoutes({ db: deps.db, planner: deps.autoFetch, authRequired: auth.required }),
  );

  return app;
}
