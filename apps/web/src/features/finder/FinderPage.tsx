import { Stack } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { ErrorState } from '../../components/ErrorState';
import { FilterToggle } from '../../components/FilterToggle';
import { Panel } from '../../components/Panel';
import { PageTitle, SidebarLayout } from '../../components/Scoreboard';
import { AdvancedSearch } from './AdvancedSearch';
import { CatalogStatus } from './CatalogStatus';
import { CoverageNotice } from './CoverageNotice';
import { EventsSort, EventsTable } from './EventsTable';
import { eventsQuery } from './finder-queries';
import {
  finderWindow,
  isLatestView,
  toEventsQueryString,
  type FinderChangeOptions,
  type FinderSearch,
} from './finder-search';
import { SizeFilter } from './SizeFilter';
import { usePageTitle } from '../../lib/page-title';

const route = getRouteApi('/');

const LATEST_EMPTY =
  'No tournaments of this size in the last 30 days. Try a smaller size or the advanced search.';
const SEARCH_EMPTY =
  'No tournaments match. Try a smaller size, a wider date range, or fetching missing dates above.';

export function FinderPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  usePageTitle(search.q && `“${search.q}”`, search.country, 'Tournaments');
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
    <SidebarLayout
      sidebarLabel="Filters"
      sidebar={
        <FilterToggle active={isLatestView(search) ? 0 : 1}>
          <Panel title="Filters">
            <Stack gap="md">
              <SizeFilter search={search} onChange={update} />
              <EventsSort
                sort={search.sort}
                dir={search.dir}
                onSortChange={(next) => {
                  update({ sort: next?.sort ?? 'date', dir: next?.dir ?? 'desc', page: 1 });
                }}
              />
              <AdvancedSearch search={search} window={window} onChange={update} />
              <CatalogStatus />
            </Stack>
          </Panel>
        </FilterToggle>
      }
    >
      <Stack gap="lg">
        <PageTitle>Tournaments</PageTitle>
        {!isLatestView(search) && <CoverageNotice window={window} />}
        {events.error ? (
          <ErrorState error={events.error} onRetry={() => void events.refetch()} />
        ) : (
          <EventsTable
            sort={search.sort}
            response={events.data}
            fetching={events.isFetching}
            page={search.page}
            onPageChange={(page) => {
              update({ page });
            }}
            perPage={search.per}
            onPerPageChange={(per) => {
              update({ per, page: 1 });
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
    </SidebarLayout>
  );
}
