import { addDays } from '@bcp/shared';
import type { Db } from '../db/client';
import type { Logger } from '../logger';
import { getDigestSentOn, setDigestSentOn } from '../repo/app-settings';
import { digestMail, type AdminWork } from './admin-mail';
import type { Mailer } from './mailer';

/** Days between summaries: at most one every 3 days. */
export const DIGEST_EVERY_DAYS = 3;

/**
 * Sends a summary of the admins' work at most every DIGEST_EVERY_DAYS days, from `hour` (UTC) on,
 * when there's anything to do. The day it went is stored, so a restart doesn't send it again; a
 * failed send is tried again on the next call.
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
  const sentOn = await getDigestSentOn(db);
  if (sentOn !== null && today < addDays(sentOn, DIGEST_EVERY_DAYS)) return;
  const mail = digestMail(await work(), siteUrl);
  if (mail === null) return;
  try {
    await mailer.send({ to, ...mail });
    await setDigestSentOn(db, today);
  } catch (error) {
    logger.warn({ err: error }, 'Could not send the summary email; will try again');
  }
}
