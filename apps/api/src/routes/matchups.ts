import {
  BulkPairingsRequestSchema,
  cellGames,
  computeFactionMatrix,
  DETACHMENT_SEPARATOR,
  detachmentRows,
  detachmentFactions,
  detachmentsPlayed,
  scalesAgree,
  type MatchupFilter,
  type EventSizeRule,
} from '@bcp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { queueManyEventPairings } from '../fetch-queue/queue-pairings';
import type { FetchQueueWorker } from '../fetch-queue/worker';
import { loadMatchupGames, pairingsStates, teamEventsInRange } from '../repo/matchups';
import { parseInput } from '../validation';
import { requireEvent } from './require-event';
import { requireJson } from './require-json';

const FilterSchema = z.object({
  /** Comma-separated; any listed disposition matches. */
  dispositions: z.string().optional(),
  /** The pre-multi-select single value; still accepted so saved links keep working. */
  disposition: z.string().optional(),
  /** `|`-separated (names may contain commas); any listed detachment matches (only fetched lists). */
  detachments: z.string().optional(),
  side: z.enum(['row', 'both']).default('row'),
});
const CellSchema = z.object({ row: z.string().min(1), col: z.string().min(1) });
const FactionSchema = z.object({ faction: z.string().min(1) });
const ids = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : [],
  );
const RangeSchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    exclude: ids,
    include: ids,
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

const listOf = (values: (string | undefined)[], separator = ',') =>
  values
    .flatMap((value) => value?.split(separator) ?? [])
    .map((value) => value.trim())
    .filter(Boolean);

const toFilter = (q: z.infer<typeof FilterSchema>): MatchupFilter => ({
  dispositions: listOf([q.dispositions, q.disposition]),
  detachments: listOf([q.detachments], DETACHMENT_SEPARATOR),
  side: q.side,
});

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export function matchupsRoutes(deps: {
  db: Db;
  fetchQueue: FetchQueueWorker;
  eventRule: EventSizeRule;
  now: () => Date;
}) {
  const { db } = deps;

  /** The events of a range and which of them count: synced unless excluded, others only if included. */
  async function selection(query: Record<string, string>) {
    const range = parseInput(RangeSchema, query);
    const today = deps.now();
    const to = range.to ?? isoDay(today);
    const from = range.from ?? isoDay(new Date(today.getTime() - 90 * 86_400_000));
    const rows = await teamEventsInRange(db, { from, to }, deps.eventRule);
    const states = await pairingsStates(
      db,
      rows.map((row) => row.id),
    );
    const events = rows.map((row) => {
      const info = states.get(row.id) ?? { state: 'missing' as const, syncedAt: null };
      // Base inclusion on having been synced before, not the displayed state: a refresh of a
      // synced event shows `pairings: 'fetching'` but must stay included until excluded.
      const included =
        info.syncedAt !== null ? !range.exclude.includes(row.id) : range.include.includes(row.id);
      return {
        id: row.id,
        name: row.name,
        startDate: row.startDate.toISOString(),
        playerCount: row.playerCount,
        teamCount: row.teamCount,
        roundCount: row.roundCount,
        pairings: info.state,
        included,
      };
    });
    return {
      events,
      includedIds: events.filter((event) => event.included).map((event) => event.id),
    };
  }

  return new Hono()
    .get('/events/:id/matchups', async (c) => {
      const id = c.req.param('id');
      await requireEvent(db, id);
      const filter = toFilter(parseInput(FilterSchema, c.req.query()));
      const games = await loadMatchupGames(db, [id]);
      return c.json({
        matrix: computeFactionMatrix(games, filter),
        scoring: scalesAgree(games),
        detachments: detachmentsPlayed(games),
        detachmentFactions: detachmentFactions(games),
      });
    })
    .get('/events/:id/matchups/games', async (c) => {
      const id = c.req.param('id');
      await requireEvent(db, id);
      const query = c.req.query();
      const filter = toFilter(parseInput(FilterSchema, query));
      const { row, col } = parseInput(CellSchema, query);
      return c.json({ games: cellGames(await loadMatchupGames(db, [id]), row, col, filter) });
    })
    .get('/events/:id/matchups/detachments', async (c) => {
      const id = c.req.param('id');
      await requireEvent(db, id);
      const query = c.req.query();
      const filter = toFilter(parseInput(FilterSchema, query));
      const { faction } = parseInput(FactionSchema, query);
      const rows = detachmentRows(await loadMatchupGames(db, [id]), faction, filter);
      return c.json({ faction, rows });
    })
    .get('/matchups', async (c) => {
      const query = c.req.query();
      const filter = toFilter(parseInput(FilterSchema, query));
      const { events, includedIds } = await selection(query);
      const games = await loadMatchupGames(db, includedIds);
      return c.json({
        events,
        matrix: computeFactionMatrix(games, filter),
        scoring: scalesAgree(games),
        detachments: detachmentsPlayed(games),
        detachmentFactions: detachmentFactions(games),
      });
    })
    .get('/matchups/games', async (c) => {
      const query = c.req.query();
      const filter = toFilter(parseInput(FilterSchema, query));
      const { row, col } = parseInput(CellSchema, query);
      const { includedIds } = await selection(query);
      return c.json({
        games: cellGames(await loadMatchupGames(db, includedIds), row, col, filter),
      });
    })
    .get('/matchups/detachments', async (c) => {
      const query = c.req.query();
      const filter = toFilter(parseInput(FilterSchema, query));
      const { faction } = parseInput(FactionSchema, query);
      const { includedIds } = await selection(query);
      const rows = detachmentRows(await loadMatchupGames(db, includedIds), faction, filter);
      return c.json({ faction, rows });
    })
    .post('/pairings-queue', requireJson, async (c) => {
      const { eventIds } = parseInput(
        BulkPairingsRequestSchema,
        await c.req.json<unknown>().catch(() => null),
      );
      return c.json(await queueManyEventPairings(deps, eventIds, 0));
    });
}
