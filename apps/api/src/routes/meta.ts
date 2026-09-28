import {
  addDays,
  computeMeta,
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
    // The change column compares the range's last 30 days with the 30 days before them.
    const [current, lastSixty] = await Promise.all([
      loadMetaRows(deps.db, { ...query, from, to }, deps.eventRule, today),
      loadMetaRows(deps.db, { ...query, from: addDays(to, -59), to }, deps.eventRule, today),
    ]);
    const recentFrom = addDays(to, -29);
    const { rows, eventsInRange, eventsLoaded } = current;
    const { factions, totals, weeks } = computeMeta(rows, {
      recent: lastSixty.rows.filter((row) => row.eventStart >= recentFrom),
      prior: lastSixty.rows.filter((row) => row.eventStart < recentFrom),
    });
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
