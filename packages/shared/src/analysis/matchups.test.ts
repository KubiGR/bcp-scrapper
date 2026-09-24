import { describe, expect, it } from 'vitest';
import {
  cellGames,
  computeFactionMatrix,
  scalesAgree,
  type MatchupGame,
  type MatchupSide,
} from './matchups';

const side = (
  id: string,
  faction: string | null,
  disposition: string | null = null,
): MatchupSide => ({
  playerId: id,
  name: `Player ${id}`,
  faction,
  disposition,
  teamName: null,
});
let n = 0;
const game = (
  a: MatchupSide,
  b: MatchupSide | null,
  pa: number | null,
  pb: number | null,
  result: MatchupGame['result'],
  eventId = 'E1',
): MatchupGame => ({
  id: `G${(n += 1)}`,
  eventId,
  eventName: `Event ${eventId}`,
  round: 1,
  tableNo: n,
  a,
  b,
  pointsA: pa,
  pointsB: pb,
  result,
});

const noFilter = { disposition: null, side: 'row' } as const;
const cell = (m: ReturnType<typeof computeFactionMatrix>, row: string, col: string) =>
  m.cells.find((c) => c.row === row && c.col === col);

describe('computeFactionMatrix', () => {
  const games = [
    game(side('1', 'Orks', 'Take and Hold'), side('2', 'Necrons', 'Disruption'), 15, 5, 'a_win'),
    game(side('3', 'Orks', 'Disruption'), side('4', 'Necrons', 'Disruption'), 10, 10, 'draw'),
    game(side('5', 'Necrons'), side('6', 'Orks'), 20, 0, 'a_win'),
    game(side('7', 'Orks'), side('8', 'Orks'), 12, 8, 'a_win'), // mirror
    game(side('9', 'Orks'), null, 20, null, 'a_win'), // bye
    game(side('10', 'Orks'), side('11', 'Necrons'), null, null, null), // no result
    game(side('12', null), side('13', 'Necrons'), 15, 5, 'a_win'), // no faction
  ];
  const matrix = computeFactionMatrix(games, noFilter);

  it('counts each game once per side, from the row side', () => {
    expect(cell(matrix, 'Orks', 'Necrons')).toEqual({
      row: 'Orks',
      col: 'Necrons',
      games: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      winRate: 0.5,
      avgPoints: 25 / 3,
    });
    expect(cell(matrix, 'Necrons', 'Orks')).toMatchObject({
      games: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      winRate: 0.5,
    });
  });

  it('puts mirrors on the diagonal, twice, with no win rate', () => {
    expect(cell(matrix, 'Orks', 'Orks')).toMatchObject({
      games: 2,
      wins: 1,
      losses: 1,
      winRate: null,
      avgPoints: 10,
    });
  });

  it('leaves out byes, unknown results and players without a faction', () => {
    expect(matrix.games).toBe(4);
    expect(matrix.factions).toEqual(['Orks', 'Necrons']); // Orks: 5 sides played, Necrons: 3
    expect(matrix.cells.some((c) => c.row === 'null' || c.col === 'null')).toBe(false);
  });

  it('filters by disposition: the row side, or both sides', () => {
    const rowSide = computeFactionMatrix(games, { disposition: 'Disruption', side: 'row' });
    expect(cell(rowSide, 'Orks', 'Necrons')).toMatchObject({ games: 1, draws: 1 }); // player 3
    expect(cell(rowSide, 'Necrons', 'Orks')).toMatchObject({ games: 2, losses: 1, draws: 1 }); // players 2 and 4
    const both = computeFactionMatrix(games, { disposition: 'Disruption', side: 'both' });
    expect(both.games).toBe(1); // only players 3 vs 4
    expect(cell(both, 'Orks', 'Necrons')).toMatchObject({ games: 1, draws: 1 });
  });
});

describe('scalesAgree', () => {
  it("uses each event's most common game total", () => {
    const twenty = [
      game(side('1', 'Orks'), side('2', 'Necrons'), 15, 5, 'a_win', 'A'),
      game(side('3', 'Orks'), side('4', 'Necrons'), 12, 8, 'a_win', 'A'),
      game(side('5', 'Orks'), side('6', 'Necrons'), 7, 3, 'a_win', 'A'), // an odd one out
      game(side('7', 'Orks'), side('8', 'Necrons'), 10, 10, 'draw', 'B'),
    ];
    expect(scalesAgree(twenty)).toEqual({ consistent: true, scale: 20 });
    const mixed = [...twenty, game(side('9', 'Orks'), side('10', 'Necrons'), 60, 40, 'a_win', 'C')];
    expect(scalesAgree(mixed)).toEqual({ consistent: false, scale: null });
    expect(scalesAgree([])).toEqual({ consistent: true, scale: null });
  });
});

describe('cellGames', () => {
  it("lists a cell's games from the row side, in event, round and table order", () => {
    const games = [
      game(side('1', 'Orks'), side('2', 'Necrons'), 15, 5, 'a_win'),
      game(side('5', 'Necrons'), side('6', 'Orks'), 20, 0, 'a_win'),
      game(side('7', 'Orks'), side('8', 'Orks'), 12, 8, 'a_win'),
    ];
    const list = cellGames(games, 'Orks', 'Necrons', noFilter);
    expect(list.map((g) => [g.row.name, g.col.name, g.outcome, g.rowPoints, g.colPoints])).toEqual([
      ['Player 1', 'Player 2', 'win', 15, 5],
      ['Player 6', 'Player 5', 'loss', 0, 20],
    ]);
    const mirror = cellGames(games, 'Orks', 'Orks', noFilter);
    expect(mirror.map((g) => [g.row.name, g.outcome])).toEqual([
      ['Player 7', 'win'],
      ['Player 8', 'loss'],
    ]);
  });
});
