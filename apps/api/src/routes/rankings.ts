import { RankingsQuerySchema, type EventSizeRule } from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { loadRankings, playerRanking, rankingsPage, topRanks } from '../repo/rankings';
import { parseInput } from '../validation';

/** Players ranked by tournament points (see the player rankings spec). */
export function rankingsRoutes(deps: { db: Db; eventRule: EventSizeRule; now: () => Date }) {
  const ranked = () => loadRankings(deps.db, deps.eventRule, deps.now());
  return new Hono()
    .get('/rankings', async (c) =>
      c.json(rankingsPage(await ranked(), parseInput(RankingsQuerySchema, c.req.query()))),
    )
    .get('/rankings/top', async (c) => c.json(topRanks(await ranked())))
    .get('/rankings/:userId', async (c) => {
      const player = await playerRanking(deps.db, await ranked(), c.req.param('userId'));
      if (player === null) throw new NotFoundError('No player with that account');
      return c.json(player);
    });
}
