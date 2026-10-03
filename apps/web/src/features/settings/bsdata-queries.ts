import { BsdataStatusSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../api/client';

export const bsdataQuery = queryOptions({
  queryKey: ['bsdata'],
  queryFn: () => apiGet('/api/bsdata', BsdataStatusSchema),
});

/** Reads BSData again now (admins, when logins are on). */
export const refreshBsdata = () => apiPost('/api/bsdata/refresh', {}, BsdataStatusSchema);
