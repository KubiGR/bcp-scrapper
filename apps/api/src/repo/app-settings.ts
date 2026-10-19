import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { appSettings } from '../db/schema';

const AUTO_FETCH = 'autoFetch';

/** Whether automatic background fetching is on (it is until someone switches it off). */
export async function getAutoFetchEnabled(db: Db): Promise<boolean> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, AUTO_FETCH));
  return row === undefined ? true : row.value !== false;
}

export async function setAutoFetchEnabled(db: Db, enabled: boolean): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: AUTO_FETCH, value: enabled })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: enabled, updatedAt: new Date() },
    });
}

const DIGEST_SENT_ON = 'digestSentOn';

/** The day (YYYY-MM-DD, UTC) the admins' daily email last went; null before the first. */
export async function getDigestSentOn(db: Db): Promise<string | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, DIGEST_SENT_ON));
  return typeof row?.value === 'string' ? row.value : null;
}

export async function setDigestSentOn(db: Db, day: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: DIGEST_SENT_ON, value: day })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: day, updatedAt: new Date() } });
}
