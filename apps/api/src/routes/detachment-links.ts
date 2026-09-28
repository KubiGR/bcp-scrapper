import { DetachmentLinkRequestSchema } from '@bcp/shared';
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { ForbiddenError } from '../errors';
import { detachmentNames, linkDetachment, unlinkDetachment } from '../repo/detachment-links';
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
  return new Hono<AuthEnv>()
    .get('/detachments', async (c) => c.json(await detachmentNames(db)))
    .post('/detachments/links', requireJson, async (c) => {
      adminOnly(c.get('user'));
      const { name, target, foreign } = parseInput(
        DetachmentLinkRequestSchema,
        await c.req.json<unknown>().catch(() => null),
      );
      await linkDetachment(db, name, target, foreign);
      return c.json(await detachmentNames(db));
    })
    .delete('/detachments/links/:name', async (c) => {
      adminOnly(c.get('user'));
      await unlinkDetachment(db, c.req.param('name'));
      return c.json(await detachmentNames(db));
    });
}
