import type { MatrixCell } from '@bcp/shared';

export interface MatrixSettings {
  metric: 'winRate' | 'points';
  minGames: number;
  disposition: string | null;
  side: 'row' | 'both';
}

export const DEFAULT_MATRIX_SETTINGS: MatrixSettings = {
  metric: 'winRate',
  minGames: 3,
  disposition: null,
  side: 'row',
};

/** Only `disposition`/`side` are server filters; `metric`/`minGames` are display-only. */
export function matrixParams(settings: MatrixSettings): Record<string, string> {
  if (settings.disposition === null) return {};
  return { disposition: settings.disposition, side: settings.side };
}

export type CellTone = 'good' | 'bad' | 'even' | 'mirror' | 'hidden';

export interface CellView {
  /** The full display text, including the game count where relevant (e.g. "62% · 13"). */
  text: string;
  /** The metric alone, with no game count (e.g. "62%"), for an aria-label that adds its own count. */
  value: string;
  tone: CellTone;
  /** The game count this cell is judged against: `cell.games` halved on the mirror diagonal, since
   * each mirror game adds two sides. */
  games: number;
}

/**
 * What a matrix cell shows: hidden under `minGames`, just the count on the mirror diagonal,
 * otherwise the chosen metric (win rate, or game points when a `scale` is available) as text
 * plus the game count, so colour is never the only signal. A mirror's `games` is halved first,
 * since `computeFactionMatrix` counts each side of a mirror game separately.
 */
export function cellView(
  cell: MatrixCell,
  settings: MatrixSettings,
  scale: number | null,
): CellView {
  const isMirror = cell.row === cell.col;
  const games = isMirror ? cell.games / 2 : cell.games;
  if (games < settings.minGames) return { text: '·', value: '·', tone: 'hidden', games };
  if (isMirror) return { text: String(games), value: String(games), tone: 'mirror', games };

  if (settings.metric === 'points' && scale !== null) {
    if (cell.avgPoints === null) return { text: `– · ${games}`, value: '–', tone: 'even', games };
    const midpoint = scale / 2;
    const tone: CellTone =
      cell.avgPoints >= midpoint * 1.1 ? 'good' : cell.avgPoints <= midpoint * 0.9 ? 'bad' : 'even';
    const value = cell.avgPoints.toFixed(1);
    return { text: `${value} · ${games}`, value, tone, games };
  }

  const rate = cell.winRate ?? 0;
  const tone: CellTone = rate >= 0.55 ? 'good' : rate <= 0.45 ? 'bad' : 'even';
  const value = `${Math.round(rate * 100)}%`;
  return { text: `${value} · ${games}`, value, tone, games };
}
