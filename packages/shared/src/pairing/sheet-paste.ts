import { PAIRING_CHIPS, type PairingChip } from './scale';

const CHIPS = new Set<string>(PAIRING_CHIPS);
/** The sheet's modifiers: no chip of their own. */
const MODIFIERS = new Set(['?', '+']);

type Cell = { kind: 'chip'; chip: PairingChip } | { kind: 'blank' } | { kind: 'unreadable' };

/**
 * One copied cell: "GG", "g, y" (several chips: the first colour chip, as the sheet colours the
 * cell), "G, ?" (modifiers ignored), "" or only modifiers (unrated); anything else is unreadable.
 */
function readCell(text: string): Cell {
  const tokens = text
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t !== '');
  if (tokens.some((t) => !CHIPS.has(t) && !MODIFIERS.has(t))) return { kind: 'unreadable' };
  const chip = tokens.find((t) => CHIPS.has(t));
  return chip === undefined ? { kind: 'blank' } : { kind: 'chip', chip: chip as PairingChip };
}

export interface SheetPaste {
  /** The size × size block of chips (null = unrated or unreadable), or null if none was found. */
  cells: (PairingChip | null)[][] | null;
  /** [row, column] within the block of cells that weren't chips. */
  unreadable: [number, number][];
}

/**
 * Reads ratings copied from the team's Google Sheet (tab-separated rows). The block is the
 * size × size window with the most chips, so header rows, names and role columns copied along
 * are skipped.
 */
export function parseSheetPaste(text: string, size = 5): SheetPaste {
  const grid = text
    .split(/\r?\n/)
    .filter((line, i, all) => line.trim() !== '' || i < all.length - 1)
    .map((line) => line.split('\t').map(readCell));
  const at = (r: number, c: number): Cell => grid[r]?.[c] ?? { kind: 'blank' };
  const width = Math.max(0, ...grid.map((row) => row.length));
  let best: { r: number; c: number; score: number } | null = null;
  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < width; c += 1) {
      let chips = 0;
      let bad = 0;
      for (let i = 0; i < size; i += 1)
        for (let j = 0; j < size; j += 1) {
          const kind = at(r + i, c + j).kind;
          if (kind === 'chip') chips += 1;
          else if (kind === 'unreadable') bad += 1;
        }
      const score = chips - bad;
      if (chips > 0 && (best === null || score > best.score)) best = { r, c, score };
    }
  }
  if (best === null) return { cells: null, unreadable: [] };
  const { r, c } = best;
  const unreadable: [number, number][] = [];
  const cells = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => {
      const cell = at(r + i, c + j);
      if (cell.kind === 'unreadable') unreadable.push([i, j]);
      return cell.kind === 'chip' ? cell.chip : null;
    }),
  );
  return { cells, unreadable };
}
