import { serve } from '@hono/node-server';
import { createApp } from './app';
import { accessOptionsOf } from './auth/access';
import { ensureAdmin } from './auth/bootstrap';
import { createSource } from './bcp/create-source';
import { allowedHostsOf, loadConfig, mailSettingsOf, siteUrlOf } from './config';
import { createDb } from './db/client';
import { AutoFetchPlanner } from './fetch-queue/auto-fetch';
import { FetchQueueWorker } from './fetch-queue/worker';
import { createLogger } from './logger';
import { deleteSmallEvents } from './repo/events';
import { reparseLists } from './repo/lists';
import { httpRulesClient } from './rules/client';
import { rulesDue, syncRules } from './repo/rules';
import { backfillPlayerUserIds } from './repo/player-accounts';
import { failInterruptedSyncRuns } from './repo/sync-runs';
import { serveWebApp } from './static';
import { SyncRunner } from './sync/runner';
import { adminWork, approvedMail, newUserMail } from './notify/admin-mail';
import { sendDigestIfDue } from './notify/digest';
import { smtpMailer } from './notify/mailer';
import { importWh40kElo, wh40kEloDue } from './repo/wh40k-elo';
import { httpWh40kEloClient } from './wh40k-elo/client';

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

// 39k.pro (Mathhammer's unit data and each faction's detachments): checked hourly, read again once a day.
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

// wh40k-elo's ratings: checked hourly, imported again once a day (a page every 2 seconds).
const wh40kElo = config.WH40K_ELO_ENABLED ? httpWh40kEloClient() : undefined;
let wh40kEloImporting = false;
const importWh40kEloIfDue = async () => {
  if (wh40kElo === undefined || wh40kEloImporting) return;
  wh40kEloImporting = true;
  try {
    if (await wh40kEloDue(database.db, new Date())) {
      const players = await importWh40kElo(
        database.db,
        wh40kElo,
        new Date(),
        () => new Promise((resolve) => setTimeout(resolve, 2000)),
      );
      logger.info({ players }, 'Imported wh40k-elo’s ratings');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Could not import wh40k-elo’s ratings; will try again');
  } finally {
    wh40kEloImporting = false;
  }
};
void importWh40kEloIfDue();
const wh40kEloTimer = setInterval(() => void importWh40kEloIfDue(), 60 * 60 * 1000);

// Email to the admins (someone new waiting for approval, the to-do every 3 days) and to those let in.
const mail = mailSettingsOf(config);
const mailer = mail === null ? null : smtpMailer(mail.smtp, logger.child({ module: 'email' }));
const siteUrl = siteUrlOf(config);
if (mail === null) logger.info('Email to admins is off (set SMTP_USER and SMTP_PASSWORD to send)');
const accessSettings = accessOptionsOf(config);
const access =
  accessSettings === undefined || mail === null || mailer === null
    ? accessSettings
    : {
        ...accessSettings,
        onNewUser: (email: string) => {
          mailer.send({ to: mail.to, ...newUserMail(email, siteUrl) }).catch((error: unknown) => {
            logger.warn({ err: error, email }, 'Could not email the admins about a new user');
          });
        },
        onApproved: (email: string) => {
          mailer.send({ to: [email], ...approvedMail(siteUrl) }).catch((error: unknown) => {
            logger.warn({ err: error, email }, 'Could not email someone they were approved');
          });
        },
      };
const sendDigest = async () => {
  if (mail === null || mailer === null) return;
  try {
    await sendDigestIfDue({
      db: database.db,
      mailer,
      to: mail.to,
      siteUrl,
      hour: config.DIGEST_HOUR,
      now: new Date(),
      work: () => adminWork(database.db, accessSettings !== undefined),
      logger,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Could not check the daily email');
  }
};
void sendDigest();
const digestTimer = setInterval(() => void sendDigest(), 15 * 60 * 1000);

const app = createApp({
  db: database.db,
  runner,
  fetchQueue,
  bcpStatus: status,
  logger,
  eventRule,
  allowedHosts: allowedHostsOf(config),
  autoFetch,
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
  clearInterval(rulesTimer);
  clearInterval(digestTimer);
  clearInterval(wh40kEloTimer);
  await autoFetch?.stop();
  // Let a list fetch in flight finish writing before the database closes.
  await fetchQueue.stop();
  await database.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
