import { CatalogCoverageSchema, EventListResponseSchema } from '@bcp/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

/** Every events query starts with ['events'], so a catalogue sync refreshes them all. */
export const eventsQuery = (queryString: string) =>
  queryOptions({
    queryKey: ['events', queryString],
    queryFn: () => apiGet(`/api/events?${queryString}`, EventListResponseSchema),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.items.some((event) => (event.listProgress?.listsQueued ?? 0) > 0)
        ? 5000
        : false,
  });

export const coverageQuery = queryOptions({
  queryKey: ['catalog', 'coverage'],
  queryFn: () => apiGet('/api/catalog/coverage', CatalogCoverageSchema),
  // While any catalogue run is active (even one started elsewhere), keep checking until it ends.
  refetchInterval: (query) => (query.state.data?.activeRun ? 2000 : false),
});
