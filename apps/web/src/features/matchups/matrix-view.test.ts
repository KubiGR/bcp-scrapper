import type { MatrixCell } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import {
  cellView,
  DEFAULT_MATRIX_SETTINGS,
  matrixParams,
  rowSummary,
  type MatrixSettings,
} from './matrix-view';

const cell = (overrides: Partial<MatrixCell> = {}): MatrixCell => ({
  row: 'Orks',
  col: 'Necrons',
  games: 13,
  wins: 8,
  draws: 0,
  losses: 5,
  winRate: 8 / 13,
  avgPoints: 12.4,
  ...overrides,
});

// Cells here have about a dozen games: judged at 3, so they show (the default hatches under 25).
const settings = (overrides: Partial<MatrixSettings> = {}): MatrixSettings => ({
  ...DEFAULT_MATRIX_SETTINGS,
  minGames: 3,
  ...overrides,
});

describe('DEFAULT_MATRIX_SETTINGS', () => {
  it('defaults to win rate, min 25 games, no disposition, row side, every faction', () => {
    expect(DEFAULT_MATRIX_SETTINGS).toEqual({
      metric: 'winRate',
      minGames: 25,
      dispositions: [],
      detachments: [],
      side: 'row',
      factions: [],
    });
  });
});

describe('matrixParams', () => {
  it('sends nothing when no disposition is chosen', () => {
    expect(matrixParams(settings())).toEqual({});
  });

  it('sends disposition and side once a disposition is chosen', () => {
    expect(matrixParams(settings({ dispositions: ['Take and Hold'], side: 'both' }))).toEqual({
      dispositions: 'Take and Hold',
      side: 'both',
    });
  });

  it('never sends metric or minGames', () => {
    const params = matrixParams(settings({ metric: 'points', minGames: 10 }));
    expect(params).not.toHaveProperty('metric');
    expect(params).not.toHaveProperty('minGames');
  });
});

describe('cellView', () => {
  it('greys a cell under minGames, still showing its value', () => {
    const view = cellView(
      cell({ games: 2, wins: 1, draws: 0, losses: 1, winRate: 0.5 }),
      settings({ minGames: 3 }),
      null,
    );
    expect(view).toEqual({ text: '50%', value: '50%', tone: 'hidden', games: 2, strength: 0 });
  });

  it('shows only the count of games played on the mirror diagonal', () => {
    const view = cellView(
      cell({ row: 'Orks', col: 'Orks', games: 3, winRate: null }),
      settings(),
      null,
    );
    expect(view).toEqual({ text: '3', value: '3', tone: 'mirror', games: 3, strength: 0 });
  });

  it('greys a mirror cell under minGames, still showing its games', () => {
    const view = cellView(
      cell({ row: 'Orks', col: 'Orks', games: 2, winRate: null }),
      settings({ minGames: 3 }),
      null,
    );
    expect(view).toEqual({ text: '2', value: '2', tone: 'hidden', games: 2, strength: 0 });
  });

  it('renders a win rate above the good threshold as good, with no game count in the text', () => {
    const view = cellView(cell({ games: 13, winRate: 0.62 }), settings(), null);
    expect(view.text).toBe('62%');
    expect(view.value).toBe('62%');
    expect(view.tone).toBe('good');
    expect(view.games).toBe(13);
  });

  it('treats exactly 55% as good', () => {
    const view = cellView(cell({ games: 13, winRate: 0.55 }), settings(), null);
    expect(view.tone).toBe('good');
  });

  it('treats exactly 45% as bad', () => {
    const view = cellView(cell({ games: 13, winRate: 0.45 }), settings(), null);
    expect(view.tone).toBe('bad');
  });

  it('renders a win rate below the bad threshold as bad', () => {
    const view = cellView(cell({ games: 13, winRate: 0.3 }), settings(), null);
    expect(view.text).toBe('30%');
    expect(view.value).toBe('30%');
    expect(view.tone).toBe('bad');
    expect(view.games).toBe(13);
  });

  it('renders a win rate in the middle as even', () => {
    const view = cellView(cell({ games: 13, winRate: 0.5 }), settings(), null);
    expect(view.text).toBe('50%');
    expect(view.value).toBe('50%');
    expect(view.tone).toBe('even');
    expect(view.games).toBe(13);
  });

  it('renders game points when the metric is points and a scale is known', () => {
    const view = cellView(cell({ games: 13, avgPoints: 12.4 }), settings({ metric: 'points' }), 20);
    expect(view.text).toBe('12.4');
    expect(view.value).toBe('12.4');
    expect(view.tone).toBe('good');
    expect(view.games).toBe(13);
  });

  it('uses the scale midpoint for points tones (good at 1.1x, bad at 0.9x)', () => {
    const good = cellView(cell({ games: 13, avgPoints: 11 }), settings({ metric: 'points' }), 20);
    expect(good.tone).toBe('good');
    const bad = cellView(cell({ games: 13, avgPoints: 9 }), settings({ metric: 'points' }), 20);
    expect(bad.tone).toBe('bad');
    const even = cellView(cell({ games: 13, avgPoints: 10 }), settings({ metric: 'points' }), 20);
    expect(even.tone).toBe('even');
  });

  it('shows a dash for a null avgPoints under the points metric', () => {
    const view = cellView(cell({ games: 13, avgPoints: null }), settings({ metric: 'points' }), 20);
    expect(view.text).toBe('–');
    expect(view.value).toBe('–');
    expect(view.tone).toBe('even');
    expect(view.games).toBe(13);
    expect(view.strength).toBe(0);
  });
});

