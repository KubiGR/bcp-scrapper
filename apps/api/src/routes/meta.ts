import {
  computeMeta,
  computeTeamMeta,
  MetaQuerySchema,
  type EventSizeRule,
  type MetaResponse,
} from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { loadMetaRows } from '../repo/meta';
import { parseInput } from '../validation';

/** Popular factions and archetypes, their results, and what top teams bring. */
export function metaRoutes(deps: { db: Db; eventRule: EventSizeRule; now: () => Date }) {
  return new Hono().get('/meta', async (c) => {
    const query = parseInput(MetaQuerySchema, c.req.query());
    const { rows, eventsInRange, eventsLoaded } = await loadMetaRows(
      deps.db,
      query,
      deps.eventRule,
      deps.now(),
    );
    const { factions, totals } = computeMeta(rows);
    const teams = computeTeamMeta(rows);
    const body: MetaResponse = {
      factions,
      teams: teams?.rows ?? null,
      totals,
      eventsInRange,
      eventsLoaded,
      teamEventsCounted: teams?.eventsCounted ?? 0,
    };
    return c.json(body);
  });
}
