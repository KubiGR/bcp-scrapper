import type { EventListItem, EventListResponse } from '@bcp/shared';
import { Table, Text, UnstyledButton, type MantineTheme } from '@mantine/core';
import { Fragment } from 'react';
import { DataTable } from 'mantine-datatable';
import { EventStatusBadges } from '../../components/EventStatusBadges';
import { FieldElo } from '../../components/FieldElo';
import { Panel } from '../../components/Panel';
import { formatEventDates, plural } from '../../lib/format';
import { eventPath, openHere } from '../../lib/open-link';

import classes from './EventsTable.module.css';
import { FINDER_PAGE_SIZES, type FinderPageSize, type FinderSearch } from './finder-search';
import { EventHeat, NameWithLeaf } from '../../components/EventSymbols';
import { weekOf } from './week';
import { UpdateLabel } from '../updates/UpdateLabel';

type EventSort = FinderSearch['sort'];
type SortDir = FinderSearch['dir'];
const SORT_BY_ACCESSOR: Partial<Record<string, EventSort>> = {
  startDate: 'date',
  playerCount: 'players',
};
const ACCESSOR_BY_SORT: Record<EventSort, string> = { date: 'startDate', players: 'playerCount' };

interface EventsTableProps {
  /** The server's sort (the table is paged there); `onSortChange(null)` goes back to newest first. */
  sort: EventSort;
  dir: SortDir;
  onSortChange: (next: { sort: EventSort; dir: SortDir } | null) => void;
  response: EventListResponse | undefined;
  fetching: boolean;
  page: number;
  onPageChange: (page: number) => void;
  perPage: FinderPageSize;
  onPerPageChange: (perPage: FinderPageSize) => void;
  onOpen: (eventId: string) => void;
  emptyText: string;
}

/**
 * Date, place, size and rounds get their own columns from tablet width up; on phones, a line under
 * the name.
 */
const wide = (theme: MantineTheme) => `(min-width: ${theme.breakpoints.sm})`;
const placeOf = (event: EventListItem) =>
  [event.city, event.country].filter(Boolean).join(', ') || '—';

