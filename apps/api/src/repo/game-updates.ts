import { randomUUID } from 'node:crypto';
import {
  defaultRangeFrom,
  effectiveUpdates,
  toIsoDate,
  groupUpdates,
  updateSpans,
  type AutoUpdate,
  type EffectiveUpdate,
  type GameUpdateCreate,
  type GameUpdatePatch,
  type GameUpdatesResponse,
  type UpdateEdits,
} from '@bcp/shared';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { bsdataCommits, events, gameUpdates } from '../db/schema';

/**
 * Every update, oldest first: BSData's (from its stored history) and those added by hand, with
 * the admin edits to them and the ids of the added ones.
 */
async function updatesAndEdits(
  db: Db,
): Promise<{ auto: AutoUpdate[]; edits: Map<string, UpdateEdits>; added: Set<string> }> {
  const [commits, rows] = await Promise.all([
    db.select().from(bsdataCommits),
    db.select().from(gameUpdates),
  ]);
  const added = rows.flatMap((row) =>
    row.addedName === null || row.addedStart === null
      ? []
      : [
          {
            id: row.id,
            start: row.addedStart,
            lastCommit: row.addedStart,
            name: row.addedName,
            summary: '',
            suggestions: [row.addedName],
          },
        ],
  );
  return {
    // By start; the sort is stable, so BSData's go first on a shared day.
    auto: [...groupUpdates(commits), ...added].sort((a, b) => a.start.localeCompare(b.start)),
    edits: new Map(
      rows.map((row) => [
        row.id,
        { name: row.name, start: row.startOverride, merged: row.merged, hidden: row.hidden },
      ]),
    ),
    added: new Set(added.map((update) => update.id)),
  };
}

/** Visible updates, in order, start on strictly later days. */
function inOrder(auto: AutoUpdate[], edits: Map<string, UpdateEdits>): boolean {
  const starts = auto.flatMap((update) => {
    const edit = edits.get(update.id);
    return edit?.merged === true || edit?.hidden === true ? [] : [edit?.start ?? update.start];
  });
  return !starts.some((start, i) => i > 0 && start <= (starts[i - 1] ?? ''));
}

/** The updates people pick from, oldest first. */
export async function effectiveGameUpdates(db: Db): Promise<EffectiveUpdate[]> {
  const { auto, edits } = await updatesAndEdits(db);
  return effectiveUpdates(auto, edits);
}

/** A date range as asked; without a start, from the start of the update in force on its end. */
export async function rangeOrCurrentUpdate(
  db: Db,
  range: { from?: string | undefined; to?: string | undefined },
  today: Date,
): Promise<{ from: string; to: string }> {
  const to = range.to ?? toIsoDate(today);
  return { from: range.from ?? defaultRangeFrom(await effectiveGameUpdates(db), to), to };
}

/** Every update, newest first, with its stored events. */
export async function listGameUpdates(db: Db, today: string): Promise<GameUpdatesResponse> {
  const { auto, edits, added } = await updatesAndEdits(db);
  const spans = updateSpans(effectiveUpdates(auto, edits), today);
  const days = (
    await db
      .select({ day: sql<string>`to_char(${events.startDate} at time zone 'UTC', 'YYYY-MM-DD')` })
      .from(events)
  ).map((row) => row.day);
  const eventsOf = (id: string) => {
    const span = spans.find((s) => s.id === id);
    return span === undefined ? 0 : days.filter((day) => day >= span.from && day <= span.to).length;
  };
  return {
    updates: auto
      .map((update) => {
        const edit = edits.get(update.id);
        return {
          id: update.id,
          name: edit?.name ?? update.name,
          autoName: update.name,
          start: edit?.start ?? update.start,
          autoStart: update.start,
          merged: edit?.merged ?? false,
          hidden: edit?.hidden ?? false,
          events: eventsOf(update.id),
          summary: update.summary,
          suggestions: update.suggestions,
          added: added.has(update.id),
        };
      })
      .reverse(),
  };
}

/**
 * Applies an admin's edit, unless it would leave the visible updates out of order or sharing a
 * start (whatever the edit: a new start, a reset, showing or un-merging one).
 */
export async function editGameUpdate(
  db: Db,
  id: string,
  patch: GameUpdatePatch,
): Promise<'ok' | 'not-found' | 'out-of-order'> {
  const { auto, edits } = await updatesAndEdits(db);
  if (!auto.some((u) => u.id === id)) return 'not-found';
  const current = edits.get(id) ?? { name: null, start: null, merged: false, hidden: false };
  const after = new Map(edits).set(id, {
    name: patch.name === undefined ? current.name : patch.name,
    start: patch.start === undefined ? current.start : patch.start,
    merged: patch.merged ?? current.merged,
    hidden: patch.hidden ?? current.hidden,
  });
  if (!inOrder(auto, after)) return 'out-of-order';
  const set = {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.start === undefined ? {} : { startOverride: patch.start }),
    ...(patch.merged === undefined ? {} : { merged: patch.merged }),
    ...(patch.hidden === undefined ? {} : { hidden: patch.hidden }),
    updatedAt: new Date(),
  };
  await db
    .insert(gameUpdates)
    .values({ id, ...set })
    .onConflictDoUpdate({ target: gameUpdates.id, set });
  return 'ok';
}

/** Adds an update by hand (BSData is gone), unless another visible one starts that day. */
export async function addGameUpdate(
  db: Db,
  update: GameUpdateCreate,
): Promise<'ok' | 'out-of-order'> {
  const { auto, edits } = await updatesAndEdits(db);
  const id = `added-${randomUUID()}`;
  const withNew = [
    ...auto,
    {
      id,
      start: update.start,
      lastCommit: update.start,
      name: update.name,
      summary: '',
      suggestions: [],
    },
  ].sort((a, b) => a.start.localeCompare(b.start));
  if (!inOrder(withNew, edits)) return 'out-of-order';
  await db.insert(gameUpdates).values({ id, addedName: update.name, addedStart: update.start });
  return 'ok';
}

/** Deletes an update added by hand; BSData's can only be hidden. */
export async function deleteGameUpdate(db: Db, id: string): Promise<'ok' | 'not-found'> {
  const deleted = await db
    .delete(gameUpdates)
    .where(and(eq(gameUpdates.id, id), isNotNull(gameUpdates.addedStart)))
    .returning({ id: gameUpdates.id });
  return deleted.length === 0 ? 'not-found' : 'ok';
}
