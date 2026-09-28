import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BIG_EVENTS, EventListQuerySchema } from '@bcp/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { events } from '../db/schema';
import { ALL_EVENTS, sampleSource } from '../test/helpers';
import {
  deleteSmallEvents,
  findEvent,
  markEventSynced,
  searchEvents,
  upsertEventDetail,
  upsertEventSummaries,
} from './events';

let db: Db;
let close: () => Promise<void>;
const source = sampleSource();

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const range = { from: '2026-01-01', to: '2026-12-31' };
  const first = await source.listEvents(range, null);
  const second = await source.listEvents(range, first.nextCursor);
  await upsertEventSummaries(db, [...first.items, ...second.items]);
});

const query = (input: Record<string, string>) => EventListQuerySchema.parse(input);

describe('event upserts', () => {
  it('keeps detail-only fields when the catalogue is synced again', async () => {
    await upsertEventDetail(db, await source.getEvent('EVTTEAM0001'));
    await markEventSynced(db, 'EVTTEAM0001');
    await upsertEventSummaries(
      db,
      (await source.listEvents({ from: '2026-01-01', to: '2026-12-31' }, null)).items,
    );

    const row = await findEvent(db, 'EVTTEAM0001');
    expect(row?.city).toBe('Springfield');
    expect(row?.teamCount).toBe(4);
    expect(row?.rawDetail).not.toBeNull();
    expect(row?.rawSummary).not.toBeNull();
    expect(row?.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("fills city and team count from search results when detail hasn't set them", async () => {
    // beforeEach already synced the catalogue once (without detail); city/teamCount come from
    // the search fixture's totalTeamPlayers/city.
    const row = await findEvent(db, 'EVTTEAM0001');
    expect(row?.city).toBe('Springfield');
    expect(row?.teamCount).toBe(4);
  });

  it('fills a pre-existing row (city/teamCount still null) on the next catalogue sync', async () => {
    await db
      .update(events)
      .set({ city: null, teamCount: null })
      .where(eq(events.id, 'EVTTEAM0001'));
    expect((await findEvent(db, 'EVTTEAM0001'))?.city).toBeNull();

    await upsertEventSummaries(
      db,
      (await source.listEvents({ from: '2026-01-01', to: '2026-12-31' }, null)).items,
    );

    const row = await findEvent(db, 'EVTTEAM0001');
    expect(row?.city).toBe('Springfield');
    expect(row?.teamCount).toBe(4);
  });

  it("doesn't overwrite a detail-set city or team count with a later search result", async () => {
    await upsertEventDetail(db, await source.getEvent('EVTTEAM0001'));
    await db
      .update(events)
      .set({ city: 'Custom City', teamCount: 99 })
      .where(eq(events.id, 'EVTTEAM0001'));

    await upsertEventSummaries(
      db,
      (await source.listEvents({ from: '2026-01-01', to: '2026-12-31' }, null)).items,
    );

    const row = await findEvent(db, 'EVTTEAM0001');
    expect(row?.city).toBe('Custom City');
    expect(row?.teamCount).toBe(99);
  });
});

describe('searchEvents', () => {
  it('lists newest first with a total', async () => {
    const result = await searchEvents(db, query({}), ALL_EVENTS);
    expect(result.total).toBe(3);
    expect(result.items.map((e) => e.bcpId)).toEqual(['EVTSMALL001', 'EVTSINGLE01', 'EVTTEAM0001']);
  });

  it('filters by minimum players, type, name, country and date', async () => {
    const ids = async (input: Record<string, string>) =>
      (await searchEvents(db, query(input), ALL_EVENTS)).items.map((e) => e.bcpId);

    expect(await ids({ minPlayers: '40' })).toEqual(['EVTSINGLE01']);
    expect(await ids({ minPlayers: '1', maxPlayers: '10' })).toEqual(['EVTTEAM0001']);
    expect(await ids({ type: 'teams' })).toEqual(['EVTTEAM0001']);
    expect(await ids({ type: 'singles' })).toEqual(['EVTSMALL001', 'EVTSINGLE01']);
    expect(await ids({ q: 'team open' })).toEqual(['EVTTEAM0001']);
    expect(await ids({ country: 'germany' })).toEqual(['EVTSINGLE01']);
    expect(await ids({ from: '2026-04-01', to: '2026-04-10' })).toEqual(['EVTSINGLE01']);
  });

  it('sorts biggest first when asked', async () => {
    const result = await searchEvents(db, query({ sort: 'players' }), ALL_EVENTS);
    expect(result.items.map((e) => [e.bcpId, e.playerCount])).toEqual([
      ['EVTSINGLE01', 64],
      ['EVTTEAM0001', 8],
      ['EVTSMALL001', 0],
    ]);
  });

  it('sorts the other way when asked: smallest or oldest first', async () => {
    const ids = async (input: Record<string, string>) =>
      (await searchEvents(db, query(input), ALL_EVENTS)).items.map((e) => e.bcpId);
    expect(await ids({ sort: 'players', dir: 'asc' })).toEqual([
      'EVTSMALL001',
      'EVTTEAM0001',
      'EVTSINGLE01',
    ]);
    expect(await ids({ dir: 'asc' })).toEqual((await ids({})).reverse());
  });

  it('treats % and _ in the search text literally', async () => {
    expect((await searchEvents(db, query({ q: '%' }), ALL_EVENTS)).total).toBe(0);
  });

  it('paginates', async () => {
    const page2 = await searchEvents(db, query({ page: '2', pageSize: '2' }), ALL_EVENTS);
    expect(page2.items.map((e) => e.bcpId)).toEqual(['EVTTEAM0001']);
    expect(page2.total).toBe(3);
  });

  it('only shows big events for a rule that excludes small ones', async () => {
    // EVTSINGLE01 (64 players, 5 rounds) is the only fixture event meeting BIG_EVENTS.
    const result = await searchEvents(db, query({}), BIG_EVENTS);
    expect(result.items.map((e) => e.bcpId)).toEqual(['EVTSINGLE01']);
    expect(result.total).toBe(1);
  });
});

describe('deleteSmallEvents', () => {
  it('deletes every stored event that is not big, keeping the rest', async () => {
    // EVTSINGLE01 (64/5) is big; EVTSMALL001 (0/3) and EVTTEAM0001 (8/2) are small.
    const deleted = await deleteSmallEvents(db, BIG_EVENTS);
    expect(deleted).toBe(2);
    const remaining = (await searchEvents(db, query({}), ALL_EVENTS)).items.map((e) => e.bcpId);
    expect(remaining).toEqual(['EVTSINGLE01']);
  });

  it('deletes nothing for a rule that keeps everything', async () => {
    expect(await deleteSmallEvents(db, ALL_EVENTS)).toBe(0);
  });
});
