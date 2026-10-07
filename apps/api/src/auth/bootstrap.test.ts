import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { silentLogger } from '../test/helpers';
import { ensureAdmin } from './bootstrap';
import { verifyPassword } from './passwords';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

describe('ensureAdmin', () => {
  it('creates the first admin while there are no users', async () => {
    await ensureAdmin(
      db,
      loadConfig({ ADMIN_USERNAME: 'kubi', ADMIN_PASSWORD: 'first password 1' }),
      silentLogger,
    );
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ username: 'kubi', role: 'admin', mustChangePassword: false });
    expect(await verifyPassword('first password 1', rows[0]?.passwordHash ?? '')).toBe(true);
  });

  it('creates no password admin when Cloudflare Access does the login', async () => {
    await ensureAdmin(
      db,
      loadConfig({
        ADMIN_USERNAME: 'kubi',
        ADMIN_PASSWORD: 'first password 1',
        ACCESS_TEAM_DOMAIN: 'myteam.cloudflareaccess.com',
        ACCESS_AUD: 'abc',
      }),
      silentLogger,
    );
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('ignores the variables once users exist', async () => {
    await ensureAdmin(
      db,
      loadConfig({ ADMIN_USERNAME: 'kubi', ADMIN_PASSWORD: 'first password 1' }),
      silentLogger,
    );
    await ensureAdmin(
      db,
      loadConfig({ ADMIN_USERNAME: 'other', ADMIN_PASSWORD: 'other password 1' }),
      silentLogger,
    );
    expect((await db.select().from(users)).map((u) => u.username)).toEqual(['kubi']);
  });

  it('does nothing without both variables', async () => {
    await ensureAdmin(db, loadConfig({ ADMIN_USERNAME: 'kubi' }), silentLogger);
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('refuses a first password shorter than 12 characters', async () => {
    await expect(
      ensureAdmin(
        db,
        loadConfig({ ADMIN_USERNAME: 'kubi', ADMIN_PASSWORD: 'short' }),
        silentLogger,
      ),
    ).rejects.toThrow('ADMIN_PASSWORD must be at least 12 characters');
  });
});
