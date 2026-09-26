import type { MatrixCell } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import {
  cellView,
  DEFAULT_MATRIX_SETTINGS,
  matrixParams,
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

const settings = (overrides: Partial<MatrixSettings> = {}): MatrixSettings => ({
  ...DEFAULT_MATRIX_SETTINGS,
  ...overrides,
});

describe('DEFAULT_MATRIX_SETTINGS', () => {
  it('defaults to win rate, min 3 games, no disposition, row side', () => {
    expect(DEFAULT_MATRIX_SETTINGS).toEqual({
      metric: 'winRate',
      minGames: 3,
      disposition: null,
      side: 'row',
    });
  });
});

describe('matrixParams', () => {
  it('sends nothing when no disposition is chosen', () => {
    expect(matrixParams(settings())).toEqual({});
  });

  it('sends disposition and side once a disposition is chosen', () => {
    expect(matrixParams(settings({ disposition: 'Take and Hold', side: 'both' }))).toEqual({
      disposition: 'Take and Hold',
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
  it('hides a cell under minGames, keeping the count for its title', () => {
    const view = cellView(cell({ games: 2 }), settings({ minGames: 3 }), null);
    expect(view).toEqual({ text: '·', value: '·', tone: 'hidden', games: 2 });
  });

  it('shows only the count on the mirror diagonal, halved since each mirror game adds two sides', () => {
    const view = cellView(
      cell({ row: 'Orks', col: 'Orks', games: 6, winRate: null }),
      settings(),
      null,
    );
    expect(view).toEqual({ text: '3', value: '3', tone: 'mirror', games: 3 });
  });

  it('hides a mirror cell under minGames using the halved count', () => {
    const view = cellView(
      cell({ row: 'Orks', col: 'Orks', games: 4, winRate: null }),
      settings({ minGames: 3 }),
      null,
    );
    expect(view).toEqual({ text: '·', value: '·', tone: 'hidden', games: 2 });
  });

  it('renders a win rate above the good threshold as good', () => {
    const view = cellView(cell({ games: 13, winRate: 0.62 }), settings(), null);
    expect(view).toEqual({ text: '62% · 13', value: '62%', tone: 'good', games: 13 });
  });

  it('treats exactly 55% as good (inclusive boundary)', () => {
    const view = cellView(cell({ games: 13, winRate: 0.55 }), settings(), null);
    expect(view.tone).toBe('good');
  });

  it('treats exactly 45% as bad (inclusive boundary)', () => {
    const view = cellView(cell({ games: 13, winRate: 0.45 }), settings(), null);
    expect(view.tone).toBe('bad');
  });

  it('renders a win rate below the bad threshold as bad', () => {
    const view = cellView(cell({ games: 13, winRate: 0.3 }), settings(), null);
    expect(view).toEqual({ text: '30% · 13', value: '30%', tone: 'bad', games: 13 });
  });

  it('renders a win rate in the middle as even', () => {
    const view = cellView(cell({ games: 13, winRate: 0.5 }), settings(), null);
    expect(view).toEqual({ text: '50% · 13', value: '50%', tone: 'even', games: 13 });
  });

  it('renders game points when the metric is points and a scale is known', () => {
    const view = cellView(cell({ games: 13, avgPoints: 12.4 }), settings({ metric: 'points' }), 20);
    expect(view).toEqual({ text: '12.4 · 13', value: '12.4', tone: 'good', games: 13 });
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
    expect(view).toEqual({ text: '– · 13', value: '–', tone: 'even', games: 13 });
  });
});
