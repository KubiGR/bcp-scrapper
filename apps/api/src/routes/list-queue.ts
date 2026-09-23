import { QueueListsRequestSchema, type BcpStatus } from '@bcp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { BcpAuthError } from '../errors';
import { queueEventLists } from '../list-queue/queue-lists';
import type { ListQueueWorker } from '../list-queue/worker';
import { cancelQueuedLists, retryFailedLists } from '../repo/list-queue';
import type { SyncRunner } from '../sync/runner';
import { parseInput } from '../validation';
import { requireEvent } from './require-event';
import { requireJson } from './require-json';

const RetryFailedSchema = z.object({ eventId: z.string().min(1).optional() });

export function listQueueRoutes(deps: {
  db: Db;
  runner: SyncRunner;
  listQueue: ListQueueWorker;
  bcpStatus: () => Promise<BcpStatus>;
}) {
  const { db, listQueue } = deps;
  return (
    new Hono()
      .post('/events/:id/lists/queue', requireJson, async (c) => {
        const id = c.req.param('id');
        // Not requireEvent: an event never synced yet still queues fine, since
        // queueEventLists loads it first via ensureEventSynced. An unknown id fails there too,
        // when the source has no such event.
        const request = parseInput(
          QueueListsRequestSchema,
          await c.req.json<unknown>().catch(() => null),
        );
        return c.json(await queueEventLists(deps, id, request));
      })
      // DELETE can't be sent cross-origin without a preflight, so it needs no JSON body.
      .delete('/events/:id/lists/queue', async (c) => {
        const id = c.req.param('id');
        await requireEvent(db, id);
        return c.json({ removed: await cancelQueuedLists(db, id) });
      })
      .post('/list-queue/retry-failed', requireJson, async (c) => {
        const { eventId } = parseInput(
          RetryFailedSchema,
          await c.req.json<unknown>().catch(() => null),
        );
        return c.json({ requeued: await retryFailedLists(db, eventId) });
      })
      .get('/list-queue', async (c) => c.json(await listQueue.state()))
      .post('/list-queue/pause', requireJson, async (c) => {
        listQueue.pause('user');
        return c.json(await listQueue.state());
      })
      .post('/list-queue/resume', requireJson, async (c) => {
        if ((await listQueue.state()).pausedReason === 'login-rejected') {
          const { state } = await deps.bcpStatus();
          if (state === 'rejected' || state === 'missing') {
            throw new BcpAuthError(
              'BCP still rejects the login. Put a fresh BCP_REFRESH_TOKEN in .env, restart the API, then resume.',
            );
          }
        }
        listQueue.resume();
        return c.json(await listQueue.state());
      })
  );
}
