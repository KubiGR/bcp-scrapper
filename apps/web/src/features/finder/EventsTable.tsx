import type { EventListItem, EventListResponse } from '@bcp/shared';
import { Text, UnstyledButton, type MantineTheme } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { EventStatusBadges } from '../../components/EventStatusBadges';
import { Panel } from '../../components/Panel';
import { formatEventDates, formatEventSize } from '../../lib/format';
import classes from './EventsTable.module.css';
import { FINDER_PAGE_SIZE } from './finder-search';

interface EventsTableProps {
  response: EventListResponse | undefined;
  fetching: boolean;
  page: number;
  onPageChange: (page: number) => void;
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
  response,
  fetching,
  page,
  onPageChange,
  onOpen,
  emptyText,
}: EventsTableProps) {
  return (
    <Panel p={0}>
      <DataTable<EventListItem>
        records={response?.items ?? []}
        idAccessor="bcpId"
        fetching={fetching}
        minHeight={240}
        highlightOnHover
        noRecordsText={emptyText}
        totalRecords={response?.total ?? 0}
        recordsPerPage={FINDER_PAGE_SIZE}
        page={page}
        onPageChange={onPageChange}
        onRowClick={({ record }) => {
          onOpen(record.bcpId);
        }}
        columns={[
          {
            accessor: 'startDate',
            title: 'Date',
            visibleMediaQuery: wide,
            render: (event) => (
              <Text size="sm" className="numeric">
                {formatEventDates(event.startDate, event.endDate)}
              </Text>
            ),
          },
          {
            accessor: 'name',
            title: 'Tournament',
            render: (event) => (
              <>
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
                <Text size="xs" c="dimmed" hiddenFrom="sm">
                  {`${formatEventDates(event.startDate, event.endDate)} · ${placeOf(event)} · ${formatEventSize(event)}`}
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
            textAlign: 'right',
            visibleMediaQuery: wide,
            render: (event) => (
              <Text size="sm" className="numeric">
                {formatEventSize(event)}
              </Text>
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
