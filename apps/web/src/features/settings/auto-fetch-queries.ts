import { AutoFetchStateSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../api/client';

export const autoFetchQuery = queryOptions({
  queryKey: ['auto-fetch'],
  queryFn: () => apiGet('/api/auto-fetch', AutoFetchStateSchema),
  refetchInterval: 60_000,
});

export const setAutoFetch = (enabled: boolean) =>
  apiPost('/api/auto-fetch', { enabled }, AutoFetchStateSchema);
