import type { SyncRequest } from '@bcp/shared';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { BcpAuthError } from '../errors';
import type { Logger } from '../logger';
import {
  findEvent,
  markEventSynced,
  upsertEventDetail,
  upsertEventSummaries,
  type EventRow,
} from '../repo/events';
import { findPlayersMissingLists, saveArmyList } from '../repo/lists';
import { replaceRoundPairings } from '../repo/pairings';
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
    case 'lists':
      return syncLists(ctx, request);
  }
}

/** Every 40k event in the range, page by page. Progress counts events stored. */
async function syncCatalog(ctx: JobContext, { from, to }: RequestOf<'catalog'>): Promise<void> {
  let cursor: string | null = null;
  do {
    const page = await ctx.source.listEvents({ from, to }, cursor);
    await upsertEventSummaries(ctx.db, page.items);
    await ctx.progress.succeeded(page.items.length);
    cursor = page.nextCursor;
  } while (cursor !== null);
}

/** Event detail, teams (team events only) and players. Drops teams and players BCP removed. */
async function syncEvent(ctx: JobContext, eventId: string): Promise<EventRow> {
  const event = await ctx.source.getEvent(eventId);
  await upsertEventDetail(ctx.db, event);
  if (event.isTeamEvent) {
    await replaceEventTeams(ctx.db, eventId, await ctx.source.getTeams(eventId));
  }
  await replaceEventPlayers(ctx.db, eventId, await ctx.source.getPlayers(eventId));
  await markEventSynced(ctx.db, eventId);

  const row = await findEvent(ctx.db, eventId);
  if (!row) throw new Error(`Event ${eventId} vanished right after being stored`);
  return row;
}

/** Pairings and lists need players in the database; fetch them once if we never have. */
async function ensureEventSynced(ctx: JobContext, eventId: string): Promise<EventRow> {
  const existing = await findEvent(ctx.db, eventId);
  return existing?.lastSyncedAt ? existing : syncEvent(ctx, eventId);
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
    const teamMatchups = event.isTeamEvent ? await ctx.source.getTeamMatchups(eventId, round) : [];
    const games = await ctx.source.getGames(eventId, round);
    await replaceRoundPairings(ctx.db, eventId, round, { teamMatchups, games });
    await ctx.progress.succeeded();
  }
}

/**
 * One request per missing list. A single failure is counted and skipped, so a retry
 * fetches only what is still missing. A broken login aborts, since every later list would fail too.
 */
async function syncLists(ctx: JobContext, { eventId }: RequestOf<'lists'>): Promise<void> {
  await ensureEventSynced(ctx, eventId);
  const missing = await findPlayersMissingLists(ctx.db, eventId);
  await ctx.progress.setTotal(missing.length);

  for (const { playerId, listId } of missing) {
    try {
      const list = await ctx.source.getList(listId);
      if (list === null) {
        ctx.logger.warn({ playerId, listId }, 'BCP has no list for this player');
        await ctx.progress.failed();
        continue;
      }
      await saveArmyList(ctx.db, playerId, list);
      await ctx.progress.succeeded();
    } catch (error) {
      if (error instanceof BcpAuthError) throw error;
      ctx.logger.warn({ err: error, playerId, listId }, 'Could not fetch list');
      await ctx.progress.failed();
    }
  }
}
