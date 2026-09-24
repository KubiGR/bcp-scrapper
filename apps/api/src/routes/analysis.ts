import { buildRounds, computeStandings, computeTeamContribution } from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { loadEventAnalysis } from '../repo/analysis';
import { requireEvent } from './require-event';

/** Read-only analysis of an event's stored pairings; nothing here talks to BCP. */
export function analysisRoutes(deps: { db: Db }) {
  const load = async (eventId: string) => {
    await requireEvent(deps.db, eventId);
    return loadEventAnalysis(deps.db, eventId);
  };
  return new Hono()
    .get('/events/:id/rounds', async (c) => c.json(buildRounds(await load(c.req.param('id')))))
    .get('/events/:id/standings', async (c) =>
      c.json(computeStandings(await load(c.req.param('id')))),
    )
    .get('/events/:id/teams/:teamId', async (c) => {
      const { id, teamId } = c.req.param();
      const detail = computeTeamContribution(await load(id), teamId);
      if (!detail) throw new NotFoundError(`Team ${teamId} is not part of event ${id}`);
      return c.json(detail);
    });
}
