import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { silentLogger } from '../test/helpers';
import type { AdminWork } from './admin-mail';
import { sendDigestIfDue } from './digest';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
});

const WORK: AdminWork = { waiting: ['ana@example.com'], unlinked: 2, outside: 0 };

function setup(work: AdminWork = WORK) {
  const send = vi.fn(() => Promise.resolve());
  const run = (iso: string) =>
    sendDigestIfDue({
      db,
      mailer: { send },
      to: ['boss@example.com'],
      siteUrl: 'https://logis.example.com',
      hour: 6,
      now: new Date(iso),
      work: () => Promise.resolve(work),
      logger: silentLogger,
    });
  return { send, run };
}

describe('sendDigestIfDue', () => {
  it('waits for the hour, then sends once a day', async () => {
    const { send, run } = setup();
    await run('2026-10-20T05:59:00Z');
    expect(send).not.toHaveBeenCalled();
    await run('2026-10-20T06:00:00Z');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['boss@example.com'],
        subject: expect.stringContaining('1 waiting'),
      }),
    );
    await run('2026-10-20T15:00:00Z');
    expect(send).toHaveBeenCalledTimes(1);
    await run('2026-10-21T06:30:00Z');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when there is nothing to do', async () => {
    const { send, run } = setup({ waiting: [], unlinked: 0, outside: 0 });
    await run('2026-10-20T07:00:00Z');
    expect(send).not.toHaveBeenCalled();
  });

  it('tries again later the same day when sending fails', async () => {
    const { send, run } = setup();
    send.mockRejectedValueOnce(new Error('SMTP down'));
    await run('2026-10-20T06:00:00Z');
    await run('2026-10-20T07:00:00Z');
    expect(send).toHaveBeenCalledTimes(2);
  });
});
