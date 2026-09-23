import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createSource } from './bcp/create-source';
import { loadConfig } from './config';
import { createDb } from './db/client';
import { createLogger } from './logger';
import { failInterruptedSyncRuns } from './repo/sync-runs';
import { SyncRunner } from './sync/runner';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV === 'development');

const database = createDb(config.DATABASE_URL);
await database.migrate();
const interrupted = await failInterruptedSyncRuns(database.db);
if (interrupted > 0)
  logger.warn({ interrupted }, 'Marked sync runs cut off by a restart as failed');

const { source, status } = createSource(config, { db: database.db, logger });
const runner = new SyncRunner({ db: database.db, source, logger });
const app = createApp({ db: database.db, runner, bcpStatus: status, logger });

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
  logger.info(
    `API listening on http://${config.HOST}:${info.port} (source: ${config.TOURNAMENT_SOURCE})`,
  );
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down');
  server.close();
  await database.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
