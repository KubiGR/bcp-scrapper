import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { detachmentNames } from '../repo/detachment-links';
import type { Mail } from './mailer';

/** What waits for an admin: people to approve, detachment names to link, pairs to settle. */
export interface AdminWork {
  /** Emails of those waiting for approval (the ignored left out). */
  waiting: string[];
  unlinked: number;
  outside: number;
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/**
 * The admin's work, as the to-do badge counts it. People wait for approval only when Cloudflare
 * Access signs them in (`approving`); otherwise a disabled account is just disabled.
 */
export async function adminWork(db: Db, approving: boolean): Promise<AdminWork> {
  const [waiting, names] = await Promise.all([
    approving
      ? db
          .select({ username: users.username })
          .from(users)
          .where(and(eq(users.disabled, true), eq(users.ignored, false)))
          .orderBy(users.username)
      : Promise.resolve([]),
    detachmentNames(db),
  ]);
  return {
    waiting: waiting.map((row) => row.username),
    unlinked: names.unsure.length,
    outside: names.wrong.length,
  };
}

/** Someone new waits to be let in. */
export function newUserMail(email: string, siteUrl: string): Mail {
  return {
    subject: `Logis: ${email} is waiting for approval`,
    text: [
      `${email} signed in to Logis and is waiting for approval.`,
      '',
      `Approve or ignore them: ${siteUrl}/settings?tab=users`,
    ].join('\n'),
  };
}

/** To someone an admin just let in. */
export function approvedMail(siteUrl: string): Mail {
  return {
    subject: 'You’re in: Logis is open to you',
    text: ['An admin approved you, so Logis is open to you now.', '', `Open it: ${siteUrl}`].join(
      '\n',
    ),
  };
}

/** The day's summary of what's left to do; null when there's nothing. */
export function digestMail(work: AdminWork, siteUrl: string): Mail | null {
  const parts: string[] = [];
  const sections: string[] = [];
  if (work.waiting.length > 0) {
    parts.push(plural(work.waiting.length, 'waiting for approval', 'waiting for approval'));
    sections.push(
      [
        `Waiting for approval (${String(work.waiting.length)}):`,
        ...work.waiting.map((email) => `- ${email}`),
        `${siteUrl}/settings?tab=users`,
      ].join('\n'),
    );
  }
  if (work.unlinked > 0) {
    const what = plural(work.unlinked, 'detachment name to link', 'detachment names to link');
    parts.push(what);
    sections.push(`${what}:\n${siteUrl}/settings?tab=detachments`);
  }
  if (work.outside > 0) {
    const what = plural(
      work.outside,
      'detachment outside its faction',
      'detachments outside their faction',
    );
    parts.push(what);
    sections.push(`${what}:\n${siteUrl}/settings?tab=detachments&faction=all&focus=outside`);
  }
  if (parts.length === 0) return null;
  return {
    subject: `Logis: ${parts.join(', ')}`,
    text: ['Still to do on Logis:', '', sections.join('\n\n')].join('\n'),
  };
}
