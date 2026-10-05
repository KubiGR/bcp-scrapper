import type { GameResult } from '../domain';
import { isAllegiance } from '../factions';
import type { CellGame, DetachmentRow, FactionMatrix, MatrixCell } from './matchup-schemas';

export interface MatchupSide {
  playerId: string;
  name: string;
  faction: string | null;
  factionGuessed: boolean;
  disposition: string | null;
  /** From the player's fetched list; empty when not fetched. */
  detachments: string[];
  teamName: string | null;
}

/** One stored game with both sides' factions and dispositions; `b` is null for a bye. */
export interface MatchupGame {
  id: string;
  eventId: string;
  eventName: string;
  /** ISO start of the event, for ordering games newest first. */
  eventStartDate: string;
  round: number;
  tableNo: number | null;
  a: MatchupSide;
  b: MatchupSide | null;
  pointsA: number | null;
  pointsB: number | null;
  result: GameResult | null;
}

/**
 * Empty lists mean no filter. A side matches when it played any listed disposition AND any
 * listed detachment. `side: 'row'`: the row side must match; `'both'`: both sides must.
 */
export interface MatchupFilter {
  dispositions: string[];
  detachments?: string[];
  side: 'row' | 'both';
}
/** The name before detachments joined the filter. */
export type DispositionFilter = MatchupFilter;

type Outcome = 'win' | 'loss' | 'draw';

/** A game from one side's point of view: that side is the row, the other the column. */
interface SidedGame {
  game: MatchupGame;
  row: MatchupSide & { faction: string };
  col: MatchupSide & { faction: string };
  outcome: Outcome;
  rowPoints: number | null;
  colPoints: number | null;
}

const normalise = (value: string) => value.trim().toLowerCase();

/** Whether a side's disposition is one of the listed ones (case- and whitespace-insensitive). */
const inList = (value: string | null, list: string[]) =>
  value !== null && list.some((listed) => normalise(listed) === normalise(value));

/** Whether a side passes the filter's disposition and detachment lists. */
function sideMatches(side: MatchupSide, filter: MatchupFilter): boolean {
  const detachments = filter.detachments ?? [];
  const byDisposition =
    filter.dispositions.length === 0 || inList(side.disposition, filter.dispositions);
  const byDetachment =
    detachments.length === 0 || side.detachments.some((name) => inList(name, detachments));
  return byDisposition && byDetachment;
}

/** A side with a real faction (not unknown, not just an allegiance), or null. */
function withFaction(side: MatchupSide): (MatchupSide & { faction: string }) | null {
  const { faction } = side;
  if (faction === null || isAllegiance(faction)) return null;
  return { ...side, faction };
}

/** Both sides of every countable game: not a bye, a known result, both factions known. */
function sidesOf(games: MatchupGame[], filter: MatchupFilter): SidedGame[] {
  const sided: SidedGame[] = [];
  for (const game of games) {
    const { result } = game;
    const a = withFaction(game.a);
    const b = game.b === null ? null : withFaction(game.b);
    if (!a || !b || result === null) continue;
    if (filter.side === 'both' && (!sideMatches(a, filter) || !sideMatches(b, filter))) continue;
    const aOutcome: Outcome = result === 'draw' ? 'draw' : result === 'a_win' ? 'win' : 'loss';
    const bOutcome: Outcome = aOutcome === 'draw' ? 'draw' : aOutcome === 'win' ? 'loss' : 'win';
    const pairs: SidedGame[] = [
      {
        game,
        row: a,
        col: b,
        outcome: aOutcome,
        rowPoints: game.pointsA,
        colPoints: game.pointsB,
      },
      {
        game,
        row: b,
        col: a,
        outcome: bOutcome,
        rowPoints: game.pointsB,
        colPoints: game.pointsA,
      },
    ];
    for (const pair of pairs) {
      if (filter.side === 'row' && !sideMatches(pair.row, filter)) continue;
      sided.push(pair);
    }
  }
  return sided;
}

type CellTally = MatrixCell & { pointsSum: number; pointsGames: number };

/**
 * Results per row and opponent faction: `rowsOf` names the row a sided game counts in (or several).
 * `mirrorRate`: whether a row against its own faction gets a win rate.
 */
