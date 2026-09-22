import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { bcpSession } from '../db/schema';
import type { BcpSession, BcpSessionStore } from './auth';

const SESSION_ROW_ID = 1;

export function createDbSessionStore(db: Db): BcpSessionStore {
  return {
    async load() {
      const [row] = await db.select().from(bcpSession).where(eq(bcpSession.id, SESSION_ROW_ID));
      if (!row) return null;
      const session: BcpSession = {
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        accessTokenExpiresAt: row.accessTokenExpiresAt,
        lastRefreshAt: row.lastRefreshAt,
        seedTokenHash: row.seedTokenHash,
      };
      return session;
    },
    async save(session) {
      const values = { ...session, updatedAt: new Date() };
      await db
        .insert(bcpSession)
        .values({ id: SESSION_ROW_ID, ...values })
        .onConflictDoUpdate({ target: bcpSession.id, set: values });
    },
  };
}
