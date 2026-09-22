import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './client';
import { events, syncRuns, teams } from './schema';
import { createTestDb, resetDb } from './test-db';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

const anEvent = {
  id: 'EVT1',
  name: 'Test Event',
  startDate: new Date('2026-03-28T09:00:00Z'),
  playerCount: 8,
  isTeamEvent: true,
  isOnline: false,
  roundCount: 2,
  ended: true,
  hideLists: false,
};

describe('database schema', () => {
  it('deletes an event’s teams when the event is deleted', async () => {
    await db.insert(events).values(anEvent);
    await db
      .insert(teams)
      .values({ id: 'T1', eventId: 'EVT1', name: 'A', roundPoints: [], raw: {} });

    await db.delete(events).where(eq(events.id, 'EVT1'));

    expect(await db.select().from(teams)).toEqual([]);
  });

  it('allows only one active sync run per kind and event', async () => {
    const run = { kind: 'lists' as const, eventId: 'EVT1', params: {}, status: 'running' as const };
    await db.insert(syncRuns).values(run);

    const duplicate = await db.insert(syncRuns).values(run).onConflictDoNothing().returning();
    expect(duplicate).toEqual([]);

    const finished = await db
      .insert(syncRuns)
      .values({ ...run, status: 'succeeded' })
      .returning();
    expect(finished).toHaveLength(1);
  });
});
