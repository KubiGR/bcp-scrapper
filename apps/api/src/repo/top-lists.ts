import {
  isBigEvent,
  qualifiesForMaxLosses,
  TOP_LISTS_LIMIT,
  type EventSizeRule,
  type PlayerSearchQuery,
  type PlayerSearchResponse,
  type TopListPlayer,
} from '@bcp/shared';
import { and, desc, gte, inArray, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, players } from '../db/schema';
import { listEventPlayers } from './participants';

const DAY_MS = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const anyOf = (chosen: string[], value: string | null) =>
  chosen.length === 0 || (value !== null && chosen.includes(value));

/**
 * Players of big events starting in the range (default: the last 90 days) who went X-n or better,
 * filtered by faction (the guessed army counts), disposition and detachment (only read lists).
 * Newest event first, then fewest losses, then most wins; at most TOP_LISTS_LIMIT.
 */
export async function searchTopLists(
  db: Db,
  query: PlayerSearchQuery,
  rule: EventSizeRule,
  today: Date,
): Promise<PlayerSearchResponse> {
  const to = query.to ?? isoDay(today);
  const from = query.from ?? isoDay(new Date(today.getTime() - 90 * DAY_MS));
  const end = new Date(`${to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const inRange = (
    await db
      .select()
      .from(events)
      .where(
        and(gte(events.startDate, new Date(`${from}T00:00:00.000Z`)), lt(events.startDate, end)),
      )
      .orderBy(desc(events.startDate), events.id)
  ).filter((event) => isBigEvent(event, rule));

  const ids = inRange.map((event) => event.id);
  const loadedIds = new Set(
    ids.length === 0
      ? []
      : (
          await db
            .selectDistinct({ eventId: players.eventId })
            .from(players)
            .where(inArray(players.eventId, ids))
        ).map((row) => row.eventId),
  );

  const found: TopListPlayer[] = [];
  for (const event of inRange) {
    if (!loadedIds.has(event.id)) continue;
    for (const player of await listEventPlayers(db, event.id)) {
      if (
        qualifiesForMaxLosses(player, query.maxLosses) &&
        anyOf(query.factions, player.faction) &&
        anyOf(query.dispositions, player.disposition) &&
        (query.detachments.length === 0 ||
          player.detachments.some((name) => query.detachments.includes(name)))
      ) {
        found.push({
          ...player,
          eventId: event.id,
          eventName: event.name,
          eventStartDate: event.startDate.toISOString(),
        });
      }
    }
  }
  found.sort(
    (a, b) =>
      b.eventStartDate.localeCompare(a.eventStartDate) ||
      a.losses - b.losses ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name),
  );
  return {
    players: found.slice(0, TOP_LISTS_LIMIT),
    truncated: found.length > TOP_LISTS_LIMIT,
    eventsInRange: inRange.length,
    eventsLoaded: loadedIds.size,
  };
}
