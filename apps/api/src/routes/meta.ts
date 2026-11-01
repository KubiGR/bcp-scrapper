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
import { rangeOrCurrentUpdate } from '../repo/game-updates';
import { loadMetaRows } from '../repo/meta';
import { parseInput } from '../validation';

/** Popular factions and archetypes, their results, and what top teams bring. */
export function metaRoutes(deps: { db: Db; eventRule: EventSizeRule; now: () => Date }) {
  return new Hono().get('/meta', async (c) => {
    const query = parseInput(MetaQuerySchema, c.req.query());
    const today = deps.now();
    const { from, to } = await rangeOrCurrentUpdate(deps.db, query, today);
    // The change column compares two spans: the ones given (e.g. two game updates), else the
    // range's last 30 days with the 30 days before them.
    const spans =
      query.recentFrom !== undefined &&
      query.recentTo !== undefined &&
      query.priorFrom !== undefined &&
      query.priorTo !== undefined
        ? {
            recent: { from: query.recentFrom, to: query.recentTo },
            prior: { from: query.priorFrom, to: query.priorTo },
          }
        : {
            recent: { from: addDays(to, -29), to },
            prior: { from: addDays(to, -59), to: addDays(to, -30) },
          };
    const [current, compared] = await Promise.all([
      loadMetaRows(deps.db, { ...query, from, to }, deps.eventRule, today),
      loadMetaRows(
        deps.db,
        {
          ...query,
          from: spans.prior.from < spans.recent.from ? spans.prior.from : spans.recent.from,
          to: spans.prior.to > spans.recent.to ? spans.prior.to : spans.recent.to,
        },
        deps.eventRule,
        today,
      ),
    ]);
    const within = (span: { from: string; to: string }) => (row: { eventStart: string }) =>
      row.eventStart >= span.from && row.eventStart <= span.to;
    const { rows, eventsInRange, eventsLoaded } = current;
    const { factions, totals, weeks } = computeMeta(rows, {
      recent: compared.rows.filter(within(spans.recent)),
      prior: compared.rows.filter(within(spans.prior)),
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
