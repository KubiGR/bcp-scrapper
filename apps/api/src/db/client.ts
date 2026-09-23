import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

/** Driver-agnostic database handle: node-postgres in production, PGlite in tests and e2e. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** An in-process, in-memory Postgres: end-to-end tests and zero-setup demos. Data is lost on exit. */
export const PGLITE_MEMORY_URL = 'pglite://memory';

export interface Database {
  db: Db;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export function createDb(url: string): Database {
  if (url === PGLITE_MEMORY_URL) {
    const client = new PGlite();
    const db = drizzlePglite({ client, schema });
    return {
      db,
      migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS_DIR }),
      close: () => client.close(),
    };
  }
  const db = drizzle({ connection: url, schema });
  return {
    db,
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
    close: () => db.$client.end(),
  };
}
