import { DetachmentNamesResponseSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '../../api/client';

export const detachmentNamesQuery = queryOptions({
  queryKey: ['detachment-names'],
  queryFn: () => apiGet('/api/detachments', DetachmentNamesResponseSchema),
});

/** Links `name` to `target` (null: its own detachment; with `foreign`, not English). */
export const linkDetachment = (name: string, target: string | null, foreign = false) =>
  apiPost('/api/detachments/links', { name, target, foreign }, DetachmentNamesResponseSchema);

export const unlinkDetachment = (name: string) =>
  apiDelete(`/api/detachments/links/${encodeURIComponent(name)}`, DetachmentNamesResponseSchema);
