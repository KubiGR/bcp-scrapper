import { describe, expect, it } from 'vitest';
import { createDb, PGLITE_MEMORY_URL } from './client';
import { events } from './schema';

describe('createDb', () => {
  it('runs an in-memory Postgres for pglite://memory', async () => {
    const database = createDb(PGLITE_MEMORY_URL);
    await database.migrate();
    await database.db.insert(events).values({
      id: 'E1',
      name: 'In memory',
      startDate: new Date('2026-01-01T00:00:00Z'),
      playerCount: 1,
      isTeamEvent: false,
      isOnline: false,
      roundCount: 1,
      ended: true,
      hideLists: false,
    });
    expect(await database.db.$count(events)).toBe(1);
    await database.close();
  });
});
