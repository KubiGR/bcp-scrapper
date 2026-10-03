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

  it('keeps the same id whatever order same-day commits come in', () => {
    const one = groupUpdates([
      commit('2026-06-09', 'MFM', 'zz'),
      commit('2026-06-09', 'MFM', 'aa'),
    ]);
    const other = groupUpdates([
      commit('2026-06-09', 'MFM', 'aa'),
      commit('2026-06-09', 'MFM', 'zz'),
    ]);
    expect(one[0]?.id).toBe('aa');
    expect(other[0]?.id).toBe('aa');
  });
});

describe('update names', () => {
  /** The edition's first update, so the ones under test aren't "Edition launch". */
  const launch = commit('2026-01-05', 'MFM', 'launch');
  const nameOf = (...commits: UpdateCommit[]) => groupUpdates([launch, ...commits])[1];

  it('calls the edition’s first update its launch', () => {
    expect(groupUpdates([launch])[0]?.name).toBe('Edition launch');
  });

  it('names a codex release', () => {
    expect(
      nameOf(commit('2026-07-22', 'Codex: Orks release'), commit('2026-07-23', 'MFM'))?.name,
    ).toBe('Codex: Orks');
    expect(
      nameOf(commit('2026-07-22', 'Codex: Orks'), commit('2026-07-23', 'Codex Tyranids'))?.name,
    ).toBe('Codexes: Orks & Tyranids');
  });

  it('uses an official version the commits name', () => {
    expect(
      nameOf(
        commit('2026-09-30', 'MFM and Faction Packs'),
        commit('2026-09-30', 'MFM 1.5 readme update'),
      )?.name,
    ).toBe('MFM 1.5');
  });

  it('names a faction that most of the update is about', () => {
    expect(
      nameOf(
        commit('2026-07-22', 'Orks Faction Pack updates'),
        commit('2026-07-23', 'Orks MFM changes'),
        commit('2026-07-24', 'AM MFM changes'),
      )?.name,
    ).toBe('Orks shake-up');
  });

  it('otherwise names it by season and what most commits changed', () => {
    expect(
      nameOf(
        commit('2026-07-22', 'AM Faction Pack changes'),
        commit('2026-07-22', 'Aeldari Faction Pack changes'),
        commit('2026-07-23', 'Tau MFM changes'),
      )?.name,
    ).toBe('Summer 2026 Faction Packs');
    expect(
      nameOf(
        commit('2026-08-29', 'MFM'),
        commit('2026-08-30', 'GK MFM'),
        commit('2026-08-30', 'AM Faction Pack'),
      )?.name,
    ).toBe('Late Summer 2026 points');
  });

  it('never gives two updates the same name', () => {
    const updates = groupUpdates([
      launch,
      commit('2026-07-01', 'MFM'),
      commit('2026-07-20', 'MFM'),
    ]);
    expect(updates.map((u) => u.name)).toEqual([
      'Edition launch',
      'Summer 2026 points',
      'Summer 2026 points II',
    ]);
  });

  it('sums up the factions it touched, most first', () => {
    const update = nameOf(
      commit('2026-07-22', 'AM Faction Pack changes'),
      commit('2026-07-23', 'AM MFM changes'),
      commit('2026-07-23', 'GK MFM changes'),
      commit('2026-07-24', 'GSC MFM changes'),
      commit('2026-07-24', 'IK MFM changes'),
      commit('2026-07-24', 'Drukhari MFM changes'),
      commit('2026-07-24', 'Necrons MFM changes'),
      commit('2026-07-25', 'Orks MFM changes'),
    );
    expect(update?.summary).toBe(
      'Astra Militarum, Drukhari, Genestealer Cult, Grey Knights, Imperial Knights, Necrons +1 more',
    );
    expect(nameOf(commit('2026-07-22', 'MFM'))?.summary).toBe('');
  });

  it('offers other names to pick from', () => {
    const update = nameOf(
      commit('2026-07-22', 'Orks Faction Pack updates'),
      commit('2026-07-23', 'Orks MFM changes'),
    );
    expect(update?.suggestions).toEqual(
      expect.arrayContaining(['Orks shake-up', 'Summer 2026 Faction Packs', 'Update 2 · Jul 2026']),
    );
    expect(new Set(update?.suggestions).size).toBe(update?.suggestions.length);
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
      { id: 'b', name: 'Summer 2026 points', start: '2026-07-25' },
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
