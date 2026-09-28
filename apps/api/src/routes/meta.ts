import {
  addDays,
  computeMeta,
  daysIn,
  computeTeamMeta,
  MetaQuerySchema,
  type EventSizeRule,
  type MetaResponse,
} from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { loadMetaRows, metaRange } from '../repo/meta';
import { parseInput } from '../validation';

/** Popular factions and archetypes, their results, and what top teams bring. */
export function metaRoutes(deps: { db: Db; eventRule: EventSizeRule; now: () => Date }) {
  return new Hono().get('/meta', async (c) => {
    const query = parseInput(MetaQuerySchema, c.req.query());
    const today = deps.now();
    const { from, to } = metaRange(query, today);
    // The same length of time just before, for each row's change in reliable win rate.
    const length = daysIn({ from, to });
    const [current, previous] = await Promise.all([
      loadMetaRows(deps.db, { ...query, from, to }, deps.eventRule, today),
      loadMetaRows(
        deps.db,
        { ...query, from: addDays(from, -length), to: addDays(from, -1) },
        deps.eventRule,
        today,
      ),
    ]);
    const { rows, eventsInRange, eventsLoaded } = current;
    const { factions, totals, weeks } = computeMeta(rows, previous.rows);
    const teams = computeTeamMeta(rows);
    const body: MetaResponse = {
      factions,
      teams: teams?.rows ?? null,
      totals,
      weeks,
      eventsInRange,
      eventsLoaded,
      teamEventsCounted: teams?.eventsCounted ?? 0,
    };
    return c.json(body);
  });
}
