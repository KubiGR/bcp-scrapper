import type { Game, TeamMatchup } from '@bcp/shared';
import { and, count, eq, notInArray } from 'drizzle-orm';
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

export interface RoundPairings {
  teamMatchups: Fetched<TeamMatchup>[];
  games: Fetched<Game>[];
}

/**
 * Makes one stored round match what BCP returned: upserts the given rows, then deletes the
 * round's rows BCP no longer lists. An empty list deletes nothing, since the round may be
 * unplayed or BCP may have answered with a transient empty page.
 */
export async function replaceRoundPairings(
  db: Db,
  eventId: string,
  round: number,
  pairings: RoundPairings,
): Promise<void> {
  await db.transaction(async (tx) => {
    await upsertTeamMatchups(tx, pairings.teamMatchups);
    await upsertGames(tx, pairings.games);
    if (pairings.teamMatchups.length > 0) {
      const keep = pairings.teamMatchups.map((matchup) => matchup.bcpId);
      await tx
        .delete(teamMatchups)
        .where(
          and(
            eq(teamMatchups.eventId, eventId),
            eq(teamMatchups.round, round),
            notInArray(teamMatchups.id, keep),
          ),
        );
    }
    if (pairings.games.length > 0) {
      const keep = pairings.games.map((game) => game.bcpId);
      await tx
        .delete(games)
        .where(and(eq(games.eventId, eventId), eq(games.round, round), notInArray(games.id, keep)));
    }
  });
}

/** How much of an event's pairings is stored: distinct rounds, team matchups and games. */
export async function storedPairingsSummary(
  db: Db,
  eventId: string,
): Promise<{ rounds: number; matchups: number; games: number }> {
  const [matchupRounds, gameRounds] = await Promise.all([
    db
      .select({ round: teamMatchups.round, n: count() })
      .from(teamMatchups)
      .where(eq(teamMatchups.eventId, eventId))
      .groupBy(teamMatchups.round),
    db
      .select({ round: games.round, n: count() })
      .from(games)
      .where(eq(games.eventId, eventId))
      .groupBy(games.round),
  ]);
  const rounds = new Set([...matchupRounds, ...gameRounds].map((row) => row.round));
  const sum = (rows: { n: number }[]) => rows.reduce((total, row) => total + row.n, 0);
  return { rounds: rounds.size, matchups: sum(matchupRounds), games: sum(gameRounds) };
}