export function EventsTable({
  sort,
  dir,
  onSortChange,
  response,
  fetching,
  page,
  onPageChange,
  perPage,
  onPerPageChange,
  onOpen,
  emptyText,
}: EventsTableProps) {
  const records = response?.items ?? [];
  // By date, the server sends a week at a time (biggest first): each week's first event names it.
  const weekStarts = new Map<string, string>();
  // Every other week shaded, so the weeks read as groups.
  const shade = new Map<string, 'even' | 'odd'>();
  if (sort === 'date') {
    let last: string | null = null;
    let weeks = 0;
    for (const event of records) {
      const week = weekOf(event.startDate);
      if (week.key !== last) {
        weekStarts.set(event.bcpId, week.label);
        weeks += 1;
      }
      shade.set(event.bcpId, weeks % 2 === 1 ? 'even' : 'odd');
      last = week.key;
    }
  }
  return (
    <Panel p={0}>
      <DataTable<EventListItem>
        records={records}
        rowFactory={({ record, children, rowProps }) => {
          const week = weekStarts.get(record.bcpId);
          const row = <Table.Tr {...rowProps}>{children}</Table.Tr>;
          if (week === undefined) return row;
          // A heading row across the table before each week's first event.
          return (
            <Fragment key={record.bcpId}>
              <Table.Tr className={classes.weekRow}>
                <Table.Td colSpan={99} className={classes.week}>
                  {week}
                </Table.Td>
              </Table.Tr>
              {row}
            </Fragment>
          );
        }}
        customRowAttributes={(event) => {
          const parity = shade.get(event.bcpId);
          return parity ? { 'data-week-shade': parity } : {};
        }}
        idAccessor="bcpId"
        fetching={fetching}
        minHeight={240}
        highlightOnHover
        noRecordsText={emptyText}
        totalRecords={response?.total ?? 0}
        recordsPerPage={perPage}
        recordsPerPageOptions={[...FINDER_PAGE_SIZES]}
        recordsPerPageLabel="Per page"
        onRecordsPerPageChange={(n) => {
          const size = FINDER_PAGE_SIZES.find((option) => option === n);
          if (size !== undefined) onPerPageChange(size);
        }}
        page={page}
        onPageChange={onPageChange}
        sortStatus={{ columnAccessor: ACCESSOR_BY_SORT[sort], direction: dir }}
        onSortStatusChange={({ columnAccessor }) => {
          const key = SORT_BY_ACCESSOR[String(columnAccessor)];
          if (key === undefined) return;
          // Newest or biggest first, then the other way, then back to the default.
          if (key !== sort) onSortChange({ sort: key, dir: 'desc' });
          else if (dir === 'desc') onSortChange({ sort: key, dir: 'asc' });
          else onSortChange(null);
        }}
        onRowClick={({ record }) => {
          onOpen(record.bcpId);
        }}
        columns={[
          {
            accessor: 'startDate',
            title: 'Date',
            sortable: true,
            visibleMediaQuery: wide,
            render: (event) => (
              <>
                <Text size="sm" className="numeric">
                  {formatEventDates(event.startDate, event.endDate)}
                </Text>
                <UpdateLabel startDate={event.startDate} size="xs" c="dimmed" />
              </>
            ),
          },
          {
            accessor: 'name',
            title: 'Tournament',
            render: (event) => (
              <>
                <UnstyledButton
                  component="a"
                  href={eventPath(event.bcpId)}
                  className={classes.eventName}
                  onClick={openHere(() => {
                    onOpen(event.bcpId);
                  })}
                >
                  <Text component="span" size="sm" fw={500}>
                    <NameWithLeaf name={event.name} startDate={event.startDate} />
                  </Text>
                </UnstyledButton>
                <Text size="xs" c="dimmed" hiddenFrom="sm" mt={4} className="numeric">
                  {plural(event.playerCount, 'player')}
                  <EventHeat playerCount={event.playerCount} />
                  {event.fieldElo !== null && ' · '}
                  <FieldElo elo={event.fieldElo} />
                </Text>
                <Text size="xs" c="dimmed" hiddenFrom="sm">
                  {`${formatEventDates(event.startDate, event.endDate)} · ${placeOf(event)}`}
                </Text>
              </>
            ),
          },
          {
            accessor: 'country',
            title: 'Location',
            visibleMediaQuery: wide,
            render: placeOf,
          },
          {
            accessor: 'playerCount',
            title: 'Size',
            sortable: true,
            textAlign: 'right',
            visibleMediaQuery: wide,
            render: (event) => (
              <>
                <Text size="sm" className="numeric" style={{ whiteSpace: 'nowrap' }}>
                  <EventHeat playerCount={event.playerCount} before />
                  {plural(event.playerCount, 'player')}
                </Text>
                {event.teamCount !== null && (
                  <Text size="xs" c="dimmed" className="numeric">
                    {`${event.teamCount} ${event.teamCount === 1 ? 'team' : 'teams'}`}
                  </Text>
                )}
              </>
            ),
          },
          {
            accessor: 'fieldElo',
            title: 'Elo',
            textAlign: 'right',
            visibleMediaQuery: wide,
            render: (event) => (
              <span className="numeric">
                {event.fieldElo === null ? '—' : <FieldElo elo={event.fieldElo} bare />}
              </span>
            ),
          },
          {
            accessor: 'roundCount',
            title: 'Rounds',
            textAlign: 'right',
            visibleMediaQuery: wide,
            render: (event) => (
              <span className="numeric">{event.roundCount > 0 ? event.roundCount : '—'}</span>
            ),
          },
          {
            accessor: 'lastSyncedAt',
            title: 'Status',
            render: (event) => <EventStatusBadges event={event} />,
          },
        ]}
      />
    </Panel>
  );
}
