import { RankingsQuerySchema, type EventSizeRule } from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { loadRankings, playerRanking, rankingsPage, topRanks } from '../repo/rankings';
import { storedPlayersElo, wh40kEloLoader } from '../repo/wh40k-elo';
import { parseInput } from '../validation';

/** Players ranked by tournament points (see the player rankings spec). */
export function rankingsRoutes(deps: { db: Db; eventRule: EventSizeRule; now: () => Date }) {
  const ranked = () => loadRankings(deps.db, deps.eventRule, deps.now());
  const wh40k = wh40kEloLoader(deps.db);
  const elo = async () => ({ wh40k: await wh40k() });
  return new Hono()
    .get('/rankings', async (c) =>
      c.json(
        rankingsPage(await ranked(), parseInput(RankingsQuerySchema, c.req.query()), await elo()),
      ),
    )
    .get('/rankings/top', async (c) => {
      const [top, elo] = await Promise.all([ranked(), storedPlayersElo(deps.db)]);
      return c.json({ ...topRanks(top), elo });
    })
    .get('/rankings/:userId', async (c) => {
      const player = await playerRanking(
        deps.db,
        await ranked(),
        c.req.param('userId'),
        await elo(),
      );
      if (player === null) throw new NotFoundError('No player with that account');
      return c.json(player);
    });
}
