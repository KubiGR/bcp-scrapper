import type { PairingChip, PairingRating, PairingRosterPlayer } from '@bcp/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyLists, pairingRatings, players, teams } from '../db/schema';
import { armyRules } from './detachment-links';
import { storedCurrentList } from './lists';

export async function eventTeams(db: Db, eventId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.eventId, eventId))
    .orderBy(asc(teams.name));
}

/** The team's players who haven't dropped, with their army, detachments and list. */
export async function roster(
  db: Db,
  eventId: string,
  teamId: string,
): Promise<PairingRosterPlayer[]> {
  const rules = await armyRules(db);
  const rows = await db
    .select({
      id: players.id,
      name: players.name,
      faction: players.faction,
      parsedArmy: armyLists.parsedArmy,
      detachments: armyLists.detachments,
      list: armyLists.text,
    })
    .from(players)
    .leftJoin(armyLists, storedCurrentList)
    .where(
      and(eq(players.eventId, eventId), eq(players.teamId, teamId), eq(players.dropped, false)),
    )
    .orderBy(asc(players.name));
  return rows.map((row) => {
    const army = rules.army(row.faction, row.parsedArmy, row.detachments ?? []);
    return {
      id: row.id,
      name: row.name,
      faction: army.faction,
      detachments: rules.detachments(army.faction, row.detachments ?? []),
      list: row.list ?? null,
    };
  });
}

export async function ratings(
  db: Db,
  eventId: string,
  teamId: string,
  opponentTeamId: string,
): Promise<PairingRating[]> {
  return db
    .select({
      playerId: pairingRatings.playerId,
      opponentPlayerId: pairingRatings.opponentPlayerId,
      chip: pairingRatings.chip,
    })
    .from(pairingRatings)
    .where(
      and(
        eq(pairingRatings.eventId, eventId),
        eq(pairingRatings.teamId, teamId),
        eq(pairingRatings.opponentTeamId, opponentTeamId),
      ),
    );
}

export async function saveRating(
  db: Db,
  key: {
    eventId: string;
    teamId: string;
    opponentTeamId: string;
    playerId: string;
    opponentPlayerId: string;
  },
  chip: PairingChip | null,
): Promise<void> {
  if (chip === null) {
    await db
      .delete(pairingRatings)
      .where(
        and(
          eq(pairingRatings.eventId, key.eventId),
          eq(pairingRatings.teamId, key.teamId),
          eq(pairingRatings.opponentTeamId, key.opponentTeamId),
          eq(pairingRatings.playerId, key.playerId),
          eq(pairingRatings.opponentPlayerId, key.opponentPlayerId),
        ),
      );
    return;
  }
  await db
    .insert(pairingRatings)
    .values({ ...key, chip })
    .onConflictDoUpdate({
      target: [
        pairingRatings.eventId,
        pairingRatings.teamId,
        pairingRatings.opponentTeamId,
        pairingRatings.playerId,
        pairingRatings.opponentPlayerId,
      ],
      set: { chip, updatedAt: new Date() },
    });
}

/** Several ratings for one team pairing (a pasted sheet), all or none. */
export async function saveRatings(
  db: Db,
  key: { eventId: string; teamId: string; opponentTeamId: string },
  list: { playerId: string; opponentPlayerId: string; chip: PairingChip | null }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const { playerId, opponentPlayerId, chip } of list) {
      await saveRating(tx, { ...key, playerId, opponentPlayerId }, chip);
    }
  });
}
