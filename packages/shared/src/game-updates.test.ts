import { describe, expect, it } from 'vitest';
import {
  effectiveUpdates,
  groupUpdates,
  isUpdateCommit,
  selectedUpdates,
  selectionRange,
  updateOfDay,
  updateSpans,
  type UpdateCommit,
  type UpdateEdits,
} from './game-updates';

const commit = (day: string, message: string, sha = `${day}-${message}`): UpdateCommit => ({
  sha,
  day,
  message,
});
const noEdits = new Map<string, UpdateEdits>();

describe('isUpdateCommit', () => {
  it('knows official update commits from fixes', () => {
    expect(isUpdateCommit('20260930 MFM and Faction Packs')).toBe(true);
    expect(isUpdateCommit('Aeldari Faction Pack updates')).toBe(true);
    expect(isUpdateCommit('Balance Dataslate Oct 2026')).toBe(true);
    expect(isUpdateCommit('Codex: Orks')).toBe(true);
    expect(isUpdateCommit('Transport fixes and author updates')).toBe(false);
    expect(isUpdateCommit('Gunwagon points fixes')).toBe(false);
  });
});

describe('groupUpdates', () => {
  it('groups update commits less than 7 days apart, ignoring other commits', () => {
    const updates = groupUpdates([
      commit('2026-06-09', 'Updated to Faction Pack'),
      commit('2026-06-12', 'Bug fixes'),
      commit('2026-06-15', 'MFM'), // 6 days after: same update
      commit('2026-06-22', 'Aeldari MFM updates'), // 7 days after: a new one
      commit('2026-09-30', '20260930 MFM and Faction Packs'),
    ]);
    expect(updates.map((u) => [u.start, u.lastCommit])).toEqual([
      ['2026-06-09', '2026-06-15'],
      ['2026-06-22', '2026-06-22'],
      ['2026-09-30', '2026-09-30'],
    ]);
    expect(updates[0]?.id).toBe('2026-06-09-Updated to Faction Pack');
  });

  it('names an update by month and what changed', () => {
    const [update] = groupUpdates([
      commit('2026-07-22', 'Codex: Orks release'),
      commit('2026-07-23', 'Orks MFM changes'),
      commit('2026-07-24', 'Balance Dataslate'),
      commit('2026-07-25', 'SM Faction Pack'),
    ]);
    expect(update?.name).toBe('Jul 2026 · MFM & Faction Packs & Dataslate & Codex: Orks');
  });
});

describe('effectiveUpdates and spans', () => {
  const auto = groupUpdates([
    commit('2026-06-09', 'MFM', 'a'),
    commit('2026-07-22', 'MFM', 'b'),
    commit('2026-08-29', 'MFM', 'c'),
    commit('2026-09-30', 'MFM', 'd'),
  ]);

  it('applies renames, start dates, merges and hides', () => {
    const edits = new Map<string, UpdateEdits>([
      ['a', { name: 'Edition launch', start: null, merged: false, hidden: false }],
      ['b', { name: null, start: '2026-07-25', merged: false, hidden: false }],
      ['c', { name: null, start: null, merged: true, hidden: false }],
      ['d', { name: null, start: null, merged: false, hidden: true }],
    ]);
    expect(effectiveUpdates(auto, edits)).toEqual([
      { id: 'a', name: 'Edition launch', start: '2026-06-09' },
      { id: 'b', name: 'Jul 2026 · MFM', start: '2026-07-25' },
    ]);
  });

  it('gives each update’s days, the newest to today', () => {
    const spans = updateSpans(effectiveUpdates(auto, noEdits), '2026-10-03');
    expect(spans.map((s) => [s.id, s.from, s.to])).toEqual([
      ['a', '2026-06-09', '2026-07-21'],
      ['b', '2026-07-22', '2026-08-28'],
      ['c', '2026-08-29', '2026-09-29'],
      ['d', '2026-09-30', '2026-10-03'],
    ]);
  });

  it('never gives a span ending before it starts', () => {
    const spans = updateSpans(effectiveUpdates(auto, noEdits), '2026-09-01');
    expect(spans.at(-1)).toMatchObject({ from: '2026-09-30', to: '2026-09-30' });
  });

  it('finds the update in force on a day', () => {
    const updates = effectiveUpdates(auto, noEdits);
    expect(updateOfDay(updates, '2026-07-21')?.id).toBe('a');
    expect(updateOfDay(updates, '2026-07-22')?.id).toBe('b');
    expect(updateOfDay(updates, '2026-06-01')).toBeNull();
  });

  it('turns picked updates into one range, filling gaps', () => {
    const spans = updateSpans(effectiveUpdates(auto, noEdits), '2026-10-03');
    expect(selectionRange(spans, ['d', 'a'])).toEqual({ from: '2026-06-09', to: '2026-10-03' });
    expect(selectionRange(spans, [])).toBeNull();
  });

  it('matches a range back to the run of updates it covers', () => {
    const spans = updateSpans(effectiveUpdates(auto, noEdits), '2026-10-03');
    expect(selectedUpdates(spans, '2026-06-09', '2026-10-03')).toEqual(['a', 'b', 'c', 'd']);
    expect(selectedUpdates(spans, '2026-07-22', '2026-08-28')).toEqual(['b']);
    expect(selectedUpdates(spans, '2026-07-23', '2026-08-28')).toEqual([]);
  });
});
