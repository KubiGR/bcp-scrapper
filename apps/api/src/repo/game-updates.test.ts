import type { UpdateCommit } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { bsdataCommits, events } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import {
  addGameUpdate,
  deleteGameUpdate,
  editGameUpdate,
  listGameUpdates,
  rangeOrCurrentUpdate,
} from './game-updates';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
});

const TODAY = '2026-10-03';
const commit = (sha: string, day: string, message = 'MFM'): UpdateCommit => ({ sha, day, message });

/** BSData's history as stored before its takedown. */
const seed = (commits: UpdateCommit[]) => db.insert(bsdataCommits).values(commits);

const history = [
  commit('d', '2026-09-30'),
  commit('fix', '2026-09-05', 'Gunwagon fixes'),
  commit('b', '2026-07-22'),
  commit('a', '2026-06-09'),
];

const event = (id: string, day: string) =>
  db.insert(events).values({
    id,
    name: id,
    startDate: new Date(`${day}T09:00:00Z`),
    playerCount: 40,
    isTeamEvent: false,
    isOnline: false,
    roundCount: 5,
    ended: true,
    hideLists: false,
  });

describe('game updates', () => {
  it('lists updates newest first with their events', async () => {
    await seed(history);
    await event('E1', '2026-06-20');
    await event('E2', '2026-07-30');
    await event('E3', '2026-08-02');
    const { updates } = await listGameUpdates(db, TODAY);
    expect(updates.map((u) => [u.id, u.start, u.events])).toEqual([
      ['d', '2026-09-30', 0],
      ['b', '2026-07-22', 2],
      ['a', '2026-06-09', 1],
    ]);
    expect(updates[1]).toMatchObject({
      name: 'Summer 2026 points',
      autoName: 'Summer 2026 points',
      autoStart: '2026-07-22',
      merged: false,
      hidden: false,
    });
  });

  it('starts a range without a start at the update in force on its end', async () => {
    await seed(history);
    const today = new Date('2026-10-03T12:00:00Z');
    expect(await rangeOrCurrentUpdate(db, {}, today)).toEqual({
      from: '2026-09-30',
      to: '2026-10-03',
    });
    expect(await rangeOrCurrentUpdate(db, { to: '2026-08-01' }, today)).toEqual({
      from: '2026-07-22',
      to: '2026-08-01',
    });
    expect(await rangeOrCurrentUpdate(db, { from: '2026-01-01' }, today)).toEqual({
      from: '2026-01-01',
      to: '2026-10-03',
    });
  });

  it('keeps edits as new updates arrive, and counts merged days in the update before', async () => {
    await seed(history);
    await event('E2', '2026-07-30');
    expect(await editGameUpdate(db, 'a', { name: 'Big launch' })).toBe('ok');
    expect(await editGameUpdate(db, 'b', { merged: true })).toBe('ok');
    await seed([commit('e', '2026-10-02')]);
    const { updates } = await listGameUpdates(db, TODAY);
    expect(updates.find((u) => u.id === 'a')).toMatchObject({ name: 'Big launch', events: 1 });
    expect(updates.find((u) => u.id === 'b')).toMatchObject({ merged: true, events: 0 });
  });

  it('never lets updates overlap, whatever the edit', async () => {
    await seed(history);
    // Hide b, move d onto b's start, then try to show b again.
    expect(await editGameUpdate(db, 'b', { hidden: true })).toBe('ok');
    expect(await editGameUpdate(db, 'd', { start: '2026-07-22' })).toBe('ok');
    expect(await editGameUpdate(db, 'b', { hidden: false })).toBe('out-of-order');
  });

  it('judges a new start against the other updates’ edited starts', async () => {
    await seed(history);
    expect(await editGameUpdate(db, 'b', { start: '2026-07-28' })).toBe('ok');
    expect(await editGameUpdate(db, 'a', { start: '2026-07-25' })).toBe('ok');
    expect(await editGameUpdate(db, 'b', { start: '2026-07-30' })).toBe('ok');
    expect(await editGameUpdate(db, 'b', { start: '2026-07-01' })).toBe('out-of-order');
  });

  it('moves a start date, and refuses one out of order or an unknown update', async () => {
    await seed(history);
    expect(await editGameUpdate(db, 'b', { start: '2026-07-25' })).toBe('ok');
    expect((await listGameUpdates(db, TODAY)).updates[1]).toMatchObject({
      start: '2026-07-25',
      autoStart: '2026-07-22',
    });
    expect(await editGameUpdate(db, 'b', { start: '2026-06-01' })).toBe('out-of-order');
    expect(await editGameUpdate(db, 'b', { start: '2026-10-01' })).toBe('out-of-order');
    expect(await editGameUpdate(db, 'nope', { name: 'x' })).toBe('not-found');
  });

  it('adds an update by hand among BSData’s, and its events count under it', async () => {
    await seed(history);
    await event('E1', '2026-10-20');
    expect(await addGameUpdate(db, { name: 'Balance Dataslate', start: '2026-10-15' })).toBe('ok');
    const { updates } = await listGameUpdates(db, '2026-11-14');
    expect(updates[0]).toMatchObject({
      name: 'Balance Dataslate',
      autoName: 'Balance Dataslate',
      start: '2026-10-15',
      added: true,
      events: 1,
      summary: '',
    });
    expect(updates.slice(1).every((u) => !u.added)).toBe(true);
    // It is now the update in force.
    expect(await rangeOrCurrentUpdate(db, {}, new Date('2026-11-14T12:00:00Z'))).toEqual({
      from: '2026-10-15',
      to: '2026-11-14',
    });
  });

  it('refuses an added update on the day another starts', async () => {
    await seed(history);
    expect(await addGameUpdate(db, { name: 'Clash', start: '2026-09-30' })).toBe('out-of-order');
    // Between two of BSData's is fine.
    expect(await addGameUpdate(db, { name: 'Midsummer', start: '2026-08-15' })).toBe('ok');
    expect((await listGameUpdates(db, TODAY)).updates.map((u) => u.start)).toEqual([
      '2026-09-30',
      '2026-08-15',
      '2026-07-22',
      '2026-06-09',
    ]);
  });

  it('edits an added update like any other, and deletes only added ones', async () => {
    await seed(history);
    await addGameUpdate(db, { name: 'Dataslate', start: '2026-10-15' });
    const [added] = (await listGameUpdates(db, TODAY)).updates;
    if (added === undefined) throw new Error('no update');
    expect(await editGameUpdate(db, added.id, { name: 'Dataslate Nov' })).toBe('ok');
    expect((await listGameUpdates(db, TODAY)).updates[0]).toMatchObject({
      name: 'Dataslate Nov',
      autoName: 'Dataslate',
    });
    expect(await deleteGameUpdate(db, 'd')).toBe('not-found');
    expect(await deleteGameUpdate(db, added.id)).toBe('ok');
    expect((await listGameUpdates(db, TODAY)).updates.map((u) => u.id)).toEqual(['d', 'b', 'a']);
  });
});
