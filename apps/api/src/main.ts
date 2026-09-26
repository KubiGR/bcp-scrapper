import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createSource } from './bcp/create-source';
import { allowedHostsOf, loadConfig } from './config';
import { createDb } from './db/client';
import { FetchQueueWorker } from './fetch-queue/worker';
import { createLogger } from './logger';
import { deleteSmallEvents } from './repo/events';
import { failInterruptedSyncRuns } from './repo/sync-runs';
import { serveWebApp } from './static';
import { SyncRunner } from './sync/runner';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');
const eventRule = { minRounds: config.MIN_EVENT_ROUNDS, minPlayers: config.MIN_EVENT_PLAYERS };

const database = createDb(config.DATABASE_URL);
await database.migrate();
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
const app = createApp({
  db: database.db,
  runner,
  fetchQueue,
  bcpStatus: status,
  logger,
  eventRule,
  allowedHosts: allowedHostsOf(config),
});
if (config.WEB_DIST_DIR !== undefined) serveWebApp(app, config.WEB_DIST_DIR);

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
  logger.info(
    `API listening on http://${config.HOST}:${info.port} (source: ${config.TOURNAMENT_SOURCE})`,
  );
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down');
  server.close();
  // Let a list fetch in flight finish writing before the database closes.
  await fetchQueue.stop();
  await database.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
