import { describe, expect, it } from 'vitest';
import {
  cellGames,
  computeFactionMatrix,
  detachmentRows,
  scalesAgree,
  type DispositionFilter,
  type MatchupGame,
  type MatchupSide,
} from './matchups';

const side = (
  id: string,
  faction: string | null,
  disposition: string | null = null,
  detachments: string[] = [],
): MatchupSide => ({
  playerId: id,
  name: `Player ${id}`,
  faction,
  factionGuessed: false,
  disposition,
  detachments,
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
  eventStartDate = '2026-01-01T00:00:00.000Z',
): MatchupGame => ({
  id: `G${(n += 1)}`,
  eventId,
  eventName: `Event ${eventId}`,
  eventStartDate,
  round: 1,
  tableNo: n,
  a,
  b,
  pointsA: pa,
  pointsB: pb,
  result,
});

const noFilter: DispositionFilter = { dispositions: [], side: 'row' };
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

  it('has the same factions as rows and columns without a filter', () => {
    expect(matrix.columns).toEqual(matrix.factions);
  });

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

  it('puts mirrors on the diagonal as games played, with no win rate', () => {
    expect(cell(matrix, 'Orks', 'Orks')).toMatchObject({
      games: 1,
      wins: 1,
      losses: 1,
      winRate: null,
      avgPoints: 10,
    });
  });

  it('leaves out byes, unknown results and players without a faction', () => {
    expect(matrix.games).toBe(4);
    expect(matrix.factions).toEqual(['Necrons', 'Orks']); // alphabetical
    expect(matrix.cells.some((c) => c.row === 'null' || c.col === 'null')).toBe(false);
  });

  it('filters by disposition: the row side, or both sides', () => {
    const rowSide = computeFactionMatrix(games, { dispositions: ['Disruption'], side: 'row' });
    expect(cell(rowSide, 'Orks', 'Necrons')).toMatchObject({ games: 1, draws: 1 }); // player 3
    expect(cell(rowSide, 'Necrons', 'Orks')).toMatchObject({ games: 2, losses: 1, draws: 1 }); // players 2 and 4
    const both = computeFactionMatrix(games, { dispositions: ['Disruption'], side: 'both' });
    expect(both.games).toBe(1); // only players 3 vs 4
    expect(cell(both, 'Orks', 'Necrons')).toMatchObject({ games: 1, draws: 1 });
  });

  it('matches any of several dispositions, per side or on both sides', () => {
    const two = ['disruption ', 'Take and Hold']; // case and spaces don't matter
    const rowSide = computeFactionMatrix(games, { dispositions: two, side: 'row' });
    expect(cell(rowSide, 'Orks', 'Necrons')).toMatchObject({ games: 2 }); // players 1 and 3
    // Both sides: player 1 (Take and Hold) vs 2 (Disruption) now counts too.
    const both = computeFactionMatrix(games, { dispositions: two, side: 'both' });
    expect(both.games).toBe(2);
  });
});

