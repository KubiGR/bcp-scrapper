import { isBigEvent, type EventSizeRule, type SyncRequest } from '@bcp/shared';
import { PageCursors, type TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import type { Logger } from '../logger';
import {
  findEvent,
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
    const big = page.items.filter((event) => isBigEvent(event, ctx.eventRule));
    await upsertEventSummaries(ctx.db, big);
    await ctx.progress.succeeded(big.length);
    cursor = seen.next(page.nextCursor);
  } while (cursor !== null);
}

/** Event detail, teams (team events only) and players. Drops teams and players BCP removed. */
export async function syncEvent(
  deps: Pick<JobContext, 'db' | 'source'>,
  eventId: string,
): Promise<EventRow> {
  const event = await deps.source.getEvent(eventId);
  await upsertEventDetail(deps.db, event);
  if (event.isTeamEvent) {
    await replaceEventTeams(deps.db, eventId, await deps.source.getTeams(eventId));
  }
  await replaceEventPlayers(deps.db, eventId, await deps.source.getPlayers(eventId));
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
  return existing?.lastSyncedAt ? existing : syncEvent(deps, eventId);
}

async function syncEventJob(ctx: JobContext, { eventId }: RequestOf<'event'>): Promise<void> {
  await ctx.progress.setTotal(1);
  await syncEvent(ctx, eventId);
  await ctx.progress.succeeded();
}
