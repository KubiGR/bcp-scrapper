import type { Db } from '../db/client';
import type { Logger } from '../logger';
import { getDigestSentOn, setDigestSentOn } from '../repo/app-settings';
import { digestMail, type AdminWork } from './admin-mail';
import type { Mailer } from './mailer';

/**
 * Sends the day's summary of the admins' work once a day, from `hour` (UTC) on, when there's
 * anything to do. The day it went is stored, so a restart doesn't send it again; a failed send is
 * tried again on the next call.
 */
export async function sendDigestIfDue(deps: {
  db: Db;
  mailer: Mailer;
  to: string[];
  siteUrl: string;
  hour: number;
  now: Date;
  work: () => Promise<AdminWork>;
  logger: Logger;
}): Promise<void> {
  const { db, mailer, to, siteUrl, hour, now, work, logger } = deps;
  const today = now.toISOString().slice(0, 10);
  if (now.getUTCHours() < hour) return;
  if ((await getDigestSentOn(db)) === today) return;
  const mail = digestMail(await work(), siteUrl);
  if (mail === null) return;
  try {
    await mailer.send({ to, ...mail });
    await setDigestSentOn(db, today);
  } catch (error) {
    logger.warn({ err: error }, 'Could not send the daily email; will try again');
  }
}
