import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { getAutoFetchEnabled, setAutoFetchEnabled } from './app-settings';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

describe('auto-fetch setting', () => {
  it('is on until switched off, and remembers the switch', async () => {
    expect(await getAutoFetchEnabled(db)).toBe(true);
    await setAutoFetchEnabled(db, false);
    expect(await getAutoFetchEnabled(db)).toBe(false);
    await setAutoFetchEnabled(db, true);
    expect(await getAutoFetchEnabled(db)).toBe(true);
  });
});
