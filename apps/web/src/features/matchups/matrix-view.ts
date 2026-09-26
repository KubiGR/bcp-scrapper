import type { MatrixCell } from '@bcp/shared';

export interface MatrixSettings {
  metric: 'winRate' | 'points';
  minGames: number;
  /** Any listed disposition matches; empty = no filter. */
  dispositions: string[];
  side: 'row' | 'both';
}

export const DEFAULT_MATRIX_SETTINGS: MatrixSettings = {
  metric: 'winRate',
  minGames: 3,
  dispositions: [],
  side: 'row',
};

/** Only `dispositions`/`side` are server filters; `metric`/`minGames` are display-only. */
export function matrixParams(settings: MatrixSettings): Record<string, string> {
  if (settings.dispositions.length === 0) return {};
  return { dispositions: settings.dispositions.join(','), side: settings.side };
}

export type CellTone = 'good' | 'bad' | 'even' | 'mirror' | 'hidden';

export interface CellView {
  /** The compact display text: just the value (e.g. "62%"), no game count. */
  text: string;
  /** The metric alone, with no game count (e.g. "62%"), for an aria-label that adds its own count. */
  value: string;
  tone: CellTone;
  /** The game count this cell is judged against: `cell.games` halved on the mirror diagonal, since
   * each mirror game adds two sides. */
  games: number;
  /** How far the metric sits from "even", in [0, 1], for a graded background. 0 for hidden/mirror
   * cells and for a value at or near the midpoint. */
  strength: number;
}

/** Tone plus graded strength around a midpoint: `strength` is 0 at the midpoint and 1 once the
 * value is `spread` away from it (clamped), so callers can render an intensity-scaled colour. */
function toneAndStrength(
  value: number,
  midpoint: number,
  spread: number,
): { tone: CellTone; strength: number } {
  const strength = spread === 0 ? 0 : Math.min(1, Math.abs(value - midpoint) / spread);
  if (strength < 0.05) return { tone: 'even', strength };
  return { tone: value > midpoint ? 'good' : 'bad', strength };
}

/**
 * What a matrix cell shows: hidden under `minGames`, just the count on the mirror diagonal,
 * otherwise the chosen metric (win rate, or game points when a `scale` is available) as compact
 * text, with a `strength` in [0, 1] for a graded background so colour intensity tracks how far the
 * value is from even. The game count travels separately (aria-label, tooltip, or a second line) so
 * colour is never the only signal. A mirror's `games` is halved first, since `computeFactionMatrix`
 * counts each side of a mirror game separately.
 */
export function cellView(
  cell: MatrixCell,
  settings: MatrixSettings,
  scale: number | null,
): CellView {
  const isMirror = cell.row === cell.col;
  const games = isMirror ? cell.games / 2 : cell.games;
  if (games < settings.minGames) {
    return { text: '·', value: '·', tone: 'hidden', games, strength: 0 };
  }
  if (isMirror) {
    return { text: String(games), value: String(games), tone: 'mirror', games, strength: 0 };
  }

  if (settings.metric === 'points' && scale !== null) {
    if (cell.avgPoints === null) {
      return { text: '–', value: '–', tone: 'even', games, strength: 0 };
    }
    const midpoint = scale / 2;
    const { tone, strength } = toneAndStrength(cell.avgPoints, midpoint, midpoint * 0.7);
    const value = cell.avgPoints.toFixed(1);
    return { text: value, value, tone, games, strength };
  }

  const rate = cell.winRate ?? 0;
  const { tone, strength } = toneAndStrength(rate, 0.5, 0.35);
  const value = `${Math.round(rate * 100)}%`;
  return { text: value, value, tone, games, strength };
}