describe('cellView strength (graded colour by win rate/points)', () => {
  it('is 0 (even) at exactly 50% win rate', () => {
    const view = cellView(cell({ games: 13, winRate: 0.5 }), settings(), null);
    expect(view.strength).toBe(0);
    expect(view.tone).toBe('even');
  });

  it('is 1 (fully good) at 75% win rate', () => {
    const view = cellView(cell({ games: 13, winRate: 0.75 }), settings(), null);
    expect(view.strength).toBeCloseTo(1, 5);
    expect(view.tone).toBe('good');
  });

  it('is 1 (fully bad) at 25% win rate', () => {
    const view = cellView(cell({ games: 13, winRate: 0.25 }), settings(), null);
    expect(view.strength).toBeCloseTo(1, 5);
    expect(view.tone).toBe('bad');
  });

  it('is ~0.48 (good) at 62% win rate', () => {
    const view = cellView(cell({ games: 13, winRate: 0.62 }), settings(), null);
    expect(view.strength).toBeCloseTo(0.48, 5);
    expect(view.tone).toBe('good');
  });

  it('is 0 (even) at the points scale midpoint', () => {
    const view = cellView(cell({ games: 13, avgPoints: 10 }), settings({ metric: 'points' }), 20);
    expect(view.strength).toBe(0);
    expect(view.tone).toBe('even');
  });

  it('grows with distance from the points midpoint', () => {
    const view = cellView(cell({ games: 13, avgPoints: 17 }), settings({ metric: 'points' }), 20);
    // |17 - 10| / (10 * 0.7) = 1
    expect(view.strength).toBeCloseTo(1, 5);
    expect(view.tone).toBe('good');
  });

  it('is 0 strength for a null avgPoints (even)', () => {
    const view = cellView(cell({ games: 13, avgPoints: null }), settings({ metric: 'points' }), 20);
    expect(view.strength).toBe(0);
    expect(view.tone).toBe('even');
  });

  it('is 0 strength for hidden and mirror cells', () => {
    const hidden = cellView(cell({ games: 2 }), settings({ minGames: 3 }), null);
    expect(hidden.strength).toBe(0);
    const mirror = cellView(cell({ row: 'Orks', col: 'Orks', games: 6 }), settings(), null);
    expect(mirror.strength).toBe(0);
  });

  it('shows a detachment against its own faction as a result, not a mirror', () => {
    const view = cellView(
      cell({ row: 'Orks', col: 'Orks', games: 4, winRate: 0.75 }),
      settings(),
      null,
      false,
    );
    expect(view).toMatchObject({ text: '75%', games: 4, tone: 'good' });
  });
});

