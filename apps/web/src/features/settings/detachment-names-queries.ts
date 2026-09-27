import { DetachmentNamesResponseSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '../../api/client';

export const detachmentNamesQuery = queryOptions({
  queryKey: ['detachment-names'],
  queryFn: () => apiGet('/api/detachments', DetachmentNamesResponseSchema),
});

export const linkDetachment = (name: string, target: string | null) =>
  apiPost('/api/detachments/links', { name, target }, DetachmentNamesResponseSchema);

export const unlinkDetachment = (name: string) =>
  apiDelete(`/api/detachments/links/${encodeURIComponent(name)}`, DetachmentNamesResponseSchema);
