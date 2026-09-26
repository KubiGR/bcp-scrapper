import type { GameResult } from '../domain';
import { isAllegiance } from '../factions';
import type { CellGame, FactionMatrix, MatrixCell } from './matchup-schemas';

export interface MatchupSide {
  playerId: string;
  name: string;
  faction: string | null;
  disposition: string | null;
  teamName: string | null;
}

/** One stored game with both sides' factions and dispositions; `b` is null for a bye. */
export interface MatchupGame {
  id: string;
  eventId: string;
  eventName: string;
  round: number;
  tableNo: number | null;
  a: MatchupSide;
  b: MatchupSide | null;
  pointsA: number | null;
  pointsB: number | null;
  result: GameResult | null;
}

/**
 * An empty `dispositions` list means no filter. `side: 'row'`: the row side played any listed
 * disposition; `'both'`: both sides did (each may play a different listed one).
 */
export interface DispositionFilter {
  dispositions: string[];
  side: 'row' | 'both';
}

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

/** A side with a real faction (not unknown, not just an allegiance), or null. */
function withFaction(side: MatchupSide): (MatchupSide & { faction: string }) | null {
  const { faction } = side;
  if (faction === null || isAllegiance(faction)) return null;
  return { ...side, faction };
}

/** Both sides of every countable game: not a bye, a known result, both factions known. */
function sidesOf(games: MatchupGame[], filter: DispositionFilter): SidedGame[] {
  const sided: SidedGame[] = [];
  for (const game of games) {
    const { result } = game;
    const a = withFaction(game.a);
    const b = game.b === null ? null : withFaction(game.b);
    if (!a || !b || result === null) continue;
    const filtered = filter.dispositions.length > 0;
    if (filtered && filter.side === 'both') {
      if (
        !inList(a.disposition, filter.dispositions) ||
        !inList(b.disposition, filter.dispositions)
      )
        continue;
    }
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
      if (filtered && filter.side === 'row' && !inList(pair.row.disposition, filter.dispositions))
        continue;
      sided.push(pair);
    }
  }
  return sided;
}

/**
 * Faction-vs-faction results. Each countable game adds one entry per side (row = that side's
 * faction); mirrors land on the diagonal twice and get no win rate.
 */
export function computeFactionMatrix(
  games: MatchupGame[],
  filter: DispositionFilter,
): FactionMatrix {
  const sided = sidesOf(games, filter);
  const cells = new Map<string, MatrixCell & { pointsSum: number; pointsGames: number }>();
  const playedBy = new Map<string, number>();
  for (const s of sided) {
    const key = `${s.row.faction}\u0000${s.col.faction}`;
    const cell = cells.get(key) ?? {
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
    cell.games += 1;
    if (s.outcome === 'win') cell.wins += 1;
    if (s.outcome === 'draw') cell.draws += 1;
    if (s.outcome === 'loss') cell.losses += 1;
    if (s.rowPoints !== null) {
      cell.pointsSum += s.rowPoints;
      cell.pointsGames += 1;
    }
    cells.set(key, cell);
    playedBy.set(s.row.faction, (playedBy.get(s.row.faction) ?? 0) + 1);
  }
  const factions = [...playedBy.keys()].sort((x, y) => x.localeCompare(y));
  return {
    factions,
    cells: [...cells.values()].map(({ pointsSum, pointsGames, ...cell }) => ({
      ...cell,
      winRate: cell.row === cell.col ? null : (cell.wins + cell.draws / 2) / cell.games,
      avgPoints: pointsGames === 0 ? null : pointsSum / pointsGames,
    })),
    games: new Set(sided.map((s) => s.game.id)).size,
  };
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

/** The games behind one cell, from the row side, in round then table order. */
export function cellGames(
  games: MatchupGame[],
  row: string,
  col: string,
  filter: DispositionFilter,
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
        disposition: s.row.disposition,
        teamName: s.row.teamName,
      },
      col: {
        name: s.col.name,
        faction: s.col.faction,
        disposition: s.col.disposition,
        teamName: s.col.teamName,
      },
      outcome: s.outcome,
      rowPoints: s.rowPoints,
      colPoints: s.colPoints,
    }));
}