describe('detachment filter', () => {
  const games = [
    game(
      side('1', 'Orks', 'Disruption', ['War Horde']),
      side('2', 'Necrons', 'Disruption', ['Hypercrypt']),
      15,
      5,
      'a_win',
    ),
    game(
      side('3', 'Orks', 'Take and Hold', ['Kult of Speed']),
      side('4', 'Necrons', null, ['War Horde']),
      10,
      10,
      'draw',
    ),
    game(side('5', 'Orks'), side('6', 'Necrons'), 20, 0, 'a_win'), // no lists
  ];

  it('row side: the row player played any listed detachment', () => {
    const m = computeFactionMatrix(games, {
      dispositions: [],
      detachments: ['War Horde'],
      side: 'row',
    });
    expect(cell(m, 'Orks', 'Necrons')?.games).toBe(1);
    expect(cell(m, 'Necrons', 'Orks')?.games).toBe(1);
  });

  it('counts a filtered mirror’s games played, each once', () => {
    const mirrors = [
      game(
        side('1', 'Orks', null, ['War Horde']),
        side('2', 'Orks', null, ['War Horde']),
        10,
        10,
        'draw',
      ),
      game(
        side('3', 'Orks', null, ['War Horde']),
        side('4', 'Orks', null, ['Dread Mob']),
        15,
        5,
        'a_win',
      ),
      game(
        side('5', 'Orks', null, ['Dread Mob']),
        side('6', 'Orks', null, ['Dread Mob']),
        15,
        5,
        'a_win',
      ),
    ];
    const m = computeFactionMatrix(mirrors, {
      dispositions: [],
      detachments: ['War Horde'],
      side: 'row',
    });
    expect(cell(m, 'Orks', 'Orks')?.games).toBe(2);
  });

  it('keeps every opponent as a column when the filter narrows the rows', () => {
    const m = computeFactionMatrix(games, {
      dispositions: [],
      detachments: ['Kult of Speed'],
      side: 'row',
    });
    expect(m.factions).toEqual(['Orks']);
    expect(m.columns).toEqual(['Necrons']);
  });

  it('both sides: each played one of the listed detachments', () => {
    const m = computeFactionMatrix(games, {
      dispositions: [],
      detachments: ['War Horde', 'Hypercrypt'],
      side: 'both',
    });
    expect(m.games).toBe(1);
  });

  it('combines with dispositions (both must match)', () => {
    const m = computeFactionMatrix(games, {
      dispositions: ['Disruption'],
      detachments: ['War Horde'],
      side: 'row',
    });
    expect(cell(m, 'Orks', 'Necrons')?.games).toBe(1);
    expect(cell(m, 'Necrons', 'Orks')).toBeUndefined();
  });

  it('never matches a player without a list', () => {
    const m = computeFactionMatrix(
      [games[2]].filter((g) => g !== undefined),
      { dispositions: [], detachments: ['War Horde'], side: 'row' },
    );
    expect(m.games).toBe(0);
  });
});

describe('detachmentRows', () => {
  const games = [
    game(
      side('1', 'Orks', null, ['War Horde']),
      side('2', 'Necrons', null, ['Hypercrypt']),
      15,
      5,
      'a_win',
    ),
    game(side('3', 'Orks', null, ['War Horde']), side('4', 'Necrons'), 5, 15, 'b_win'),
    game(side('5', 'Necrons'), side('6', 'Orks', null, ['War Horde']), 10, 10, 'draw'),
    game(side('7', 'Orks', null, ['Kult of Speed']), side('8', 'Necrons'), 20, 0, 'a_win'),
    game(side('9', 'Orks'), side('10', 'Necrons'), 0, 20, 'b_win'), // no list
    // A mirror: each Ork side counts in its own detachment's row.
    game(
      side('11', 'Orks', null, ['War Horde']),
      side('12', 'Orks', null, ['Kult of Speed']),
      12,
      8,
      'a_win',
    ),
  ];
  const rows = detachmentRows(games, 'Orks', noFilter);
  const rowOf = (detachment: string) => rows.find((r) => r.detachment === detachment);
  const vs = (detachment: string, col: string) =>
    rowOf(detachment)?.cells.find((c) => c.col === col);

  it('splits a faction’s results by detachment, most games first, leaving out unknown lists', () => {
    expect(rows.map((r) => [r.detachment, r.games])).toEqual([
      ['War Horde', 4],
      ['Kult of Speed', 2],
    ]);
  });

  it('counts wins, draws and losses against each opponent faction', () => {
    expect(vs('War Horde', 'Necrons')).toMatchObject({
      row: 'Orks',
      col: 'Necrons',
      games: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      winRate: 0.5,
      avgPoints: 10,
    });
  });

  it('gives a win rate against the faction itself, each side in its own row', () => {
    expect(vs('War Horde', 'Orks')).toMatchObject({ games: 1, winRate: 1 });
    expect(vs('Kult of Speed', 'Orks')).toMatchObject({ games: 1, winRate: 0 });
  });

  it('counts a detachment’s games against its own faction once each, its win rate from both sides', () => {
    const same = [
      // Each War Horde side counts in the win rate: one win, one loss.
      game(
        side('1', 'Orks', null, ['War Horde']),
        side('2', 'Orks', null, ['War Horde']),
        15,
        5,
        'a_win',
      ),
      game(
        side('3', 'Orks', null, ['War Horde']),
        side('4', 'Orks', null, ['Dread Mob']),
        15,
        5,
        'a_win',
      ),
    ];
    const rows = detachmentRows(same, 'Orks', noFilter);
    expect(rows.find((r) => r.detachment === 'War Horde')?.cells).toEqual([
      expect.objectContaining({ col: 'Orks', games: 2, wins: 2, losses: 1, winRate: 2 / 3 }),
    ]);
  });

  it('counts a list with two detachments in both rows', () => {
    const two = [
      game(
        side('1', 'Orks', null, ['War Horde', 'Dread Mob']),
        side('2', 'Necrons'),
        15,
        5,
        'a_win',
      ),
    ];
    expect(detachmentRows(two, 'Orks', noFilter).map((r) => r.detachment)).toEqual([
      'Dread Mob',
      'War Horde',
    ]);
  });

  it('keeps to the filter', () => {
    const filtered = detachmentRows(games, 'Orks', {
      dispositions: [],
      detachments: ['Kult of Speed'],
      side: 'row',
    });
    expect(filtered.map((r) => r.detachment)).toEqual(['Kult of Speed']);
  });
});

