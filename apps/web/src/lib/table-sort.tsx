import { Table, UnstyledButton, type TableThProps } from '@mantine/core';
import { useState, type ReactNode } from 'react';

export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}
/** A column's sort value: text sorts A→Z ignoring case, numbers by size; null = blank. */
export type SortValue<T> = (row: T) => string | number | null;

/** The rows sorted by one column, blanks always last whichever way it sorts. */
export function sortRows<T>(rows: T[], value: SortValue<T>, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) return Number(x === null) - Number(y === null);
    const order =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), undefined, { sensitivity: 'base' });
    return sign * order;
  });
}

/**
 * Click-to-sort for a table: rows stay as given until a column is picked (or from `initial`);
 * picking a column sorts it — numbers high to low first, text A→Z first, unless `firstDirs` says
 * otherwise — picking it again flips the direction, and a third pick turns sorting off (back to
 * `initial`).
 */
export function useTableSort<T, K extends string>(
  rows: T[],
  values: Record<K, SortValue<T>>,
  initial: SortState<K> | null = null,
  firstDirs: Partial<Record<K, SortDir>> = {},
) {
  const [sort, setSort] = useState<SortState<K> | null>(initial);
  const firstDir = (key: K): SortDir => {
    const sample = rows.map(values[key]).find((value) => value !== null);
    return firstDirs[key] ?? (typeof sample === 'number' ? 'desc' : 'asc');
  };
  const toggle = (key: K) => {
    setSort((current) => {
      const first = firstDir(key);
      if (current?.key !== key) return { key, dir: first };
      if (current.dir === first) return { key, dir: first === 'asc' ? 'desc' : 'asc' };
      return initial;
    });
  };
  const sorted = sort === null ? rows : sortRows(rows, values[sort.key], sort.dir);
  return { sorted, sort, toggle };
}

interface SortableThProps<K extends string> extends Omit<TableThProps, 'children'> {
  column: K;
  sort: SortState<K> | null;
  onSort: (column: K) => void;
  children: ReactNode;
}

/** A column header that sorts its table: a button, with aria-sort and an arrow when active. */
export function SortableTh<K extends string>({
  column,
  sort,
  onSort,
  children,
  ...thProps
}: SortableThProps<K>) {
  const dir = sort?.key === column ? sort.dir : null;
  return (
    <Table.Th
      {...thProps}
      aria-sort={dir === null ? 'none' : dir === 'asc' ? 'ascending' : 'descending'}
    >
      <UnstyledButton
        fz="sm"
        fw={dir === null ? 500 : 700}
        onClick={() => {
          onSort(column);
        }}
      >
        {children}
        {dir !== null && <span aria-hidden>{dir === 'asc' ? ' ↑' : ' ↓'}</span>}
      </UnstyledButton>
    </Table.Th>
  );
}
