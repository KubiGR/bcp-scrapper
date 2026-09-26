import {
  knownDisposition,
  resolveFaction,
  type EventCounts,
  type EventPlayer,
  type Player,
  type Team,
} from '@bcp/shared';
import { and, count, eq, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import { armyLists, players, teams } from '../db/schema';
import { isRetryableFailure, latestQueueRowsByPlayer, type LatestQueueRow } from './fetch-queue';
import { findPlayersMissingLists, isMissingList, storedCurrentList } from './lists';
import { excludedColumns } from './upsert';

export async function upsertTeams(db: Db, list: Fetched<Team>[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(teams)
    .values(
      list.map((team) => ({
        id: team.bcpId,
        eventId: team.eventBcpId,
        name: team.name,
        placing: team.placing,
        roundPoints: team.roundPoints,
        raw: team.raw,
      })),
    )
    .onConflictDoUpdate({ target: teams.id, set: excludedColumns(teams, ['id', 'createdAt']) });
}

export async function upsertPlayers(db: Db, list: Fetched<Player>[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(players)
    .values(
      list.map((player) => ({
        id: player.bcpId,
        eventId: player.eventBcpId,
        teamId: player.teamBcpId,
        name: player.name,
        faction: player.faction,
        parentFaction: player.parentFaction,
        placing: player.placing,
        wins: player.wins,
        losses: player.losses,
        draws: player.draws,
        dropped: player.dropped,
        listId: player.listBcpId,
        disposition: player.disposition,
        raw: player.raw,
      })),
    )
    .onConflictDoUpdate({ target: players.id, set: excludedColumns(players, ['id', 'createdAt']) });
}

/**
 * Makes an event's stored teams match BCP's active list: upserts it, then deletes the event's
 * teams it no longer contains. An empty list deletes nothing (BCP may have hiccuped).
 */
export async function replaceEventTeams(
  db: Db,
  eventId: string,
  list: Fetched<Team>[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await upsertTeams(tx, list);
    if (list.length === 0) return;
    const keep = list.map((team) => team.bcpId);
    await tx.delete(teams).where(and(eq(teams.eventId, eventId), notInArray(teams.id, keep)));
  });
}

/**
 * Like replaceEventTeams, for players. Deleting a player also deletes its stored army list.
 */
export async function replaceEventPlayers(
  db: Db,
  eventId: string,
  list: Fetched<Player>[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await upsertPlayers(tx, list);
    if (list.length === 0) return;
    const keep = list.map((player) => player.bcpId);
    await tx.delete(players).where(and(eq(players.eventId, eventId), notInArray(players.id, keep)));
  });
}

/** A stored current list wins; otherwise the player's newest queue request; otherwise BCP's list id. */
export function listStateOf(
  bcpListId: string | null,
  storedListId: string | null,
  queued: LatestQueueRow | undefined,
): Pick<EventPlayer, 'listStatus' | 'listError' | 'listErrorCode'> {
  const none = { listError: null, listErrorCode: null };
  if (storedListId !== null) return { listStatus: 'fetched', ...none };
  if (queued?.status === 'queued' || queued?.status === 'fetching') {
    return { listStatus: queued.status, ...none };
  }
  if (queued?.status === 'failed') {
    return { listStatus: 'failed', listError: queued.error, listErrorCode: queued.errorCode };
  }
  return { listStatus: bcpListId === null ? 'none' : 'available', ...none };
}

/** An event's players, best placing first (unplaced last, by name), with team and list state. */
export async function listEventPlayers(db: Db, eventId: string): Promise<EventPlayer[]> {
  const [rows, queue] = await Promise.all([
    db
      .select({
        player: players,
        teamName: teams.name,
        teamPlacing: teams.placing,
        storedListId: armyLists.listId,
        parsedArmy: armyLists.parsedArmy,
        detachments: armyLists.detachments,
        parsedDisposition: armyLists.parsedDisposition,
      })
      .from(players)
      .leftJoin(teams, eq(teams.id, players.teamId))
      // Only the player's current BCP list counts: one BCP replaced since is "available" again.
      .leftJoin(armyLists, storedCurrentList)
      .where(eq(players.eventId, eventId))
      .orderBy(sql`${players.placing} asc nulls last`, players.name),
    latestQueueRowsByPlayer(db, eventId),
  ]);
  return rows.map((row) => {
    const { player, teamName, teamPlacing, storedListId } = row;
    return {
      bcpId: player.id,
      name: player.name,
      teamName,
      teamId: player.teamId,
      teamPlacing,
      ...resolveFaction(player.faction, row.parsedArmy),
      parentFaction: player.parentFaction,
      placing: player.placing,
      wins: player.wins,
      losses: player.losses,
      draws: player.draws,
      dropped: player.dropped,
      disposition: player.disposition ?? knownDisposition(row.parsedDisposition),
      detachments: row.detachments ?? [],
      ...listStateOf(player.listId, storedListId, queue.get(player.id)),
    };
  });
}

export async function countEventParticipants(db: Db, eventId: string): Promise<EventCounts> {
  const ofEvent = eq(players.eventId, eventId);
  const [playerCount, teamCount, listsAvailable, lists, queue, missing] = await Promise.all([
    db.$count(players, ofEvent),
    db.$count(teams, eq(teams.eventId, eventId)),
    db.$count(players, and(ofEvent, isNotNull(players.listId))),
    db
      .select({
        fetched: count(armyLists.playerId),
        missing: sql<number>`count(*) filter (where ${isMissingList})`.mapWith(Number),
      })
      .from(players)
      .leftJoin(armyLists, storedCurrentList)
      .where(ofEvent),
    latestQueueRowsByPlayer(db, eventId),
    findPlayersMissingLists(db, eventId),
  ]);
  return {
    players: playerCount,
    teams: teamCount,
    listsAvailable,
    listsFetched: lists[0]?.fetched ?? 0,
    listsMissing: lists[0]?.missing ?? 0,
    listsQueued: [...queue.values()].filter(
      (row) => row.status === 'queued' || row.status === 'fetching',
    ).length,
    // "No list on BCP" is final, so it isn't counted: nothing can be retried about it.
    listsFailed: [...queue.entries()].filter(
      ([playerId, row]) => isRetryableFailure(row) && missing.some((m) => m.playerId === playerId),
    ).length,
  };
}
