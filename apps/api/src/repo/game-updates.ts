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
import { eq, sql } from 'drizzle-orm';
import type { BsdataClient } from '../bsdata/client';
import type { Db } from '../db/client';
import { appSettings, bsdataCommits, events, gameUpdates } from '../db/schema';
import { HISTORY_ERROR } from './bsdata';

/** Reads BSData's new commits (all of them the first time); returns how many were added. */
export async function syncUpdateCommits(db: Db, client: BsdataClient): Promise<number> {
  try {
    const added = await readNewCommits(db, client);
    await db.delete(appSettings).where(eq(appSettings.key, HISTORY_ERROR));
    return added;
  } catch (error) {
    // Shown on the BSData card until a read works again.
    const message = error instanceof Error ? error.message : String(error);
    await db
      .insert(appSettings)
      .values({ key: HISTORY_ERROR, value: message })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: message, updatedAt: new Date() },
      });
    throw error;
  }
}

async function readNewCommits(db: Db, client: BsdataClient): Promise<number> {
  const stored = new Set(
    (await db.select({ sha: bsdataCommits.sha }).from(bsdataCommits)).map((row) => row.sha),
  );
  const commits = await client.commits((sha) => stored.has(sha));
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
          summary: update.summary,
          suggestions: update.suggestions,
        };
      })
      .reverse(),
  };
}

/**
 * Applies an admin's edit, unless it would leave the visible updates out of BSData's order or
 * sharing a start (whatever the edit: a new start, a reset, showing or un-merging one).
 */
export async function editGameUpdate(
  db: Db,
  id: string,
  patch: GameUpdatePatch,
  _today: string,
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
  // Visible updates in BSData's order must start on strictly later days.
  const starts = auto.flatMap((update) => {
    const edit = after.get(update.id);
    return edit?.merged === true || edit?.hidden === true ? [] : [edit?.start ?? update.start];
  });
  if (starts.some((start, i) => i > 0 && start <= (starts[i - 1] ?? ''))) return 'out-of-order';
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
