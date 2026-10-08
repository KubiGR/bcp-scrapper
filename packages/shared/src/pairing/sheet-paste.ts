import { canonicalArmy } from '../factions';
import { PAIRING_CHIPS, type PairingChip } from './scale';

const CHIPS = new Set<string>(PAIRING_CHIPS);
/** The sheet's modifiers and preferred-layout badges: no chip of their own. */
const MODIFIERS = new Set(['?', '+', 'A', 'B', 'C']);

type Cell =
  | { kind: 'chip'; chip: PairingChip; alt: PairingChip | null }
  | { kind: 'blank' }
  | { kind: 'unreadable' };

/**
 * One copied cell: "GG"; "g, y" (the first chip is the rating, the second what the game can
 * become); "G, ?" or "G, A" (modifiers and layout badges ignored); "" or only modifiers
 * (unrated). Anything else is unreadable.
 */
function readCell(text: string): Cell {
  const tokens = text
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t !== '');
  if (tokens.some((t) => !CHIPS.has(t) && !MODIFIERS.has(t))) return { kind: 'unreadable' };
  const [chip, alt] = tokens.filter((t) => CHIPS.has(t)) as PairingChip[];
  return chip === undefined ? { kind: 'blank' } : { kind: 'chip', chip, alt: alt ?? null };
}

/** A player as the sheet labels them: the army, and the name and list when copied along. */
export interface SheetPlayer {
  army: string;
  name: string | null;
  list: string | null;
}

export interface SheetPaste {
  /** The size × size block of chips (null = unrated or unreadable), or null if none was found. */
  cells: (PairingChip | null)[][] | null;
  /** What each game can become (a cell's second chip), null when it has none. */
  alts: (PairingChip | null)[][] | null;
  /** [row, column] within the block of cells that weren't chips. */
  unreadable: [number, number][];
  /** Our players (the block's rows), from the cells to their left. */
  ours: SheetPlayer[];
  /** Their players (the block's columns), from the cells above. */
  theirs: SheetPlayer[];
}

/**
 * Tab-separated rows as Google Sheets copies them: a cell holding line breaks, tabs or quotes is
 * quoted, with its quotes doubled.
 */
function splitTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === '"' && field === '') {
      i += 1;
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (text[i] === '"') {
          i += 1;
          break;
        } else {
          field += text.charAt(i);
          i += 1;
        }
      }
      continue;
    }
    if (ch === '\t') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
      if (ch === '\r') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
    i += 1;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Header text that can name a player: one line, not a number like "11.7 ± 4", not a chip. */
const isLabel = (text: string) =>
  text !== '' && !text.includes('\n') && !/\d/.test(text) && readCell(text).kind === 'unreadable';

/**
 * Labels read from the cells beside a row or above a column, nearest the block last. The army is
 * the one the app recognises as an army (else the first label); the name is the label before it.
 */
function playerFrom(texts: string[], fallback: string): SheetPlayer {
  const labels = texts.map((t) => t.trim()).filter(isLabel);
  const at = labels.findIndex((t) => canonicalArmy(t) !== null);
  const armyAt = at === -1 ? 0 : at;
  const lists = texts.filter((t) => t.includes('\n')).map((t) => t.trim());
  return {
    army: labels[armyAt] ?? fallback,
    name: armyAt > 0 ? (labels[armyAt - 1] ?? null) : null,
    list: lists.reduce<string | null>((a, b) => (a === null || b.length > a.length ? b : a), null),
  };
}

/**
 * Reads ratings copied from the team's Google Sheet. The block is the size × size window with the
 * most chips; the cells to its left name our players and the cells above name theirs.
 */
export function parseSheetPaste(text: string, size = 5): SheetPaste {
  const raw = splitTsv(text);
  const grid = raw.map((line) => line.map(readCell));
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
  const places = Array.from({ length: size }, (_, i) => i);
  if (best === null) {
    return {
      cells: null,
      alts: null,
      unreadable: [],
      ours: places.map((i) => playerFrom([], `Player ${i + 1}`)),
      theirs: places.map((j) => playerFrom([], `Opponent ${j + 1}`)),
    };
  }
  const { r, c } = best;
  const unreadable: [number, number][] = [];
  const cells = places.map((i) =>
    places.map((j) => {
      const cell = at(r + i, c + j);
      if (cell.kind === 'unreadable') unreadable.push([i, j]);
      return cell.kind === 'chip' ? cell.chip : null;
    }),
  );
  const ours = places.map((i) => playerFrom((raw[r + i] ?? []).slice(0, c), `Player ${i + 1}`));
  const theirs = places.map((j) =>
    playerFrom(
      raw.slice(0, r).map((line) => line[c + j] ?? ''),
      `Opponent ${j + 1}`,
    ),
  );
  const alts = places.map((i) =>
    places.map((j) => {
      const cell = at(r + i, c + j);
      return cell.kind === 'chip' ? cell.alt : null;
    }),
  );
  return { cells, alts, unreadable, ours, theirs };
}
