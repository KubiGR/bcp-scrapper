import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EventListQuerySchema } from '@bcp/shared';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { sampleSource } from '../test/helpers';
import {
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
});

describe('searchEvents', () => {
  it('lists newest first with a total', async () => {
    const result = await searchEvents(db, query({}));
    expect(result.total).toBe(3);
    expect(result.items.map((e) => e.bcpId)).toEqual(['EVTSMALL001', 'EVTSINGLE01', 'EVTTEAM0001']);
  });

  it('filters by minimum players, type, name, country and date', async () => {
    const ids = async (input: Record<string, string>) =>
      (await searchEvents(db, query(input))).items.map((e) => e.bcpId);

    expect(await ids({ minPlayers: '40' })).toEqual(['EVTSINGLE01']);
    expect(await ids({ minPlayers: '1', maxPlayers: '10' })).toEqual(['EVTTEAM0001']);
    expect(await ids({ type: 'teams' })).toEqual(['EVTTEAM0001']);
    expect(await ids({ type: 'singles' })).toEqual(['EVTSMALL001', 'EVTSINGLE01']);
    expect(await ids({ q: 'team open' })).toEqual(['EVTTEAM0001']);
    expect(await ids({ country: 'germany' })).toEqual(['EVTSINGLE01']);
    expect(await ids({ from: '2026-04-01', to: '2026-04-10' })).toEqual(['EVTSINGLE01']);
  });

  it('sorts biggest first when asked', async () => {
    const result = await searchEvents(db, query({ sort: 'players' }));
    expect(result.items.map((e) => [e.bcpId, e.playerCount])).toEqual([
      ['EVTSINGLE01', 64],
      ['EVTTEAM0001', 8],
      ['EVTSMALL001', 0],
    ]);
  });

  it('treats % and _ in the search text literally', async () => {
    expect((await searchEvents(db, query({ q: '%' }))).total).toBe(0);
  });

  it('paginates', async () => {
    const page2 = await searchEvents(db, query({ page: '2', pageSize: '2' }));
    expect(page2.items.map((e) => e.bcpId)).toEqual(['EVTTEAM0001']);
    expect(page2.total).toBe(3);
  });
});
