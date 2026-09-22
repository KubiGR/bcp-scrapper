import type { Game, TeamMatchup } from '@bcp/shared';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import { games, teamMatchups } from '../db/schema';
import { excludedColumns } from './upsert';

export async function upsertTeamMatchups(db: Db, list: Fetched<TeamMatchup>[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(teamMatchups)
    .values(
      list.map((matchup) => ({
        id: matchup.bcpId,
        eventId: matchup.eventBcpId,
        round: matchup.round,
        tableNo: matchup.tableNo,
        teamAId: matchup.teamABcpId,
        teamBId: matchup.teamBBcpId,
        pointsA: matchup.pointsA,
        pointsB: matchup.pointsB,
        raw: matchup.raw,
      })),
    )
    .onConflictDoUpdate({
      target: teamMatchups.id,
      set: excludedColumns(teamMatchups, ['id', 'createdAt']),
    });
}

export async function upsertGames(db: Db, list: Fetched<Game>[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(games)
    .values(
      list.map((game) => ({
        id: game.bcpId,
        eventId: game.eventBcpId,
        round: game.round,
        tableNo: game.tableNo,
        teamMatchupId: game.teamMatchupBcpId,
        playerAId: game.playerABcpId,
        playerBId: game.playerBBcpId,
        vpA: game.vpA,
        vpB: game.vpB,
        primaryA: game.primaryA,
        primaryB: game.primaryB,
        secondaryA: game.secondaryA,
        secondaryB: game.secondaryB,
        gamePointsA: game.gamePointsA,
        gamePointsB: game.gamePointsB,
        firstTurn: game.firstTurn,
        result: game.result,
        raw: game.raw,
      })),
    )
    .onConflictDoUpdate({ target: games.id, set: excludedColumns(games, ['id', 'createdAt']) });
}
