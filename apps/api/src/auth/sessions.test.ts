import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { sessions, users } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  resolveSession,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
} from './sessions';

const SECRET = 's'.repeat(32);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = new Date('2026-09-01T10:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

let db: Db;
let close: () => Promise<void>;
let userId: number;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const [row] = await db
    .insert(users)
    .values({ username: 'ana', passwordHash: 'x', role: 'member' })
    .returning();
  if (row === undefined) throw new Error('no user');
  userId = row.id;
});

describe('sessions', () => {
  it('uses 14 idle days and 30 absolute days', () => {
    expect(SESSION_IDLE_MS).toBe(14 * DAY);
    expect(SESSION_ABSOLUTE_MS).toBe(30 * DAY);
  });

  it('creates a random token, stores only its hash, and resolves it to the user', async () => {
    const { token, expiresAt } = await createSession(db, SECRET, userId, T0);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(expiresAt).toEqual(at(14 * DAY));
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.idHash).not.toContain(token);
    const resolved = await resolveSession(db, SECRET, token, at(HOUR));
    expect(resolved?.user).toMatchObject({ id: userId, username: 'ana', role: 'member' });
  });

  it('gives every login a new token', async () => {
    const a = await createSession(db, SECRET, userId, T0);
    const b = await createSession(db, SECRET, userId, T0);
    expect(a.token).not.toBe(b.token);
  });

  it('rejects unknown tokens and tokens hashed with another secret', async () => {
    const { token } = await createSession(db, SECRET, userId, T0);
    expect(await resolveSession(db, SECRET, 'nope', T0)).toBeNull();
    expect(await resolveSession(db, 't'.repeat(32), token, T0)).toBeNull();
  });

  it('expires after 14 idle days, and use slides the expiry', async () => {
    const idle = await createSession(db, SECRET, userId, T0);
    expect(await resolveSession(db, SECRET, idle.token, at(14 * DAY + 1))).toBeNull();

    const used = await createSession(db, SECRET, userId, T0);
    expect(await resolveSession(db, SECRET, used.token, at(10 * DAY))).not.toBeNull();
    expect(await resolveSession(db, SECRET, used.token, at(20 * DAY))).not.toBeNull();
  });

  it('ends after 30 days however often it is used', async () => {
    const { token } = await createSession(db, SECRET, userId, T0);
    for (const day of [7, 14, 21, 28]) {
      expect(await resolveSession(db, SECRET, token, at(day * DAY)), `day ${day}`).not.toBeNull();
    }
    expect(await resolveSession(db, SECRET, token, at(30 * DAY + 1))).toBeNull();
  });

  it('rejects sessions of a disabled user', async () => {
    const { token } = await createSession(db, SECRET, userId, T0);
    await db.update(users).set({ disabled: true }).where(eq(users.id, userId));
    expect(await resolveSession(db, SECRET, token, T0)).toBeNull();
  });

  it('logout deletes the session; deleteUserSessions ends all of a user’s sessions', async () => {
    const a = await createSession(db, SECRET, userId, T0);
    const b = await createSession(db, SECRET, userId, T0);
    const c = await createSession(db, SECRET, userId, T0);
    await deleteSession(db, SECRET, a.token);
    expect(await resolveSession(db, SECRET, a.token, T0)).toBeNull();
    expect(await resolveSession(db, SECRET, b.token, T0)).not.toBeNull();
    await deleteUserSessions(db, userId);
    expect(await resolveSession(db, SECRET, b.token, T0)).toBeNull();
    expect(await resolveSession(db, SECRET, c.token, T0)).toBeNull();
  });
});
