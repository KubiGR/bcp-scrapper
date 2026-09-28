import { Table } from '@mantine/core';
import { act, fireEvent, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { SortableTh, sortRows, useTableSort, type SortState } from './table-sort';

interface Row {
  name: string;
  wins: number | null;
}
const rows: Row[] = [
  { name: 'bravo', wins: 2 },
  { name: 'Alpha', wins: null },
  { name: 'charlie', wins: 5 },
];
const values = { name: (r: Row) => r.name, wins: (r: Row) => r.wins };

describe('sortRows', () => {
  it('sorts text A→Z ignoring case, numbers either way, blanks always last', () => {
    expect(sortRows(rows, values.name, 'asc').map((r) => r.name)).toEqual([
      'Alpha',
      'bravo',
      'charlie',
    ]);
    expect(sortRows(rows, values.wins, 'desc').map((r) => r.wins)).toEqual([5, 2, null]);
    expect(sortRows(rows, values.wins, 'asc').map((r) => r.wins)).toEqual([2, 5, null]);
  });
});

describe('useTableSort', () => {
  it('turns sorting off on a third pick of the same column', () => {
    const { result } = renderHook(() => useTableSort(rows, values));
    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.toggle('wins');
      });
    }
    expect(result.current.sort).toBeNull();
    expect(result.current.sorted).toBe(rows);
  });

  it('goes back to the starting sort on a third pick', () => {
    const initial: SortState<'name' | 'wins'> = { key: 'name', dir: 'asc' };
    const { result } = renderHook(() => useTableSort(rows, values, initial));
    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.toggle('wins');
      });
    }
    expect(result.current.sort).toEqual(initial);
  });

  it('keeps the rows as given until a column is picked, then flips on a second pick', () => {
    const { result } = renderHook(() => useTableSort(rows, values));
    expect(result.current.sorted).toBe(rows);
    act(() => {
      result.current.toggle('wins');
    });
    // Numbers start high to low; text starts A→Z.
    expect(result.current.sort).toEqual({ key: 'wins', dir: 'desc' });
    act(() => {
      result.current.toggle('wins');
    });
    expect(result.current.sort).toEqual({ key: 'wins', dir: 'asc' });
    act(() => {
      result.current.toggle('name');
    });
    expect(result.current.sorted.map((r) => r.name)).toEqual(['Alpha', 'bravo', 'charlie']);
  });

  it('lets a column start the other way (a placing: 1st first)', () => {
    const { result } = renderHook(() => useTableSort(rows, values, null, { wins: 'asc' }));
    act(() => {
      result.current.toggle('wins');
    });
    expect(result.current.sort).toEqual({ key: 'wins', dir: 'asc' });
  });

  it('starts from a given sort', () => {
    const { result } = renderHook(() => useTableSort(rows, values, { key: 'name', dir: 'desc' }));
    expect(result.current.sorted.map((r) => r.name)).toEqual(['charlie', 'bravo', 'Alpha']);
  });
});

describe('SortableTh', () => {
  it('is a header button that says how the column is sorted', () => {
    let picked = '';
    renderWithProviders(
      <Table>
        <Table.Thead>
          <Table.Tr>
            <SortableTh
              column="wins"
              sort={{ key: 'wins', dir: 'asc' }}
              onSort={(key) => {
                picked = key;
              }}
            >
              Wins
            </SortableTh>
            <SortableTh column="name" sort={{ key: 'wins', dir: 'asc' }} onSort={() => undefined}>
              Name
            </SortableTh>
          </Table.Tr>
        </Table.Thead>
      </Table>,
    );
    expect(screen.getByRole('columnheader', { name: /Wins/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(screen.getByRole('button', { name: /Wins/ }));
    expect(picked).toBe('wins');
  });
});
