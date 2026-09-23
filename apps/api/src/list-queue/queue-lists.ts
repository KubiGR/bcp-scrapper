import { qualifiesForMaxLosses, type QueueListsRequest, type QueueListsResult } from '@bcp/shared';
import type { Db } from '../db/client';
import { ValidationError } from '../errors';
import { enqueueLists, SINGLE_LIST_PRIORITY } from '../repo/list-queue';
import { findPlayersMissingLists } from '../repo/lists';
import { listEventPlayers } from '../repo/participants';
import type { SyncRunner } from '../sync/runner';
import type { ListQueueWorker } from './worker';

export interface QueueListsDeps {
  db: Db;
  runner: SyncRunner;
  listQueue: ListQueueWorker;
}

/**
 * Queues an event's missing lists: all of them, those within a loss limit, or chosen players
 * (who jump the queue). Never fetches anything itself; the worker does, gently.
 */
export async function queueEventLists(
  deps: QueueListsDeps,
  eventId: string,
  request: QueueListsRequest,
): Promise<QueueListsResult> {
  const { db } = deps;
  await deps.runner.ensureEventSynced(eventId);
  const everyone = await listEventPlayers(db, eventId);
  const missing = new Map(
    (await findPlayersMissingLists(db, eventId)).map(({ playerId, listId }) => [playerId, listId]),
  );

  let selected = everyone;
  if (request.playerIds) {
    const known = new Set(everyone.map((player) => player.bcpId));
    const unknown = request.playerIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new ValidationError([
        { path: 'playerIds', message: `Not players of this event: ${unknown.join(', ')}` },
      ]);
    }
    const wanted = new Set(request.playerIds);
    selected = everyone.filter((player) => wanted.has(player.bcpId));
  }

  let notQualifying = 0;
  const { maxLosses } = request;
  if (maxLosses !== undefined) {
    notQualifying = everyone.filter(
      (player) => missing.has(player.bcpId) && !qualifiesForMaxLosses(player, maxLosses),
    ).length;
    selected = selected.filter((player) => qualifiesForMaxLosses(player, maxLosses));
  }

  const priority = request.playerIds ? SINGLE_LIST_PRIORITY : 0;
  const counts = { alreadyQueued: 0, alreadyFetched: 0, noListOnBcp: 0 };
  const toQueue: { playerId: string; listId: string }[] = [];
  for (const player of selected) {
    const open = player.listStatus === 'queued' || player.listStatus === 'fetching';
    const listId = missing.get(player.bcpId);
    if (open) counts.alreadyQueued += 1;
    if (listId === undefined) {
      if (player.listStatus === 'none') counts.noListOnBcp += 1;
      else if (!open) counts.alreadyFetched += 1;
      continue;
    }
    // A chosen player already in the queue is "queued" again at single priority: it jumps ahead.
    if (!open || priority === SINGLE_LIST_PRIORITY)
      toQueue.push({ playerId: player.bcpId, listId });
  }

  const queued = await enqueueLists(db, eventId, toQueue, priority);
  return {
    queued,
    ...counts,
    notQualifying,
    estimatedSeconds: await deps.listQueue.estimateSecondsFor(eventId),
  };
}
