import { createHmac, randomBytes } from 'node:crypto';
import { and, eq, gt, lte, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { sessions, users } from '../db/schema';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** A session ends after this long unused… */
export const SESSION_IDLE_MS = 14 * DAY_MS;
/** …and after this long in any case. */
export const SESSION_ABSOLUTE_MS = 30 * DAY_MS;
/** Sliding the expiry writes to the database; at most once per this interval per session. */
const SLIDE_EVERY_MS = HOUR_MS;

export interface SessionUser {
  id: number;
  username: string;
  role: 'admin' | 'member';
  mustChangePassword: boolean;
  disabled: boolean;
  canPair: boolean;
  ignored: boolean;
}

/** The stored form of a session token: keyed with SESSION_SECRET, so a database leak alone is useless. */
export function hashToken(secret: string, token: string): string {
  return createHmac('sha256', secret).update(token).digest('base64url');
}

function expiryFrom(createdAt: Date, now: Date): Date {
  return new Date(
    Math.min(now.getTime() + SESSION_IDLE_MS, createdAt.getTime() + SESSION_ABSOLUTE_MS),
  );
}

/** Starts a session with a fresh random token; the token only ever lives in the cookie. */
export async function createSession(
  db: Db,
  secret: string,
  userId: number,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = expiryFrom(now, now);
  await db.insert(sessions).values({
    idHash: hashToken(secret, token),
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  });
  return { token, expiresAt };
}

/** The user behind a token, or null when it's unknown, expired or the user is disabled. */
export async function resolveSession(
  db: Db,
  secret: string,
  token: string,
  now: Date,
): Promise<{ user: SessionUser; tokenHash: string } | null> {
  const tokenHash = hashToken(secret, token);
  const [row] = await db
    .select({
      user: {
        id: users.id,
        username: users.username,
        role: users.role,
        mustChangePassword: users.mustChangePassword,
        disabled: users.disabled,
        canPair: users.canPair,
        ignored: users.ignored,
      },
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.idHash, tokenHash), gt(sessions.expiresAt, now)));
  if (row === undefined || row.user.disabled) return null;
  if (now.getTime() - row.lastSeenAt.getTime() >= SLIDE_EVERY_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: expiryFrom(row.createdAt, now) })
      .where(eq(sessions.idHash, tokenHash));
  }
  return { user: row.user, tokenHash };
}

export async function deleteSession(db: Db, secret: string, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.idHash, hashToken(secret, token)));
}

/** Ends every session of a user, except optionally the one making the request. */
export async function deleteUserSessions(db: Db, userId: number, keepHash?: string): Promise<void> {
  const own = eq(sessions.userId, userId);
  await db
    .delete(sessions)
    .where(keepHash === undefined ? own : and(own, ne(sessions.idHash, keepHash)));
}

/** Deletes sessions past their expiry (they no longer open anything, but would pile up). */
export async function purgeExpiredSessions(db: Db, now: Date): Promise<void> {
  await db.delete(sessions).where(lte(sessions.expiresAt, now));
}
