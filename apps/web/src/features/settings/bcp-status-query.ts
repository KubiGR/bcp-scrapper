import { BcpStatusSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

export const bcpStatusQuery = queryOptions({
  queryKey: ['bcp', 'status'],
  queryFn: () => apiGet('/api/bcp/status', BcpStatusSchema),
});
