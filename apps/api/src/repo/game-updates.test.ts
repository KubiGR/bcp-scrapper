import type { UpdateCommit } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BsdataClient } from '../bsdata/client';
import type { Db } from '../db/client';
import { events } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { editGameUpdate, listGameUpdates, syncUpdateCommits } from './game-updates';

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

/**
 * A client whose history is `listed` in GitHub's order, read in pages of 2 until a page holds
 * only stored commits; records how many pages it read.
 */
const fakeClient = (listed: UpdateCommit[], failAfter?: number) => {
  const read = { pages: 0 };
  const client: BsdataClient = {
    tree: () => Promise.resolve({ commit: 'c', files: [] }),
    file: () => Promise.resolve({}),
    async commits(isStored) {
      if (failAfter !== undefined) throw new Error('GitHub answered 500');
      const found: UpdateCommit[] = [];
      for (let i = 0; i < listed.length; i += 2) {
        read.pages += 1;
        const page = listed.slice(i, i + 2);
        if (page.every((c) => isStored(c.sha))) break;
        found.push(...page.filter((c) => !isStored(c.sha)));
      }
      return Promise.resolve(found);
    },
  };
  return { client, read };
};

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
  it('reads the history once, then only new commits', async () => {
    expect(await syncUpdateCommits(db, fakeClient(history).client)).toBe(4);
    const later = fakeClient([commit('e', '2026-10-02', 'Codex: Orks'), ...history]);
    expect(await syncUpdateCommits(db, later.client)).toBe(1);
    // Page 1 (e, d) had a new commit; page 2 (fix, b) held only stored ones: stop.
    expect(later.read.pages).toBe(2);
  });

  it('finds new commits listed below stored ones (merged later on GitHub)', async () => {
    await syncUpdateCommits(db, fakeClient(history).client);
    // A pull request's commit p, merged after d, is listed below d.
    const merged = fakeClient([
      commit('m', '2026-10-03', 'Merge pull request'),
      commit('d', '2026-09-30'),
      commit('p', '2026-09-28', 'Faction Pack fix'),
      ...history.slice(1),
    ]);
    expect(await syncUpdateCommits(db, merged.client)).toBe(2);
  });

  it('keeps what it read when the history can’t be read', async () => {
    await syncUpdateCommits(db, fakeClient(history).client);
    await expect(syncUpdateCommits(db, fakeClient([], 0).client)).rejects.toThrow('500');
    expect((await listGameUpdates(db, TODAY)).updates).toHaveLength(3);
  });

  it('lists updates newest first with their events', async () => {
    await syncUpdateCommits(db, fakeClient(history).client);
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

  it('keeps edits as new commits arrive, and counts merged days in the update before', async () => {
    await syncUpdateCommits(db, fakeClient(history).client);
    await event('E2', '2026-07-30');
    expect(await editGameUpdate(db, 'a', { name: 'Big launch' }, TODAY)).toBe('ok');
    expect(await editGameUpdate(db, 'b', { merged: true }, TODAY)).toBe('ok');
    await syncUpdateCommits(db, fakeClient([commit('e', '2026-10-02'), ...history]).client);
    const { updates } = await listGameUpdates(db, TODAY);
    expect(updates.find((u) => u.id === 'a')).toMatchObject({ name: 'Big launch', events: 1 });
    expect(updates.find((u) => u.id === 'b')).toMatchObject({ merged: true, events: 0 });
  });

  it('never lets updates overlap, whatever the edit', async () => {
    await syncUpdateCommits(db, fakeClient(history).client);
    // Hide b, move d onto b's start, then try to show b again.
    expect(await editGameUpdate(db, 'b', { hidden: true }, TODAY)).toBe('ok');
    expect(await editGameUpdate(db, 'd', { start: '2026-07-22' }, TODAY)).toBe('ok');
    expect(await editGameUpdate(db, 'b', { hidden: false }, TODAY)).toBe('out-of-order');
  });

  it('judges a new start against the other updates’ edited starts', async () => {
    await syncUpdateCommits(db, fakeClient(history).client);
    expect(await editGameUpdate(db, 'b', { start: '2026-07-28' }, TODAY)).toBe('ok');
    expect(await editGameUpdate(db, 'a', { start: '2026-07-25' }, TODAY)).toBe('ok');
    expect(await editGameUpdate(db, 'b', { start: '2026-07-30' }, TODAY)).toBe('ok');
    expect(await editGameUpdate(db, 'b', { start: '2026-07-01' }, TODAY)).toBe('out-of-order');
  });

  it('moves a start date, and refuses one out of order or an unknown update', async () => {
    await syncUpdateCommits(db, fakeClient(history).client);
    expect(await editGameUpdate(db, 'b', { start: '2026-07-25' }, TODAY)).toBe('ok');
    expect((await listGameUpdates(db, TODAY)).updates[1]).toMatchObject({
      start: '2026-07-25',
      autoStart: '2026-07-22',
    });
    expect(await editGameUpdate(db, 'b', { start: '2026-06-01' }, TODAY)).toBe('out-of-order');
    expect(await editGameUpdate(db, 'b', { start: '2026-10-01' }, TODAY)).toBe('out-of-order');
    expect(await editGameUpdate(db, 'nope', { name: 'x' }, TODAY)).toBe('not-found');
  });
});
