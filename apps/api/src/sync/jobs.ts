import { isBigEvent, type EventSizeRule, type SyncRequest } from '@bcp/shared';
import { PageCursors, type FetchedEvent, type TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { EventBlockedError, NotFoundError } from '../errors';
import type { Logger } from '../logger';
import {
  findEvent,
  isEventBlocked,
  markEventRemovedFromBcp,
  markEventSynced,
  upsertEventDetail,
  upsertEventSummaries,
  type EventRow,
} from '../repo/events';
import { replaceEventPlayers, replaceEventTeams } from '../repo/participants';

export interface Progress {
  setTotal(total: number): Promise<void>;
  succeeded(count?: number): Promise<void>;
  failed(count?: number): Promise<void>;
}

export interface JobContext {
  db: Db;
  source: TournamentSource;
  progress: Progress;
  logger: Logger;
  /** BCP's search can't filter by size, so pages are read in full; only big events are stored. */
  eventRule: EventSizeRule;
}

type RequestOf<K extends SyncRequest['kind']> = Extract<SyncRequest, { kind: K }>;

export function runJob(ctx: JobContext, request: SyncRequest): Promise<void> {
  switch (request.kind) {
    case 'catalog':
      return syncCatalog(ctx, request);
    case 'event':
      return syncEventJob(ctx, request);
  }
}

/** Every 40k event in the range, page by page. Only big events are stored; progress counts those. */
async function syncCatalog(ctx: JobContext, { from, to }: RequestOf<'catalog'>): Promise<void> {
  const seen = new PageCursors('/v1/events');
  let cursor: string | null = null;
  do {
    const page = await ctx.source.listEvents({ from, to }, cursor);
    const big: FetchedEvent[] = [];
    for (const event of page.items) {
      if (event.roundCount < ctx.eventRule.minRounds) continue;
      const counted = await withCataloguePlayerCount(ctx, event);
      if (isBigEvent(counted, ctx.eventRule)) big.push(counted);
    }
    await upsertEventSummaries(ctx.db, big);
    await ctx.progress.succeeded(big.length);
    cursor = seen.next(page.nextCursor);
  } while (cursor !== null);
}

async function withCataloguePlayerCount(
  ctx: JobContext,
  event: FetchedEvent,
): Promise<FetchedEvent> {
  if (!event.playerCountMissing || (await isEventBlocked(ctx.db, event.bcpId))) return event;
  try {
    const roster = await ctx.source.getPlayers(event.bcpId, { withPlacings: false });
    return { ...event, playerCount: roster.length };
  } catch (error) {
    // BCP can leave a search entry for an event whose roster is no longer available.
    if (error instanceof NotFoundError) return event;
    throw error;
  }
}

/**
 * Event detail, teams (team events only) and players. Drops teams and players BCP removed. When
 * BCP no longer has an event we stored (404), it keeps its data and is marked removed instead.
 * An event an admin blocked is refused: BCP isn't asked.
 */
export async function syncEvent(
  deps: Pick<JobContext, 'db' | 'source'>,
  eventId: string,
): Promise<EventRow> {
  if (await isEventBlocked(deps.db, eventId)) throw new EventBlockedError(eventId);
  let event;
  try {
    event = await deps.source.getEvent(eventId);
  } catch (error) {
    const stored = error instanceof NotFoundError ? await findEvent(deps.db, eventId) : undefined;
    if (!stored) throw error;
    const at = new Date();
    await markEventRemovedFromBcp(deps.db, eventId, at);
    return { ...stored, removedFromBcpAt: at };
  }
  const roster = event.playerCountMissing ? await deps.source.getPlayers(eventId) : undefined;
  let playerCount = event.playerCount;
  if (roster) {
    // An empty response also leaves previously synced participants in place.
    playerCount = roster.length || ((await findEvent(deps.db, eventId))?.playerCount ?? 0);
  }
  await upsertEventDetail(deps.db, { ...event, playerCount });
  if (event.isTeamEvent) {
    await replaceEventTeams(deps.db, eventId, await deps.source.getTeams(eventId));
  }
  await replaceEventPlayers(deps.db, eventId, roster ?? (await deps.source.getPlayers(eventId)));
  await markEventSynced(deps.db, eventId);

  const row = await findEvent(deps.db, eventId);
  if (!row) throw new Error(`Event ${eventId} vanished right after being stored`);
  return row;
}

/** Pairings and lists need players in the database; fetch them once if we never have. */
export async function ensureEventSynced(
  deps: Pick<JobContext, 'db' | 'source'>,
  eventId: string,
): Promise<EventRow> {
  const existing = await findEvent(deps.db, eventId);
  if (existing?.blockedAt) throw new EventBlockedError(eventId);
  return existing?.lastSyncedAt ? existing : syncEvent(deps, eventId);
}

async function syncEventJob(ctx: JobContext, { eventId }: RequestOf<'event'>): Promise<void> {
  await ctx.progress.setTotal(1);
  await syncEvent(ctx, eventId);
  await ctx.progress.succeeded();
}
