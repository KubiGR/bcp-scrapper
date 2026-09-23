import { SyncRequestSchema } from '@bcp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { NotFoundError, ValidationError } from '../errors';
import { getSyncRun } from '../repo/sync-runs';
import type { SyncRunner } from '../sync/runner';
import { parseInput } from '../validation';

const SyncRunIdSchema = z.coerce.number().int().positive();

export function syncRoutes(deps: { db: Db; runner: SyncRunner }) {
  return new Hono()
    .post('/sync', async (c) => {
      if (!c.req.header('content-type')?.startsWith('application/json')) {
        const message = 'Content-Type must be application/json';
        throw new ValidationError([{ path: 'content-type', message }], message);
      }
      const body = await c.req.json<unknown>().catch(() => null);
      const run = await deps.runner.start(parseInput(SyncRequestSchema, body));
      return c.json(run, 202);
    })
    .get('/sync-runs/:id', async (c) => {
      const id = parseInput(SyncRunIdSchema, c.req.param('id'));
      const run = await getSyncRun(deps.db, id);
      if (!run) throw new NotFoundError(`Sync run ${id} not found`);
      return c.json(run);
    });
}
