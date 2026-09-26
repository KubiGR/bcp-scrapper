import { PlayerSearchQuerySchema, type EventSizeRule } from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { searchTopLists } from '../repo/top-lists';
import { parseInput } from '../validation';

/** Top lists: players of big events in a range who went X-n or better. */
export function playersSearchRoutes(deps: { db: Db; eventRule: EventSizeRule; now: () => Date }) {
  return new Hono().get('/players/search', async (c) => {
    const query = parseInput(PlayerSearchQuerySchema, c.req.query());
    return c.json(await searchTopLists(deps.db, query, deps.eventRule, deps.now()));
  });
}
