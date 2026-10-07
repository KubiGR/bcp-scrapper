import { Hono } from 'hono';
import type { AuthEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { ForbiddenError, NotFoundError } from '../errors';
import { rulesStatus, syncRules } from '../repo/rules';
import type { RulesClient } from '../rules/client';

/** Settings → Rules data: its status, and Refresh (with logins on, admins only). */
export function rulesRoutes(deps: {
  db: Db;
  client: RulesClient | undefined;
  authRequired: boolean;
  now: () => Date;
}) {
  const { db } = deps;
  return new Hono<AuthEnv>()
    .get('/rules', async (c) => c.json(await rulesStatus(db)))
    .post('/rules/refresh', async (c) => {
      if (deps.authRequired && c.get('user')?.role !== 'admin') {
        throw new ForbiddenError('Only admins can refresh the rules data');
      }
      if (deps.client === undefined) throw new NotFoundError('Reading 39k.pro isn’t set up here');
      return c.json(await syncRules(db, deps.client, deps.now()));
    });
}
