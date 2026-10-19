import { DETACHMENT_SEPARATOR, type MatrixCell } from '@bcp/shared';

export interface MatrixSettings {
  metric: 'winRate' | 'points';
  minGames: number;
  /** Any listed disposition matches; empty = no filter. */
  dispositions: string[];
  /** Any listed detachment matches; empty = no filter. */
  detachments: string[];
  side: 'row' | 'both';
  /** The factions shown as rows (still against every opponent); empty = all. Display only. */
  factions: string[];
}

export const DEFAULT_MATRIX_SETTINGS: MatrixSettings = {
  metric: 'winRate',
  // Under 25 games a match-up says little (as Hutber reads it): hatched, out of Spread and Average.
  minGames: 25,
  dispositions: [],
  detachments: [],
  side: 'row',
  factions: [],
};

/**
 * An event's own matchups: a single event rarely has 25 games of a pairing, so its cells count
 * from 3.
 */
export const EVENT_MATRIX_SETTINGS: MatrixSettings = { ...DEFAULT_MATRIX_SETTINGS, minGames: 3 };

/** Whether a server-side filter (disposition or detachment) is chosen. */
export const hasSideFilter = (settings: Pick<MatrixSettings, 'dispositions' | 'detachments'>) =>
  settings.dispositions.length > 0 || settings.detachments.length > 0;

/** Only `dispositions`/`detachments`/`side` are server filters; `metric`/`minGames` are display-only. */
export function matrixParams(settings: MatrixSettings): Record<string, string> {
  if (!hasSideFilter(settings)) return {};
  const params: Record<string, string> = { side: settings.side };
  if (settings.dispositions.length > 0) params.dispositions = settings.dispositions.join(',');
  if (settings.detachments.length > 0) {
    params.detachments = settings.detachments.join(DETACHMENT_SEPARATOR);
  }
  return params;
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
 * What a matrix cell shows: greyed (`hidden`) under `minGames`, with its value still there; just
 * the count on the mirror diagonal,
 * otherwise the chosen metric (win rate, or game points when a `scale` is available) as compact
 * text, with a `strength` in [0, 1] for a graded background so colour intensity tracks how far the
 * value is from even. The game count travels separately (aria-label, tooltip, or a second line) so
 * colour is never the only signal. A mirror's `games` is already its games played.
 */
export function cellView(
  cell: MatrixCell,
  settings: MatrixSettings,
  scale: number | null,
  /** A detachment row against its own faction is a real result, not a mirror. */
  isMirror = cell.row === cell.col,
): CellView {
  const { games } = cell;
  if (games < settings.minGames) {
    // Too few games to read much into: the value stays, greyed and hatched, uncoloured.
    const shown = isMirror
      ? String(games)
      : cellView(cell, { ...settings, minGames: 0 }, scale).value;
    return { text: shown, value: shown, tone: 'hidden', games, strength: 0 };
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
  // Full colour at 75% / 25%: most matchups sit within 35–65%, and should still read clearly.
  const { tone, strength } = toneAndStrength(rate, 0.5, 0.25);
  const value = `${Math.round(rate * 100)}%`;
  return { text: value, value, tone, games, strength };
}

export interface RowSummary {
  /** Win rate over every game the row played but mirrors (small cells too); null with none. */
  overall: number | null;
  /** The shown metric (win rate, or game points) averaged over the cells with enough games. */
  average: number | null;
  /** Its best minus its worst among those cells. */
  spread: number | null;
  /** How many cells have enough games to count. */
  counted: number;
  /** Of those, how many are good, even and bad match-ups (see `matchupTone`). */
  good: number;
  even: number;
  bad: number;
}

/**
 * Whether a match-up is good, even or bad for the row, as the Meta page reads a win rate: good
 * from 55%, bad at 45% or less; in game points, good from 10% over even, bad from 10% under.
 */
export function matchupTone(value: number, scale: number | null): 'good' | 'even' | 'bad' {
  const [good, bad] = scale === null ? [0.55, 0.45] : [(scale / 2) * 1.1, (scale / 2) * 0.9];
  if (value >= good - 1e-9) return 'good';
  if (value <= bad + 1e-9) return 'bad';
  return 'even';
}

/**
 * A row's overall win rate, and its average and spread of match-ups. Cells under `minGames` (the
 * hatched ones) count towards the overall result but not the average or spread. `mirror` is the
 * row's own faction (null for a detachment row, whose own faction is a real match-up).
 */
export function rowSummary(
  cells: MatrixCell[],
  settings: Pick<MatrixSettings, 'metric' | 'minGames'>,
  scale: number | null,
  mirror: string | null,
): RowSummary {
  const played = cells.filter((cell) => cell.col !== mirror);
  const games = played.reduce((sum, cell) => sum + cell.games, 0);
  const points = played.reduce((sum, cell) => sum + cell.wins + cell.draws / 2, 0);
  const usePoints = settings.metric === 'points' && scale !== null;
  const values = played
    .filter((cell) => cell.games >= settings.minGames)
    .map((cell) => (usePoints ? cell.avgPoints : cell.winRate))
    .filter((value): value is number => value !== null);
  const tones = values.map((value) => matchupTone(value, usePoints ? scale : null));
  return {
    overall: games === 0 ? null : points / games,
    average: values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length,
    spread: values.length === 0 ? null : Math.max(...values) - Math.min(...values),
    counted: values.length,
    good: tones.filter((tone) => tone === 'good').length,
    even: tones.filter((tone) => tone === 'even').length,
    bad: tones.filter((tone) => tone === 'bad').length,
  };
}
