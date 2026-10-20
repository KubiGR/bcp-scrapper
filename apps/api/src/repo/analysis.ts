import { knownDisposition, type EventAnalysisInput } from '@bcp/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyRules } from './detachment-links';
import { armyLists, games, players, teamMatchups, teams } from '../db/schema';
import { storedCurrentList } from './lists';

/** Everything the analysis functions need about one event, as plain rows. */
export async function loadEventAnalysis(db: Db, eventId: string): Promise<EventAnalysisInput> {
  const rules = await armyRules(db);
  const [teamRows, playerRows, matchupRows, gameRows] = await Promise.all([
    db
      .select({ id: teams.id, name: teams.name, placing: teams.placing })
      .from(teams)
      .where(eq(teams.eventId, eventId)),
    db
      .select({
        id: players.id,
        name: players.name,
        userId: players.bcpUserId,
        faction: players.faction,
        teamId: players.teamId,
        disposition: players.disposition,
        parsedArmy: armyLists.parsedArmy,
        detachments: armyLists.detachments,
        parsedDisposition: armyLists.parsedDisposition,
      })
      .from(players)
      .leftJoin(armyLists, storedCurrentList)
      .where(eq(players.eventId, eventId)),
    db
      .select({
        id: teamMatchups.id,
        round: teamMatchups.round,
        tableNo: teamMatchups.tableNo,
        teamAId: teamMatchups.teamAId,
        teamBId: teamMatchups.teamBId,
        pointsA: teamMatchups.pointsA,
        pointsB: teamMatchups.pointsB,
      })
      .from(teamMatchups)
      .where(eq(teamMatchups.eventId, eventId)),
    db
      .select({
        id: games.id,
        round: games.round,
        tableNo: games.tableNo,
        teamMatchupId: games.teamMatchupId,
        playerAId: games.playerAId,
        playerBId: games.playerBId,
        gamePointsA: games.gamePointsA,
        gamePointsB: games.gamePointsB,
        vpA: games.vpA,
        vpB: games.vpB,
        firstTurn: games.firstTurn,
        result: games.result,
      })
      .from(games)
      .where(eq(games.eventId, eventId)),
  ]);
  const playerInputs = playerRows.map((row) => {
    const army = rules.army(row.faction, row.parsedArmy, row.detachments ?? []);
    return {
      id: row.id,
      name: row.name,
      userId: row.userId,
      ...army,
      teamId: row.teamId,
      disposition: row.disposition ?? knownDisposition(row.parsedDisposition),
      // Detachment unknown when one isn't English or is outside the army's BSData list.
      detachments: rules.detachments(army.faction, row.detachments ?? []),
    };
  });
  return { teams: teamRows, players: playerInputs, matchups: matchupRows, games: gameRows };
}
