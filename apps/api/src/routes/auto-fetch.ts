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
      enabled: await getAutoFetchEnabled(db),
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
        await planner?.planOnce();
      } else {
        await deleteQueuedAutoJobs(db);
      }
      return c.json(await state());
    });
}
