import type { SyncRequest } from '@bcp/shared';
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
import { syncRoundPairings } from './round-pairings';

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
}

type RequestOf<K extends SyncRequest['kind']> = Extract<SyncRequest, { kind: K }>;

export function runJob(ctx: JobContext, request: SyncRequest): Promise<void> {
  switch (request.kind) {
    case 'catalog':
      return syncCatalog(ctx, request);
    case 'event':
      return syncEventJob(ctx, request);
    case 'pairings':
      return syncPairings(ctx, request);
  }
}

/** Every 40k event in the range, page by page. Progress counts events stored. */
async function syncCatalog(ctx: JobContext, { from, to }: RequestOf<'catalog'>): Promise<void> {
  const seen = new PageCursors('/v1/events');
  let cursor: string | null = null;
  do {
    const page = await ctx.source.listEvents({ from, to }, cursor);
    await upsertEventSummaries(ctx.db, page.items);
    await ctx.progress.succeeded(page.items.length);
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

/** Team matchups and games for every round, replacing what was stored. Progress counts rounds. */
async function syncPairings(ctx: JobContext, { eventId }: RequestOf<'pairings'>): Promise<void> {
  const event = await ensureEventSynced(ctx, eventId);
  await ctx.progress.setTotal(event.roundCount);
  for (let round = 1; round <= event.roundCount; round += 1) {
    await syncRoundPairings({ ...ctx }, { id: eventId, isTeamEvent: event.isTeamEvent }, round);
    await ctx.progress.succeeded();
  }
}
