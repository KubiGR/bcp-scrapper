import type { EventAnalysisInput } from './inputs';
import { byId, computeBracketRounds, outcomeOf, roundsOf, tally, teamRefOf } from './rounds';
import type { StandingCell, StandingRow, StandingsResponse } from './schemas';

const placingKey = (row: StandingRow) => row.placing ?? Number.MAX_SAFE_INTEGER;

/**
 * Teams with their points and outcome per round, ordered by BCP placing, then total points, then
 * name. A bye counts as a win; a round without a matchup for the team is null.
 */
export function computeStandings({ teams, matchups }: EventAnalysisInput): StandingsResponse {
  const teamMap = byId(teams);
  const bracket = computeBracketRounds(matchups);
  const rounds = roundsOf(matchups);

  const rows = teams.map((team): StandingRow => {
    const perRound = rounds.map((round): StandingCell | null => {
      const matchup = matchups.find(
        (candidate) =>
          candidate.round === round &&
          (candidate.teamAId === team.id || candidate.teamBId === team.id),
      );
      if (!matchup) return null;
      const isA = matchup.teamAId === team.id;
      const own = isA ? matchup.pointsA : matchup.pointsB;
      const other = isA ? matchup.pointsB : matchup.pointsA;
      const opponentId = isA ? matchup.teamBId : matchup.teamAId;
      return {
        round,
        points: own,
        outcome: outcomeOf(own, other, opponentId !== null),
        opponent: opponentId === null ? null : teamRefOf(teamMap, opponentId),
      };
    });
    return {
      team: { id: team.id, name: team.name },
      placing: team.placing,
      perRound,
      totals: tally(perRound),
    };
  });

  rows.sort(
    (a, b) =>
      placingKey(a) - placingKey(b) ||
      b.totals.points - a.totals.points ||
      a.team.name.localeCompare(b.team.name),
  );
  return { rounds: rounds.map((round) => ({ round, bracket: bracket.has(round) })), teams: rows };
}
