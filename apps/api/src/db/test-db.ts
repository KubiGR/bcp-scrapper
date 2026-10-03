import { sql } from 'drizzle-orm';
import { createDb, PGLITE_MEMORY_URL, type Db } from './client';

/** An in-process Postgres with all migrations applied. Create one per test file. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const database = createDb(PGLITE_MEMORY_URL);
  await database.migrate();
  return { db: database.db, close: () => database.close() };
}

export async function resetDb(db: Db): Promise<void> {
  await db.execute(
    sql`truncate events, teams, players, army_lists, team_matchups, games, sync_runs, bcp_session, fetch_queue, sessions, users, app_settings, detachment_links, bsdata_detachments, bsdata_files, detachment_keeps restart identity cascade`,
  );
}
