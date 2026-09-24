import { EventListQuerySchema, ListExportFormatSchema, type EventSizeRule } from '@bcp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { getEventDetail } from '../event-detail';
import type { FetchQueueWorker } from '../fetch-queue/worker';
import { exportFileName, listsToText } from '../lists-export';
import { searchEvents } from '../repo/events';
import { findPlayerList, listEventArmyLists, listEventMissingLists } from '../repo/lists';
import { listEventPlayers } from '../repo/participants';
import { parseInput } from '../validation';
import { requireEvent } from './require-event';

const ExportQuerySchema = z.object({ format: ListExportFormatSchema.default('txt') });

export function eventRoutes(deps: {
  db: Db;
  now: () => Date;
  fetchQueue: FetchQueueWorker;
  eventRule: EventSizeRule;
}) {
  return new Hono()
    .get('/events', async (c) => {
      const query = parseInput(EventListQuerySchema, c.req.query());
      return c.json(await searchEvents(deps.db, query, deps.eventRule));
    })
    .get('/events/:id', async (c) => {
      const id = c.req.param('id');
      const detail = await getEventDetail(deps, id, deps.now());
      if (!detail) throw new NotFoundError(`Event ${id} is not in the local catalogue`);
      return c.json(detail);
    })
    .get('/events/:id/players', async (c) => {
      const id = c.req.param('id');
      await requireEvent(deps.db, id);
      return c.json({ items: await listEventPlayers(deps.db, id) });
    })
    .get('/events/:id/lists/export', async (c) => {
      const id = c.req.param('id');
      const { format } = parseInput(ExportQuerySchema, c.req.query());
      const event = await requireEvent(deps.db, id);
      const [lists, missing] = await Promise.all([
        listEventArmyLists(deps.db, id),
        listEventMissingLists(deps.db, id),
      ]);
      c.header(
        'Content-Disposition',
        `attachment; filename="${exportFileName(event.name, format)}"`,
      );
      if (format === 'json') return c.json({ event: { id, name: event.name }, lists, missing });
      return c.text(listsToText(event.name, lists, missing));
    })
    .get('/players/:id/list', async (c) => {
      const id = c.req.param('id');
      const list = await findPlayerList(deps.db, id);
      if (!list) throw new NotFoundError(`No army list stored for player ${id}`);
      return c.json(list);
    });
}