describe('matrixParams', () => {
  it('sends several dispositions as one comma-separated list, and nothing when none', () => {
    expect(matrixParams(DEFAULT_MATRIX_SETTINGS)).toEqual({});
    expect(
      matrixParams({
        ...DEFAULT_MATRIX_SETTINGS,
        dispositions: ['Take and Hold', 'Disruption'],
        side: 'both',
      }),
    ).toEqual({ dispositions: 'Take and Hold,Disruption', side: 'both' });
  });

  it('sends detachments too, with the side, when any is chosen', () => {
    expect(
      matrixParams({ ...DEFAULT_MATRIX_SETTINGS, detachments: ['War Horde', 'Wreckas'] }),
    ).toEqual({ detachments: 'War Horde|Wreckas', side: 'row' });
  });
});

describe('rowSummary', () => {
  const row = [
    // 6 of 10: 60%.
    cell({ col: 'Necrons', games: 10, wins: 6, draws: 0, losses: 4, winRate: 0.6, avgPoints: 12 }),
    // 3 of 10, with 2 draws: 40%.
    cell({ col: 'Tyranids', games: 10, wins: 3, draws: 2, losses: 5, winRate: 0.4, avgPoints: 8 }),
    // Too few games: left out of the average and the spread, not the overall.
    cell({ col: 'Aeldari', games: 2, wins: 2, draws: 0, losses: 0, winRate: 1, avgPoints: 18 }),
    // The mirror counts for nothing.
    cell({ col: 'Orks', games: 4, wins: 0, draws: 0, losses: 0, winRate: null, avgPoints: null }),
  ];

  it('gives the overall win rate from every game but the mirror', () => {
    // (6 + 3 + 1 + 2) / 22.
    expect(rowSummary(row, settings({ minGames: 3 }), null, 'Orks').overall).toBeCloseTo(12 / 22);
  });

  it('averages and spreads only the cells with enough games', () => {
    const summary = rowSummary(row, settings({ minGames: 3 }), null, 'Orks');
    expect(summary.average).toBeCloseTo(0.5);
    expect(summary.spread).toBeCloseTo(0.2);
    expect(summary.counted).toBe(2);
  });

  it('counts good (55%+), even and bad (45% or less) match-ups among them', () => {
    const counts = rowSummary(
      [
        ...row,
        cell({ col: 'Aeldari', games: 10, wins: 5, draws: 0, losses: 5, winRate: 0.5 }),
        cell({ col: 'Drukhari', games: 20, wins: 11, draws: 0, losses: 9, winRate: 0.55 }),
      ],
      settings({ minGames: 3 }),
      null,
      'Orks',
    );
    // Necrons 60% and Drukhari 55% good; Aeldari 50% even; Tyranids 40% bad.
    expect(counts).toMatchObject({ good: 2, even: 1, bad: 1 });
  });

  it('counts game points against even: good from 10% over, bad from 10% under', () => {
    const counts = rowSummary(row, settings({ minGames: 3, metric: 'points' }), 20, 'Orks');
    // Necrons 12 of 20 (good), Tyranids 8 (bad).
    expect(counts).toMatchObject({ good: 1, even: 0, bad: 1 });
  });

  it('uses game points when they are the metric', () => {
    const summary = rowSummary(row, settings({ minGames: 3, metric: 'points' }), 20, 'Orks');
    expect(summary.average).toBeCloseTo(10);
    expect(summary.spread).toBeCloseTo(4);
  });

  it('has no average or spread without a cell with enough games', () => {
    const summary = rowSummary(row, settings({ minGames: 50 }), null, 'Orks');
    expect(summary).toMatchObject({ average: null, spread: null, counted: 0 });
  });

  it('counts a detachment against its own faction, which is no mirror', () => {
    const summary = rowSummary(row, settings({ minGames: 3 }), null, null);
    // The "mirror" cell has a null win rate: counted in games, not in the rates.
    expect(summary.overall).toBeCloseTo(12 / 26);
  });
});
