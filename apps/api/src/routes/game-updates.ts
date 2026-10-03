import { GameUpdatePatchSchema, toIsoDate } from '@bcp/shared';
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { editGameUpdate, listGameUpdates } from '../repo/game-updates';
import { parseInput } from '../validation';
import { requireJson } from './require-json';

/** The edition's game updates (from BSData's history); with logins on, only admins edit them. */
export function gameUpdateRoutes(deps: { db: Db; authRequired: boolean; now: () => Date }) {
  const { db } = deps;
  const today = () => toIsoDate(deps.now());
  return new Hono<AuthEnv>()
    .get('/updates', async (c) => c.json(await listGameUpdates(db, today())))
    .patch('/updates/:id', requireJson, async (c) => {
      if (deps.authRequired && c.get('user')?.role !== 'admin') {
        throw new ForbiddenError('Only admins can edit game updates');
      }
      const body = parseInput(GameUpdatePatchSchema, await c.req.json<unknown>().catch(() => null));
      const result = await editGameUpdate(db, c.req.param('id'), body, today());
      if (result === 'not-found') throw new NotFoundError('No such game update');
      if (result === 'out-of-order') {
        throw new ValidationError([
          {
            path: 'start',
            message: 'An update must start after the one before and before the next',
          },
        ]);
      }
      return c.json(await listGameUpdates(db, today()));
    });
}
