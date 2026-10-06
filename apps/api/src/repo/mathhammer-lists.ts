import type { StoredList } from '@bcp/shared';
import { desc, ilike, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyLists, events, players } from '../db/schema';
import { armyRules } from './detachment-links';
import { storedCurrentList } from './lists';

/** Stored lists whose player or event name contains `search` (case ignored), newest first. */
export async function searchStoredLists(db: Db, search: string): Promise<StoredList[]> {
  const wanted = search.trim();
  if (wanted.length < 2) return [];
  const pattern = `%${wanted.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const [rows, rules] = await Promise.all([
    db
      .select({
        playerId: players.id,
        player: players.name,
        event: events.name,
        bcpFaction: players.faction,
        parsedArmy: armyLists.parsedArmy,
        detachments: armyLists.detachments,
        date: events.startDate,
      })
      .from(players)
      .innerJoin(armyLists, storedCurrentList)
      .innerJoin(events, sql`${events.id} = ${players.eventId}`)
      .where(or(ilike(players.name, pattern), ilike(events.name, pattern)))
      .orderBy(desc(events.startDate), players.name)
      .limit(20),
    armyRules(db),
  ]);
  return rows.map((row) => ({
    playerId: row.playerId,
    player: row.player,
    event: row.event,
    faction: rules.army(row.bcpFaction, row.parsedArmy, row.detachments).faction,
    date: row.date.toISOString(),
  }));
}
