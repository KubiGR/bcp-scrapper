import { DetachmentNamesResponseSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '../../api/client';

export const detachmentNamesQuery = queryOptions({
  queryKey: ['detachment-names'],
  queryFn: () => apiGet('/api/detachments', DetachmentNamesResponseSchema),
});

/**
 * Links `name` to `target` (null: its own detachment; with `foreign`, not English; with `ignored`,
 * junk to leave alone).
 */
export const linkDetachment = (
  name: string,
  target: string | null,
  foreign = false,
  ignored = false,
) =>
  apiPost(
    '/api/detachments/links',
    { name, target, foreign, ...(ignored ? { ignored } : {}) },
    DetachmentNamesResponseSchema,
  );

export const unlinkDetachment = (name: string) =>
  apiDelete(`/api/detachments/links/${encodeURIComponent(name)}`, DetachmentNamesResponseSchema);

/** Keeps `name` for `faction` although BSData doesn't list it there. */
export const keepDetachment = (faction: string, name: string) =>
  apiPost('/api/detachments/keeps', { faction, name }, DetachmentNamesResponseSchema);

export const unkeepDetachment = (faction: string, name: string) =>
  apiDelete(
    `/api/detachments/keeps/${encodeURIComponent(faction)}/${encodeURIComponent(name)}`,
    DetachmentNamesResponseSchema,
  );
