import { DetachmentsStatusSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

/** Each faction's known detachment count, read from 39k.pro with the unit data. */
export const knownDetachmentsQuery = queryOptions({
  queryKey: ['known-detachments'],
  queryFn: () => apiGet('/api/detachments/known', DetachmentsStatusSchema),
});
