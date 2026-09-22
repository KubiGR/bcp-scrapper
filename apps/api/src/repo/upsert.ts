import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * `SET column = excluded.column` for every column except `except`, for use in
 * `onConflictDoUpdate({ set })`: "overwrite the stored row with the incoming one".
 */
export function excludedColumns<T extends PgTable>(
  table: T,
  except: (keyof T['$inferInsert'])[] = [],
): Partial<Record<keyof T['$inferInsert'], SQL>> {
  const skip = new Set<PropertyKey>(except);
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([key]) => !skip.has(key))
      .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
  ) as Partial<Record<keyof T['$inferInsert'], SQL>>;
}
