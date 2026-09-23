import { Hono } from 'hono';
import { getCoverage, refreshLatest } from '../catalog';
import type { Db } from '../db/client';
import type { SyncRunner } from '../sync/runner';
import { requireJson } from './require-json';

export function catalogRoutes(deps: { db: Db; runner: SyncRunner; now: () => Date }) {
  return new Hono()
    .get('/catalog/coverage', async (c) => c.json(await getCoverage(deps.db)))
    .post('/catalog/latest', requireJson, async (c) =>
      c.json(await refreshLatest(deps, deps.now())),
    );
}