describe('allegiance-only factions', () => {
  it('leaves out games where a side only picked an allegiance, not a faction', () => {
    const generic = [
      'Chaos',
      'Xenos',
      'Imperium',
      'Forces of the Imperium',
      'Forces of the Hive Mind',
      ' chaos ',
    ];
    const games = [
      game(side('1', 'Orks'), side('2', 'Necrons'), 15, 5, 'a_win'),
      ...generic.map((faction, i) =>
        game(side(`g${i}`, faction), side(`o${i}`, 'Orks'), 15, 5, 'a_win'),
      ),
    ];
    const matrix = computeFactionMatrix(games, noFilter);
    expect(matrix.factions).toEqual(['Necrons', 'Orks']);
    expect(cell(matrix, 'Orks', 'Necrons')?.games).toBe(1);
  });

  it('keeps real factions whose names contain an allegiance', () => {
    const games = [game(side('1', 'Chaos Daemons'), side('2', 'Imperial Knights'), 15, 5, 'a_win')];
    expect(computeFactionMatrix(games, noFilter).factions).toEqual([
      'Chaos Daemons',
      'Imperial Knights',
    ]);
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
  it('lists the newest event’s games first, whatever the events are called', () => {
    const orks = side('1', 'Orks');
    const necrons = side('2', 'Necrons');
    const games = [
      game(orks, necrons, 15, 5, 'a_win', 'A-OLD', '2026-03-01T00:00:00.000Z'),
      game(orks, necrons, 15, 5, 'a_win', 'Z-NEW', '2026-06-01T00:00:00.000Z'),
    ];
    expect(cellGames(games, 'Orks', 'Necrons', noFilter).map((g) => g.eventId)).toEqual([
      'Z-NEW',
      'A-OLD',
    ]);
  });

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
    expect(mirror.map((g) => [g.row.name, g.outcome])).toEqual([['Player 7', 'win']]);
  });

  it('lists a mirror game once, from player A’s side', () => {
    const games = [game(side('7', 'Orks'), side('8', 'Orks'), 12, 8, 'a_win')];
    const mirror = cellGames(games, 'Orks', 'Orks', noFilter);
    expect(mirror).toHaveLength(1);
    expect(mirror[0]).toMatchObject({ row: { name: 'Player 7' }, col: { name: 'Player 8' } });
  });
});
