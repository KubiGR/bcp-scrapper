import {
  effectiveUpdates,
  groupUpdates,
  updateSpans,
  type AutoUpdate,
  type EffectiveUpdate,
  type GameUpdatePatch,
  type GameUpdatesResponse,
  type UpdateEdits,
} from '@bcp/shared';
import { desc, sql } from 'drizzle-orm';
import type { BsdataClient } from '../bsdata/client';
import type { Db } from '../db/client';
import { bsdataCommits, events, gameUpdates } from '../db/schema';

/** Reads BSData's new commits (all of them the first time); returns how many were added. */
export async function syncUpdateCommits(db: Db, client: BsdataClient): Promise<number> {
  const [newest] = await db
    .select({ sha: bsdataCommits.sha })
    .from(bsdataCommits)
    .orderBy(desc(bsdataCommits.day), desc(bsdataCommits.sha))
    .limit(1);
  const commits = await client.commits(newest?.sha ?? null);
  if (commits.length === 0) return 0;
  const added = await db
    .insert(bsdataCommits)
    .values(commits)
    .onConflictDoNothing()
    .returning({ sha: bsdataCommits.sha });
  return added.length;
}

/** BSData's updates (oldest first) and the admin edits to them. */
async function updatesAndEdits(
  db: Db,
): Promise<{ auto: AutoUpdate[]; edits: Map<string, UpdateEdits> }> {
  const [commits, rows] = await Promise.all([
    db.select().from(bsdataCommits),
    db.select().from(gameUpdates),
  ]);
  return {
    auto: groupUpdates(commits),
    edits: new Map(
      rows.map((row) => [
        row.id,
        { name: row.name, start: row.startOverride, merged: row.merged, hidden: row.hidden },
      ]),
    ),
  };
}

/** The updates people pick from, oldest first. */
export async function effectiveGameUpdates(db: Db): Promise<EffectiveUpdate[]> {
  const { auto, edits } = await updatesAndEdits(db);
  return effectiveUpdates(auto, edits);
}

/** Every update read from BSData, newest first, with its stored events. */
export async function listGameUpdates(db: Db, today: string): Promise<GameUpdatesResponse> {
  const { auto, edits } = await updatesAndEdits(db);
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
        };
      })
      .reverse(),
  };
}

/**
 * Applies an admin's edit. A new start must stay after the previous update's start and before the
 * next one's (in BSData's order), so updates never overlap.
 */
export async function editGameUpdate(
  db: Db,
  id: string,
  patch: GameUpdatePatch,
  _today: string,
): Promise<'ok' | 'not-found' | 'out-of-order'> {
  const { auto, edits } = await updatesAndEdits(db);
  const update = auto.find((u) => u.id === id);
  if (update === undefined) return 'not-found';
  if (patch.start !== undefined && patch.start !== null) {
    const others = effectiveUpdates(
      auto.filter((u) => u.id !== id),
      edits,
    );
    const previous = others.filter((u) => u.start < update.start).at(-1);
    const next = others.find((u) => u.start > update.start);
    if (
      (previous !== undefined && patch.start <= previous.start) ||
      (next !== undefined && patch.start >= next.start)
    ) {
      return 'out-of-order';
    }
  }
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
