import { Group, Stack, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { AdvancedSearch } from './AdvancedSearch';
import { CatalogStatus } from './CatalogStatus';
import { CoverageNotice } from './CoverageNotice';
import { EventsTable } from './EventsTable';
import { eventsQuery } from './finder-queries';
import {
  finderWindow,
  isLatestView,
  toEventsQueryString,
  type FinderChangeOptions,
  type FinderSearch,
} from './finder-search';
import { SizeFilter } from './SizeFilter';

const route = getRouteApi('/');

const LATEST_EMPTY =
  'No tournaments of this size in the last 30 days. Try a smaller size or the advanced search.';
const SEARCH_EMPTY =
  'No tournaments match. Try a smaller size, a wider date range, or fetching missing dates above.';

export function FinderPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const now = new Date();
  const window = finderWindow(search, now);
  const events = useQuery(eventsQuery(toEventsQueryString(search, now)));

  const update = (changes: Partial<FinderSearch>, options?: FinderChangeOptions) => {
    void navigate({
      search: (previous) => ({ ...previous, page: 1, ...changes }),
      replace: options?.replace,
    });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={1}>Tournaments</Title>
        <CatalogStatus />
      </Group>
      <Panel title="Filters">
        <Stack gap="md">
          <SizeFilter search={search} onChange={update} />
          <AdvancedSearch search={search} window={window} onChange={update} />
        </Stack>
      </Panel>
      {!isLatestView(search) && <CoverageNotice window={window} />}
      {events.error ? (
        <ErrorState error={events.error} onRetry={() => void events.refetch()} />
      ) : (
        <EventsTable
          response={events.data}
          fetching={events.isFetching}
          page={search.page}
          onPageChange={(page) => {
            update({ page });
          }}
          onOpen={(eventId) => {
            void navigate({
              to: '/events/$eventId',
              params: { eventId },
              search: { tab: 'players' },
            });
          }}
          emptyText={isLatestView(search) ? LATEST_EMPTY : SEARCH_EMPTY}
        />
      )}
    </Stack>
  );
}
