import { QueueListsRequestSchema, type BcpStatus } from '@bcp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { BcpAuthError } from '../errors';
import { queueEventLists } from '../fetch-queue/queue-lists';
import { queueEventPairings } from '../fetch-queue/queue-pairings';
import type { FetchQueueWorker } from '../fetch-queue/worker';
import { cancelQueuedLists, retryFailedJobs, USER_WAITING_PRIORITY } from '../repo/fetch-queue';
import type { SyncRunner } from '../sync/runner';
import { parseInput } from '../validation';
import { requireEvent } from './require-event';
import { requireJson } from './require-json';

const RetryFailedSchema = z.object({ eventId: z.string().min(1).optional() });

export function fetchQueueRoutes(deps: {
  db: Db;
  runner: SyncRunner;
  fetchQueue: FetchQueueWorker;
  bcpStatus: () => Promise<BcpStatus>;
}) {
  const { db, fetchQueue } = deps;
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
      .post('/events/:id/pairings/queue', requireJson, async (c) => {
        // The event page asks for these, so its jobs jump the queue.
        return c.json(await queueEventPairings(deps, c.req.param('id'), USER_WAITING_PRIORITY));
      })
      .post('/fetch-queue/retry-failed', requireJson, async (c) => {
        const { eventId } = parseInput(
          RetryFailedSchema,
          await c.req.json<unknown>().catch(() => null),
        );
        return c.json({ requeued: await retryFailedJobs(db, eventId) });
      })
      .get('/fetch-queue', async (c) => c.json(await fetchQueue.state()))
      .post('/fetch-queue/pause', requireJson, async (c) => {
        fetchQueue.pause('user');
        return c.json(await fetchQueue.state());
      })
      .post('/fetch-queue/resume', requireJson, async (c) => {
        if ((await fetchQueue.state()).pausedReason === 'login-rejected') {
          const { state } = await deps.bcpStatus();
          if (state === 'rejected' || state === 'missing') {
            throw new BcpAuthError(
              'BCP still rejects the login. Put a fresh BCP_REFRESH_TOKEN in .env, restart the API, then resume.',
            );
          }
        }
        fetchQueue.resume();
        return c.json(await fetchQueue.state());
      })
  );
}
