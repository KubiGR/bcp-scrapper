import {
  DetachmentKeepRequestSchema,
  DetachmentLinkRequestSchema,
  DetachmentListsQuerySchema,
} from '@bcp/shared';
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { ForbiddenError } from '../errors';
import {
  detachmentLists,
  detachmentNames,
  keepDetachment,
  linkDetachment,
  unkeepDetachment,
  unlinkDetachment,
} from '../repo/detachment-links';
import { parseInput } from '../validation';
import { requireJson } from './require-json';

/** Settings → Detachment names; with logins on, only admins may link. */
export function detachmentLinkRoutes(deps: { db: Db; authRequired: boolean }) {
  const { db } = deps;
  const adminOnly = (user: { role: string } | undefined) => {
    if (deps.authRequired && user?.role !== 'admin') {
      throw new ForbiddenError('Only admins can link detachment names');
    }
  };
  return (
    new Hono<AuthEnv>()
      .get('/detachments', async (c) => c.json(await detachmentNames(db)))
      // A few of the lists behind a name, to see what players meant by it.
      .get('/detachments/lists', async (c) => {
        const { name, faction } = parseInput(DetachmentListsQuerySchema, c.req.query());
        return c.json(await detachmentLists(db, name, faction ?? null));
      })
      .post('/detachments/links', requireJson, async (c) => {
        adminOnly(c.get('user'));
        const { name, target, foreign, ignored } = parseInput(
          DetachmentLinkRequestSchema,
          await c.req.json<unknown>().catch(() => null),
        );
        await linkDetachment(db, name, target, foreign, ignored);
        return c.json(await detachmentNames(db));
      })
      .delete('/detachments/links/:name', async (c) => {
        adminOnly(c.get('user'));
        await unlinkDetachment(db, c.req.param('name'));
        return c.json(await detachmentNames(db));
      })
      // A detachment kept for a faction although BSData doesn't list it there, and the undo.
      .post('/detachments/keeps', requireJson, async (c) => {
        adminOnly(c.get('user'));
        const { faction, name, ignored } = parseInput(
          DetachmentKeepRequestSchema,
          await c.req.json<unknown>().catch(() => null),
        );
        await keepDetachment(db, faction, name, ignored);
        return c.json(await detachmentNames(db));
      })
      .delete('/detachments/keeps/:faction/:name', async (c) => {
        adminOnly(c.get('user'));
        const { faction, name } = parseInput(DetachmentKeepRequestSchema, {
          faction: c.req.param('faction'),
          name: c.req.param('name'),
        });
        await unkeepDetachment(db, faction, name);
        return c.json(await detachmentNames(db));
      })
  );
}
