import { GameUpdateCreateSchema, GameUpdatePatchSchema, toIsoDate } from '@bcp/shared';
import { Hono, type Context } from 'hono';
import type { AuthEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import {
  addGameUpdate,
  deleteGameUpdate,
  editGameUpdate,
  listGameUpdates,
} from '../repo/game-updates';
import { parseInput } from '../validation';
import { requireJson } from './require-json';

const outOfOrder = () =>
  new ValidationError([
    { path: 'start', message: 'An update must start after the one before and before the next' },
  ]);

/**
 * The edition's game updates: BSData's history (until its takedown) and those added by hand. With
 * logins on, only admins change them.
 */
export function gameUpdateRoutes(deps: { db: Db; authRequired: boolean; now: () => Date }) {
  const { db } = deps;
  const today = () => toIsoDate(deps.now());
  const requireAdmin = (c: Context<AuthEnv>) => {
    if (deps.authRequired && c.get('user')?.role !== 'admin') {
      throw new ForbiddenError('Only admins can change game updates');
    }
  };
  return new Hono<AuthEnv>()
    .get('/updates', async (c) => c.json(await listGameUpdates(db, today())))
    .post('/updates', requireJson, async (c) => {
      requireAdmin(c);
      const body = parseInput(
        GameUpdateCreateSchema,
        await c.req.json<unknown>().catch(() => null),
      );
      if ((await addGameUpdate(db, body)) === 'out-of-order') throw outOfOrder();
      return c.json(await listGameUpdates(db, today()));
    })
    .patch('/updates/:id', requireJson, async (c) => {
      requireAdmin(c);
      const body = parseInput(GameUpdatePatchSchema, await c.req.json<unknown>().catch(() => null));
      const result = await editGameUpdate(db, c.req.param('id'), body);
      if (result === 'not-found') throw new NotFoundError('No such game update');
      if (result === 'out-of-order') throw outOfOrder();
      return c.json(await listGameUpdates(db, today()));
    })
    .delete('/updates/:id', async (c) => {
      requireAdmin(c);
      if ((await deleteGameUpdate(db, c.req.param('id'))) === 'not-found') {
        throw new NotFoundError('No game update added by hand with that id');
      }
      return c.json(await listGameUpdates(db, today()));
    });
}