function tally(
  sided: SidedGame[],
  rowsOf: (s: SidedGame) => string[],
  mirrorRate: boolean,
): Map<string, MatrixCell[]> {
  const cells = new Map<string, CellTally>();
  const rowKeys = new Map<string, string[]>();
  for (const s of sided) {
    for (const rowKey of rowsOf(s)) {
      const key = `${rowKey}\u0000${s.col.faction}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = {
          row: s.row.faction,
          col: s.col.faction,
          games: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          winRate: null,
          avgPoints: null,
          pointsSum: 0,
          pointsGames: 0,
        };
        cells.set(key, cell);
        rowKeys.set(rowKey, [...(rowKeys.get(rowKey) ?? []), key]);
      }
      cell.games += 1;
      if (s.outcome === 'win') cell.wins += 1;
      if (s.outcome === 'draw') cell.draws += 1;
      if (s.outcome === 'loss') cell.losses += 1;
      if (s.rowPoints !== null) {
        cell.pointsSum += s.rowPoints;
        cell.pointsGames += 1;
      }
    }
  }
  const finish = ({ pointsSum, pointsGames, ...cell }: CellTally): MatrixCell => ({
    ...cell,
    winRate:
      cell.row === cell.col && !mirrorRate ? null : (cell.wins + cell.draws / 2) / cell.games,
    avgPoints: pointsGames === 0 ? null : pointsSum / pointsGames,
  });
  const byRow = new Map<string, MatrixCell[]>();
  for (const [rowKey, keys] of rowKeys) {
    byRow.set(
      rowKey,
      keys.map((key) => {
        const cell = cells.get(key);
        if (!cell) throw new Error('tally lost a cell');
        return finish(cell);
      }),
    );
  }
  return byRow;
}

/**
 * Faction-vs-faction results. Each countable game adds one entry per side (row = that side's
 * faction); mirrors land on the diagonal twice and get no win rate, unless a row-side filter
 * kept only some of their sides.
 */
export function computeFactionMatrix(games: MatchupGame[], filter: MatchupFilter): FactionMatrix {
  const sided = sidesOf(games, filter);
  // Filtering only the row side breaks a mirror's pairs of sides: it is then a real result.
  const narrowsRows =
    filter.side === 'row' &&
    (filter.dispositions.length > 0 || (filter.detachments ?? []).length > 0);
  const byRow = tally(sided, (s) => [s.row.faction], narrowsRows);
  const az = (names: Iterable<string>) => [...new Set(names)].sort((x, y) => x.localeCompare(y));
  return {
    factions: az(byRow.keys()),
    columns: az(sided.map((s) => s.col.faction)),
    cells: [...byRow.values()].flat(),
    games: new Set(sided.map((s) => s.game.id)).size,
  };
}

/**
 * One faction's results split by detachment, against each opponent faction: a list with two
 * detachments counts in both rows; sides without a fetched list are left out. Most games first.
 * Against its own faction a detachment row has a win rate.
 */
export function detachmentRows(
  games: MatchupGame[],
  faction: string,
  filter: MatchupFilter,
): DetachmentRow[] {
  const sided = sidesOf(games, filter).filter((s) => s.row.faction === faction);
  const byRow = tally(sided, (s) => [...new Set(s.row.detachments)], true);
  return [...byRow]
    .map(([key, cells]) => ({
      detachment: key,
      games: cells.reduce((sum, cell) => sum + cell.games, 0),
      cells: cells.sort((x, y) => x.col.localeCompare(y.col)),
    }))
    .sort((x, y) => y.games - x.games || x.detachment.localeCompare(y.detachment));
}

/** The most common `pointsA + pointsB` over an event's games with both points; null if none. */
export function eventScale(games: MatchupGame[]): number | null {
  const counts = new Map<number, number>();
  for (const game of games) {
    if (game.pointsA === null || game.pointsB === null || !game.b) continue;
    const total = game.pointsA + game.pointsB;
    counts.set(total, (counts.get(total) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [total, seen] of counts) {
    if (seen > bestCount || (seen === bestCount && best !== null && total < best)) {
      best = total;
      bestCount = seen;
    }
  }
  return best;
}

/** Whether every event (with a known scale) scores its games to the same total. */
export function scalesAgree(games: MatchupGame[]): { consistent: boolean; scale: number | null } {
  const byEvent = new Map<string, MatchupGame[]>();
  for (const game of games) byEvent.set(game.eventId, [...(byEvent.get(game.eventId) ?? []), game]);
  const scales = new Set(
    [...byEvent.values()].map(eventScale).filter((scale): scale is number => scale !== null),
  );
  if (scales.size > 1) return { consistent: false, scale: null };
  return { consistent: true, scale: [...scales][0] ?? null };
}

/** The games behind one cell, from the row side: newest event first, then round and table. */
export function cellGames(
  games: MatchupGame[],
  row: string,
  col: string,
  filter: MatchupFilter,
): CellGame[] {
  let sided = sidesOf(games, filter).filter((s) => s.row.faction === row && s.col.faction === col);
  if (row === col) {
    // A mirror match adds one entry per side; keep just the one where the game's player A is the row.
    const byGame = new Map<string, SidedGame>();
    for (const s of sided) {
      const existing = byGame.get(s.game.id);
      if (!existing || s.row.playerId === s.game.a.playerId) byGame.set(s.game.id, s);
    }
    sided = [...byGame.values()];
  }
  return sided
    .sort(
      (x, y) =>
        y.game.eventStartDate.localeCompare(x.game.eventStartDate) ||
        x.game.eventName.localeCompare(y.game.eventName) ||
        x.game.round - y.game.round ||
        (x.game.tableNo ?? 0) - (y.game.tableNo ?? 0),
    )
    .map((s) => ({
      id: s.game.id,
      eventId: s.game.eventId,
      eventName: s.game.eventName,
      round: s.game.round,
      tableNo: s.game.tableNo,
      row: {
        name: s.row.name,
        faction: s.row.faction,
        factionGuessed: s.row.factionGuessed,
        disposition: s.row.disposition,
        detachments: s.row.detachments,
        teamName: s.row.teamName,
      },
      col: {
        name: s.col.name,
        faction: s.col.faction,
        factionGuessed: s.col.factionGuessed,
        disposition: s.col.disposition,
        detachments: s.col.detachments,
        teamName: s.col.teamName,
      },
      outcome: s.outcome,
      rowPoints: s.rowPoints,
      colPoints: s.colPoints,
    }));
}

/** Every detachment played in these games, A→Z (for the detachment filter's options). */
export function detachmentsPlayed(games: MatchupGame[]): string[] {
  const names = new Set<string>();
  for (const game of games) {
    for (const side of [game.a, game.b]) side?.detachments.forEach((name) => names.add(name));
  }
  return [...names].sort((x, y) => x.localeCompare(y));
}
