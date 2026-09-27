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
