import type {
  EventListItem,
  EventListQuery,
  EventListResponse,
  EventSizeRule,
  EventSummary,
} from '@bcp/shared';
import { and, asc, desc, eq, gte, ilike, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import { events } from '../db/schema';
import { fieldElos } from './field-elo';
import { excludedColumns } from './upsert';

export type EventRow = typeof events.$inferSelect;

function toRow(event: EventSummary) {
  return {
    id: event.bcpId,
    name: event.name,
    startDate: new Date(event.startDate),
    endDate: event.endDate ? new Date(event.endDate) : null,
    country: event.country,
    city: event.city,
    playerCount: event.playerCount,
    teamCount: event.teamCount,
    isTeamEvent: event.isTeamEvent,
    isOnline: event.isOnline,
    roundCount: event.roundCount,
    ended: event.ended,
    hideLists: event.hideLists,
  };
}

/**
 * Catalogue results: never overwrite what event detail knows better (raw detail), but fill
 * `city`/`teamCount` from the search result when they're still unset (detail wins once it runs).
 */
export async function upsertEventSummaries(db: Db, list: Fetched<EventSummary>[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(events)
    .values(list.map((event) => ({ ...toRow(event), rawSummary: event.raw })))
    .onConflictDoUpdate({
      target: events.id,
      set: {
        ...excludedColumns(events, [
          'id',
          'createdAt',
          'city',
          'teamCount',
          'rawDetail',
          'lastSyncedAt',
          // Our own bookkeeping, not BCP's: a re-save must not reset it.
          'pairingsSyncedAt',
        ]),
        city: sql`coalesce(${events.city}, excluded.city)`,
        teamCount: sql`coalesce(${events.teamCount}, excluded.team_count)`,
      },
    });
}

export async function upsertEventDetail(db: Db, event: Fetched<EventSummary>): Promise<void> {
  await db
    .insert(events)
    .values({ ...toRow(event), rawDetail: event.raw })
    .onConflictDoUpdate({
      target: events.id,
      set: excludedColumns(events, [
        'id',
        'createdAt',
        'rawSummary',
        'lastSyncedAt',
        'pairingsSyncedAt',
      ]),
    });
}

export async function markEventSynced(db: Db, eventId: string, at = new Date()): Promise<void> {
  await db.update(events).set({ lastSyncedAt: at }).where(eq(events.id, eventId));
}

export async function findEvent(db: Db, id: string): Promise<EventRow | undefined> {
  const [row] = await db.select().from(events).where(eq(events.id, id));
  return row;
}

/**
 * Deletes every stored event that isn't big under `rule` (foreign keys cascade to its teams,
 * players, army lists, team matchups, games and fetch-queue jobs; `sync_runs` has no event FK
 * and keeps its history). An event opened directly by URL is stored for that session but removed
 * again here at the next startup if it's small.
 */
export async function deleteSmallEvents(db: Db, rule: EventSizeRule): Promise<number> {
  const rows = await db
    .delete(events)
    .where(or(lt(events.roundCount, rule.minRounds), lt(events.playerCount, rule.minPlayers)))
    .returning({ id: events.id });
  return rows.length;
}

/** An event for the API; `fieldElo` is its field strength (see `fieldElos`), unrounded. */
export function toEventListItem(row: EventRow, fieldElo: number | undefined): EventListItem {
  return {
    bcpId: row.id,
    name: row.name,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate?.toISOString() ?? null,
    country: row.country,
    city: row.city,
    playerCount: row.playerCount,
    teamCount: row.teamCount,
    isTeamEvent: row.isTeamEvent,
    isOnline: row.isOnline,
    roundCount: row.roundCount,
    ended: row.ended,
    hideLists: row.hideLists,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    fieldElo: fieldElo === undefined ? null : Math.round(fieldElo),
  };
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

const startOfDay = (date: string) => new Date(`${date}T00:00:00Z`);

function startOfNextDay(date: string): Date {
  const next = startOfDay(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export async function searchEvents(
  db: Db,
  query: EventListQuery,
  rule: EventSizeRule,
): Promise<EventListResponse> {
  const filters: SQL[] = [
    gte(events.roundCount, rule.minRounds),
    gte(events.playerCount, rule.minPlayers),
  ];
  if (query.from) filters.push(gte(events.startDate, startOfDay(query.from)));
  if (query.to) filters.push(lt(events.startDate, startOfNextDay(query.to)));
  if (query.country) filters.push(ilike(events.country, escapeLike(query.country)));
  if (query.minPlayers > 0) filters.push(gte(events.playerCount, query.minPlayers));
  if (query.maxPlayers !== undefined) filters.push(lte(events.playerCount, query.maxPlayers));
  if (query.type !== 'all') filters.push(eq(events.isTeamEvent, query.type === 'teams'));
  if (query.q) filters.push(ilike(events.name, `%${escapeLike(query.q)}%`));
  const where = and(...filters);

  // Ties fall back to newest first, then id, so paging is stable. By date, events come a week
  // (Monday to Sunday, UTC) at a time, the biggest first within each week.
  const direction = query.dir === 'asc' ? asc : desc;
  const week = sql`date_trunc('week', ${events.startDate} at time zone 'UTC')`;
  const order =
    query.sort === 'players'
      ? [direction(events.playerCount), desc(events.startDate), events.id]
      : [direction(week), desc(events.playerCount), direction(events.startDate), events.id];

  const [rows, total] = await Promise.all([
    db
      .select()
      .from(events)
      .where(where)
      .orderBy(...order)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.$count(events, where),
  ]);
  const strength = await fieldElos(
    db,
    rows.map((row) => row.id),
  );
  return {
    items: rows.map((row) => toEventListItem(row, strength.get(row.id))),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
