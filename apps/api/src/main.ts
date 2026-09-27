import { serve } from '@hono/node-server';
import { createApp } from './app';
import { ensureAdmin } from './auth/bootstrap';
import { createSource } from './bcp/create-source';
import { allowedHostsOf, loadConfig } from './config';
import { createDb } from './db/client';
import { AutoFetchPlanner } from './fetch-queue/auto-fetch';
import { FetchQueueWorker } from './fetch-queue/worker';
import { createLogger } from './logger';
import { deleteSmallEvents } from './repo/events';
import { reparseLists } from './repo/lists';
import { failInterruptedSyncRuns } from './repo/sync-runs';
import { serveWebApp } from './static';
import { SyncRunner } from './sync/runner';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');
const eventRule = { minRounds: config.MIN_EVENT_ROUNDS, minPlayers: config.MIN_EVENT_PLAYERS };

const database = createDb(config.DATABASE_URL);
await database.migrate();
await ensureAdmin(database.db, config, logger);
const reparsed = await reparseLists(database.db, logger);
if (reparsed > 0) logger.info({ reparsed }, 'Re-read stored army lists');
const deleted = await deleteSmallEvents(database.db, eventRule);
if (deleted > 0) logger.info({ deleted }, 'Deleted small events (RTTs and events under N players)');
const interrupted = await failInterruptedSyncRuns(database.db);
if (interrupted > 0)
  logger.warn({ interrupted }, 'Marked sync runs cut off by a restart as failed');

const { source, status } = createSource(config, { db: database.db, logger });
const runner = new SyncRunner({ db: database.db, source, logger, eventRule });
const fetchQueue = new FetchQueueWorker({
  db: database.db,
  source,
  logger: logger.child({ module: 'fetch-queue' }),
  intervalMs: config.FETCH_QUEUE_INTERVAL_MS,
  // Asked once per auth error: BCP refusing one list must not pause the queue while the login
  // works. The status check refreshes a stale login at most once (single-flight) and never
  // resends a refresh token BCP already refused.
  loginRejected: async () => {
    const { state } = await status();
    return state === 'rejected' || state === 'missing';
  },
});
await fetchQueue.start();
const autoFetch = config.AUTO_FETCH_ENABLED
  ? new AutoFetchPlanner({
      db: database.db,
      runner,
      logger: logger.child({ module: 'auto-fetch' }),
      eventRule,
      days: config.AUTO_FETCH_DAYS,
      intervalMs: config.AUTO_FETCH_INTERVAL_MS,
      catalogIntervalMs: config.AUTO_CATALOG_INTERVAL_MS,
    })
  : undefined;
autoFetch?.start();
const app = createApp({
  db: database.db,
  runner,
  fetchQueue,
  bcpStatus: status,
  logger,
  eventRule,
  allowedHosts: allowedHostsOf(config),
  autoFetch,
  auth: { required: config.AUTH_REQUIRED, secret: config.SESSION_SECRET ?? '' },
});
if (config.WEB_DIST_DIR !== undefined) serveWebApp(app, config.WEB_DIST_DIR);

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
  logger.info(
    `API listening on http://${config.HOST}:${info.port} (source: ${config.TOURNAMENT_SOURCE}, logins ${config.AUTH_REQUIRED ? 'on' : 'off'})`,
  );
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down');
  server.close();
  await autoFetch?.stop();
  // Let a list fetch in flight finish writing before the database closes.
  await fetchQueue.stop();
  await database.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
