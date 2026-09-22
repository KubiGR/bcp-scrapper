import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { MIGRATIONS_DIR, type Db } from './client';
import * as schema from './schema';

/** An in-process Postgres with all migrations applied. Create one per test file. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, close: () => client.close() };
}

export async function resetDb(db: Db): Promise<void> {
  await db.execute(
    sql`truncate events, teams, players, army_lists, team_matchups, games, sync_runs, bcp_session restart identity cascade`,
  );
}
