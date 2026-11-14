import { Hono } from 'hono';
import type { AuthEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { ForbiddenError, NotFoundError } from '../errors';
import { setEventBlocked } from '../repo/events';
import { cancelQueuedEventJobs } from '../repo/fetch-queue';
import { requireJson } from './require-json';

/**
 * Blocking an event stops Logis asking BCP for it (for events that fail on every fetch); with
 * logins on, only admins may block or unblock.
 */
export function eventBlockRoutes(deps: { db: Db; now: () => Date; authRequired?: boolean }) {
  const adminOnly = (user: { role: string } | undefined) => {
    if (deps.authRequired === true && user?.role !== 'admin') {
      throw new ForbiddenError('Only admins can block or unblock events');
    }
  };
  const setBlocked = async (id: string, at: Date | null) => {
    if (!(await setEventBlocked(deps.db, id, at))) {
      throw new NotFoundError(`Event ${id} is not in the local catalogue`);
    }
  };
  return (
    new Hono<AuthEnv>()
      .post('/events/:id/block', requireJson, async (c) => {
        adminOnly(c.get('user'));
        const id = c.req.param('id');
        const at = deps.now();
        await setBlocked(id, at);
        // Its queued work would never be fetched now; one being fetched finishes.
        const cancelled = await cancelQueuedEventJobs(deps.db, id);
        return c.json({ blockedAt: at.toISOString(), cancelled });
      })
      // DELETE can't be sent cross-origin without a preflight, so it needs no JSON body.
      .delete('/events/:id/block', async (c) => {
        adminOnly(c.get('user'));
        await setBlocked(c.req.param('id'), null);
        return c.json({ blockedAt: null });
      })
  );
}
