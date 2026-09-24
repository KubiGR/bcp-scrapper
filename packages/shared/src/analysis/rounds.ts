import type { EventAnalysisInput, GameRow, MatchupRow, PlayerRow, TeamRow } from './inputs';
import type { GameView, Outcome, PlayerRef, RoundsResponse, TeamRef, Totals } from './schemas';

/**
 * Bracket rounds: after round 1, rounds whose matchups involve at most half of round 1's teams
 * (a knockout stage after the swiss rounds). Without round-1 matchups there are none.
 */
export function computeBracketRounds(matchups: MatchupRow[]): Set<number> {
  const teamsByRound = new Map<number, Set<string>>();
  for (const matchup of matchups) {
    const teams = teamsByRound.get(matchup.round) ?? new Set<string>();
    teams.add(matchup.teamAId);
    if (matchup.teamBId !== null) teams.add(matchup.teamBId);
    teamsByRound.set(matchup.round, teams);
  }
  const firstRound = teamsByRound.get(1)?.size ?? 0;
  const bracket = new Set<number>();
  for (const [round, teams] of teamsByRound) {
    if (round > 1 && firstRound > 0 && teams.size <= firstRound / 2) bracket.add(round);
  }
  return bracket;
}

/** One side's outcome from both sides' points; a missing opponent is a bye. */
export function outcomeOf(
  own: number | null,
  other: number | null,
  hasOpponent: boolean,
): Outcome | null {
  if (!hasOpponent) return 'bye';
  if (own === null || other === null) return null;
  if (own > other) return 'win';
  if (own < other) return 'loss';
  return 'draw';
}

/** W/L/D (a bye is a win) and summed points over some cells. */
export function tally(
  cells: ({ outcome: Outcome | null; points: number | null } | null)[],
): Totals {
  const totals: Totals = { wins: 0, losses: 0, draws: 0, points: 0 };
  for (const cell of cells) {
    if (!cell) continue;
    if (cell.outcome === 'win' || cell.outcome === 'bye') totals.wins += 1;
    if (cell.outcome === 'loss') totals.losses += 1;
    if (cell.outcome === 'draw') totals.draws += 1;
    totals.points += cell.points ?? 0;
  }
  return totals;
}

/** Distinct rounds of the given rows, ascending. */
export function roundsOf(rows: { round: number }[]): number[] {
  return [...new Set(rows.map((row) => row.round))].sort((a, b) => a - b);
}

export function teamRefOf(teams: Map<string, TeamRow>, id: string): TeamRef {
  return { id, name: teams.get(id)?.name ?? 'Unknown team' };
}

export function playerRefOf(players: Map<string, PlayerRow>, id: string): PlayerRef {
  const player = players.get(id);
  return player
    ? {
        id,
        name: player.name,
        faction: player.faction,
        teamId: player.teamId,
        disposition: player.disposition,
      }
    : { id, name: 'Unknown player', faction: null, teamId: null, disposition: null };
}

export const byId = <T extends { id: string }>(rows: T[]) =>
  new Map(rows.map((row) => [row.id, row]));

const tableKey = (row: { tableNo: number | null; id: string }) =>
  row.tableNo ?? Number.MAX_SAFE_INTEGER;
const byTable = (
  a: { tableNo: number | null; id: string },
  b: { tableNo: number | null; id: string },
) => tableKey(a) - tableKey(b) || a.id.localeCompare(b.id);

/** Every round's team matchups (by table) with their games, plus games under no matchup. */
export function buildRounds({
  teams,
  players,
  matchups,
  games,
}: EventAnalysisInput): RoundsResponse {
  const teamMap = byId(teams);
  const playerMap = byId(players);
  const bracket = computeBracketRounds(matchups);
  const gameView = (game: GameRow): GameView => ({
    id: game.id,
    tableNo: game.tableNo,
    playerA: playerRefOf(playerMap, game.playerAId),
    playerB: game.playerBId === null ? null : playerRefOf(playerMap, game.playerBId),
    gamePointsA: game.gamePointsA,
    gamePointsB: game.gamePointsB,
    vpA: game.vpA,
    vpB: game.vpB,
    firstTurn: game.firstTurn,
    result: game.result,
  });

  const rounds = roundsOf([...matchups, ...games]).map((round) => {
    const roundMatchups = matchups.filter((matchup) => matchup.round === round).sort(byTable);
    const matchupIds = new Set(roundMatchups.map((matchup) => matchup.id));
    const roundGames = games.filter((game) => game.round === round).sort(byTable);
    return {
      round,
      bracket: bracket.has(round),
      matchups: roundMatchups.map((matchup) => ({
        id: matchup.id,
        tableNo: matchup.tableNo,
        teamA: teamRefOf(teamMap, matchup.teamAId),
        teamB: matchup.teamBId === null ? null : teamRefOf(teamMap, matchup.teamBId),
        pointsA: matchup.pointsA,
        pointsB: matchup.pointsB,
        outcomeA: outcomeOf(matchup.pointsA, matchup.pointsB, matchup.teamBId !== null),
        games: roundGames.filter((game) => game.teamMatchupId === matchup.id).map(gameView),
      })),
      games: roundGames
        .filter((game) => game.teamMatchupId === null || !matchupIds.has(game.teamMatchupId))
        .map(gameView),
    };
  });

  return { gamesAvailable: matchups.length === 0 || games.length > 0, rounds };
}
