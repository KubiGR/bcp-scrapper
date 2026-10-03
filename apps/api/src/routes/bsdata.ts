import { Hono } from 'hono';
import type { AuthEnv } from '../auth/middleware';
import type { BsdataClient } from '../bsdata/client';
import type { Db } from '../db/client';
import { ForbiddenError, NotFoundError } from '../errors';
import { bsdataStatus, syncBsdata } from '../repo/bsdata';
import { tidyDetachments } from '../repo/lists';

/** Settings → BSData: its status, and Refresh (with logins on, admins only). */
export function bsdataRoutes(deps: {
  db: Db;
  client: BsdataClient | undefined;
  authRequired: boolean;
  now: () => Date;
}) {
  const { db } = deps;
  return new Hono<AuthEnv>()
    .get('/bsdata', async (c) => c.json(await bsdataStatus(db)))
    .post('/bsdata/refresh', async (c) => {
      if (deps.authRequired && c.get('user')?.role !== 'admin') {
        throw new ForbiddenError('Only admins can refresh BSData');
      }
      if (deps.client === undefined) throw new NotFoundError('BSData isn’t set up here');
      const status = await syncBsdata(db, deps.client, deps.now());
      // Lists take BSData's spellings straight away.
      await tidyDetachments(db);
      return c.json(status);
    });
}
