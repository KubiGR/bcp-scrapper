import type { EventListItem, EventListResponse } from '@bcp/shared';
import { Box, Text, UnstyledButton, type MantineTheme } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { EventStatusBadges } from '../../components/EventStatusBadges';
import { Panel } from '../../components/Panel';
import { formatEventDates } from '../../lib/format';
import classes from './EventsTable.module.css';
import { FINDER_PAGE_SIZES, type FinderPageSize, type FinderSearch } from './finder-search';
import { SizeBadge } from './SizeBadge';
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
        rowClassName={(event, index) =>
          index > 0 && weekStarts.has(event.bcpId) ? classes.weekStart : undefined
        }
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
                {weekStarts.has(event.bcpId) && (
                  <Text className={classes.week}>{weekStarts.get(event.bcpId)}</Text>
                )}
                <UnstyledButton
                  className={classes.eventName}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(event.bcpId);
                  }}
                >
                  <Text component="span" size="sm" fw={500}>
                    {event.name}
                  </Text>
                </UnstyledButton>
                <Box hiddenFrom="sm" mt={4}>
                  <SizeBadge playerCount={event.playerCount} />
                </Box>
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
                <SizeBadge playerCount={event.playerCount} />
                {event.teamCount !== null && (
                  <Text size="xs" c="dimmed" className="numeric">
                    {`${event.teamCount} ${event.teamCount === 1 ? 'team' : 'teams'}`}
                  </Text>
                )}
              </>
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
