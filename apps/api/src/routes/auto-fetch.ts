import { AutoFetchRequestSchema, type AutoFetchState } from '@bcp/shared';
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { ForbiddenError } from '../errors';
import type { AutoFetchPlanner } from '../fetch-queue/auto-fetch';
import { getAutoFetchEnabled, setAutoFetchEnabled } from '../repo/app-settings';
import { autoJobSummary, deleteQueuedAutoJobs } from '../repo/fetch-queue';
import { parseInput } from '../validation';
import { requireJson } from './require-json';

/** The automatic fetching switch; with logins on, only admins may flip it. */
export function autoFetchRoutes(deps: {
  db: Db;
  planner?: AutoFetchPlanner;
  authRequired: boolean;
}) {
  const { db, planner } = deps;

  async function state(): Promise<AutoFetchState> {
    return {
      // Without a planner nothing runs, whatever the stored switch says.
      enabled: planner !== undefined && (await getAutoFetchEnabled(db)),
      available: planner !== undefined,
      days: planner?.days ?? null,
      lastPlannedAt: planner?.lastPlannedAt?.toISOString() ?? null,
      eventsPending: (await autoJobSummary(db)).events,
    };
  }

  return new Hono<AuthEnv>()
    .get('/auto-fetch', async (c) => c.json(await state()))
    .post('/auto-fetch', requireJson, async (c) => {
      if (deps.authRequired && c.get('user')?.role !== 'admin') {
        throw new ForbiddenError('Only admins can change automatic fetching');
      }
      const { enabled } = parseInput(
        AutoFetchRequestSchema,
        await c.req.json<unknown>().catch(() => null),
      );
      await setAutoFetchEnabled(db, enabled);
      if (enabled) {
        planner?.planSoon();
      } else {
        // Let a pass under way notice the switch and finish, then drop what it queued.
        await planner?.idle();
        await deleteQueuedAutoJobs(db);
      }
      return c.json(await state());
    });
}
