import { serve } from '@hono/node-server';
import { createApp } from './app';
import { accessOptionsOf } from './auth/access';
import { ensureAdmin } from './auth/bootstrap';
import { createSource } from './bcp/create-source';
import { allowedHostsOf, loadConfig } from './config';
import { createDb } from './db/client';
import { AutoFetchPlanner } from './fetch-queue/auto-fetch';
import { FetchQueueWorker } from './fetch-queue/worker';
import { createLogger } from './logger';
import { deleteSmallEvents } from './repo/events';
import { reparseLists, tidyDetachments } from './repo/lists';
import { bsdataDue, syncBsdata } from './repo/bsdata';
import { syncUpdateCommits } from './repo/game-updates';
import { httpBsdataClient } from './bsdata/client';
import { httpRulesClient } from './rules/client';
import { rulesDue, syncRules } from './repo/rules';
import { backfillPlayerUserIds } from './repo/player-accounts';
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
const accounts = await backfillPlayerUserIds(database.db);
if (accounts > 0) logger.info({ accounts }, 'Stored players’ BCP account ids');
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
  autoFetchAvailable: config.AUTO_FETCH_ENABLED,
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
      loginRejected: async () => (await fetchQueue.state()).pausedReason === 'login-rejected',
    })
  : undefined;
autoFetch?.start();

// BSData (detachments per faction): checked hourly, read again once a day.
const bsdata = config.BSDATA_ENABLED ? httpBsdataClient() : undefined;
const syncBsdataIfDue = async () => {
  if (bsdata === undefined) return;
  try {
    if (await bsdataDue(database.db, new Date())) {
      const status = await syncBsdata(database.db, bsdata, new Date());
      const commits = await syncUpdateCommits(database.db, bsdata).catch((error: unknown) => {
        logger.warn({ err: error }, 'Could not read BSData’s history for game updates');
        return 0;
      });
      if (commits > 0) logger.info({ commits }, 'Read BSData’s history for game updates');
      await tidyDetachments(database.db);
      logger.info(
        { factions: status.factions.length, errors: status.errors.length },
        'Read BSData',
      );
    }
  } catch (error) {
    logger.warn({ err: error }, 'BSData sync failed; will try again');
  }
};
void syncBsdataIfDue();
const bsdataTimer = setInterval(() => void syncBsdataIfDue(), 60 * 60 * 1000);

// 39k.pro (Mathhammer's unit data): checked hourly, read again once a day.
const rules = config.RULES_ENABLED ? httpRulesClient() : undefined;
const syncRulesIfDue = async () => {
  if (rules === undefined) return;
  try {
    if (await rulesDue(database.db, new Date())) {
      const status = await syncRules(database.db, rules, new Date());
      if (status.error === null) {
        logger.info({ dataVersion: status.dataVersion }, 'Read the unit data from 39k.pro');
      } else {
        logger.warn({ error: status.error }, 'Could not read the unit data from 39k.pro');
      }
    }
  } catch (error) {
    logger.warn({ err: error }, 'Unit data check failed; will try again');
  }
};
void syncRulesIfDue();
const rulesTimer = setInterval(() => void syncRulesIfDue(), 60 * 60 * 1000);

const access = accessOptionsOf(config);
const app = createApp({
  db: database.db,
  runner,
  fetchQueue,
  bcpStatus: status,
  logger,
  eventRule,
  allowedHosts: allowedHostsOf(config),
  autoFetch,
  bsdata,
  rules,
  auth: {
    required: config.AUTH_REQUIRED || access !== undefined,
    secret: config.SESSION_SECRET ?? '',
    access,
  },
});
if (config.WEB_DIST_DIR !== undefined) serveWebApp(app, config.WEB_DIST_DIR);

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
  logger.info(
    `API listening on http://${config.HOST}:${info.port} (source: ${config.TOURNAMENT_SOURCE}, logins ${access !== undefined ? 'via Cloudflare Access' : config.AUTH_REQUIRED ? 'on' : 'off'})`,
  );
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down');
  server.close();
  clearInterval(bsdataTimer);
  clearInterval(rulesTimer);
  await autoFetch?.stop();
  // Let a list fetch in flight finish writing before the database closes.
  await fetchQueue.stop();
  await database.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
