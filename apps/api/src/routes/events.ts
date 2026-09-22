import { EventListQuerySchema } from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { findEvent, searchEvents, toEventListItem } from '../repo/events';
import { parseInput } from '../validation';

export function eventRoutes(deps: { db: Db }) {
  return new Hono()
    .get('/events', async (c) => {
      const query = parseInput(EventListQuerySchema, c.req.query());
      return c.json(await searchEvents(deps.db, query));
    })
    .get('/events/:id', async (c) => {
      const id = c.req.param('id');
      const row = await findEvent(deps.db, id);
      if (!row) throw new NotFoundError(`Event ${id} is not in the local catalogue`);
      return c.json(toEventListItem(row));
    });
}
