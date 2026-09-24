import type { EventAnalysisInput, GameRow } from './inputs';
import { byId, computeBracketRounds, playerRefOf, roundsOf, tally } from './rounds';
import type { Outcome, PlayerRound, TeamDetailResponse, TeamPlayerRow, Totals } from './schemas';

function outcomeFor(game: GameRow, isA: boolean): Outcome | null {
  if (game.playerBId === null) return 'bye';
  if (game.result === null) return null;
  if (game.result === 'draw') return 'draw';
  return (game.result === 'a_win') === isA ? 'win' : 'loss';
}

/**
 * A team's players, each with their game per round (opponent, outcome, game points, VP) and
 * totals, ordered by total game points; null when the team isn't in the input.
 */
export function computeTeamContribution(
  input: EventAnalysisInput,
  teamId: string,
): TeamDetailResponse | null {
  const team = input.teams.find((candidate) => candidate.id === teamId);
  if (!team) return null;
  const playerMap = byId(input.players);
  const bracket = computeBracketRounds(input.matchups);
  const rounds = roundsOf([...input.matchups, ...input.games]);

  const rows = input.players
    .filter((player) => player.teamId === teamId)
    .map((player): TeamPlayerRow => {
      const perRound = rounds.map((round): PlayerRound | null => {
        const game = input.games.find(
          (candidate) =>
            candidate.round === round &&
            (candidate.playerAId === player.id || candidate.playerBId === player.id),
        );
        if (!game) return null;
        const isA = game.playerAId === player.id;
        const opponentId = isA ? game.playerBId : game.playerAId;
        return {
          round,
          opponent: opponentId === null ? null : playerRefOf(playerMap, opponentId),
          outcome: outcomeFor(game, isA),
          gamePoints: isA ? game.gamePointsA : game.gamePointsB,
          opponentGamePoints: isA ? game.gamePointsB : game.gamePointsA,
          vp: isA ? game.vpA : game.vpB,
          opponentVp: isA ? game.vpB : game.vpA,
        };
      });
      return {
        player: playerRefOf(playerMap, player.id),
        perRound,
        totals: tally(
          perRound.map((cell) => cell && { outcome: cell.outcome, points: cell.gamePoints }),
        ),
      };
    })
    .sort(
      (a, b) => b.totals.points - a.totals.points || a.player.name.localeCompare(b.player.name),
    );

  const totals = rows.reduce<Totals>(
    (sum, row) => ({
      wins: sum.wins + row.totals.wins,
      losses: sum.losses + row.totals.losses,
      draws: sum.draws + row.totals.draws,
      points: sum.points + row.totals.points,
    }),
    { wins: 0, losses: 0, draws: 0, points: 0 },
  );

  return {
    team: { id: team.id, name: team.name, placing: team.placing },
    rounds: rounds.map((round) => ({ round, bracket: bracket.has(round) })),
    players: rows,
    totals,
  };
}
