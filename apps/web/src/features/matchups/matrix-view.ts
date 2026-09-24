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
  text: string;
  tone: CellTone;
}

/**
 * What a matrix cell shows: hidden under `minGames`, just the count on the mirror diagonal,
 * otherwise the chosen metric (win rate, or game points when a `scale` is available) as text
 * plus the game count, so colour is never the only signal.
 */
export function cellView(
  cell: MatrixCell,
  settings: MatrixSettings,
  scale: number | null,
): CellView {
  if (cell.games < settings.minGames) return { text: '·', tone: 'hidden' };
  if (cell.row === cell.col) return { text: String(cell.games), tone: 'mirror' };

  if (settings.metric === 'points' && scale !== null) {
    if (cell.avgPoints === null) return { text: `– · ${cell.games}`, tone: 'even' };
    const midpoint = scale / 2;
    const tone: CellTone =
      cell.avgPoints >= midpoint * 1.1 ? 'good' : cell.avgPoints <= midpoint * 0.9 ? 'bad' : 'even';
    return { text: `${cell.avgPoints.toFixed(1)} · ${cell.games}`, tone };
  }

  const rate = cell.winRate ?? 0;
  const tone: CellTone = rate >= 0.55 ? 'good' : rate <= 0.45 ? 'bad' : 'even';
  return { text: `${Math.round(rate * 100)}% · ${cell.games}`, tone };
}
