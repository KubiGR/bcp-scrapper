import { PlayerSearchQuerySchema, type EventSizeRule } from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { rangeOrCurrentUpdate } from '../repo/game-updates';
import { searchTopLists } from '../repo/top-lists';
import { parseInput } from '../validation';

/** Top lists: players of big events in a range who went X-n or better. */
export function playersSearchRoutes(deps: { db: Db; eventRule: EventSizeRule; now: () => Date }) {
  return new Hono().get('/players/search', async (c) => {
    const query = parseInput(PlayerSearchQuerySchema, c.req.query());
    const today = deps.now();
    const range = await rangeOrCurrentUpdate(deps.db, query, today);
    return c.json(await searchTopLists(deps.db, { ...query, ...range }, deps.eventRule, today));
  });
}
