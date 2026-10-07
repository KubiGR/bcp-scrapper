import {
  MathhammerFactionsSchema,
  MathhammerListSchema,
  MathhammerListsSchema,
  MathhammerUnitsSchema,
} from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../api/client';

export const factionsQuery = queryOptions({
  queryKey: ['mathhammer', 'factions'],
  queryFn: () => apiGet('/api/mathhammer/factions', MathhammerFactionsSchema),
  staleTime: 60 * 60 * 1000,
});

export const unitsQuery = (faction: string) =>
  queryOptions({
    queryKey: ['mathhammer', 'units', faction],
    queryFn: () =>
      apiGet(`/api/mathhammer/units?faction=${encodeURIComponent(faction)}`, MathhammerUnitsSchema),
    staleTime: 60 * 60 * 1000,
  });

export const readList = (text: string) =>
  apiPost('/api/mathhammer/list', { text }, MathhammerListSchema);

export const storedListsQuery = (search: string) =>
  queryOptions({
    queryKey: ['mathhammer', 'lists', search],
    queryFn: () =>
      apiGet(`/api/mathhammer/lists?search=${encodeURIComponent(search)}`, MathhammerListsSchema),
    enabled: search.trim().length >= 2,
  });

export const storedListQuery = (playerId: string) =>
  queryOptions({
    queryKey: ['mathhammer', 'list', playerId],
    queryFn: () =>
      apiGet(`/api/mathhammer/lists/${encodeURIComponent(playerId)}`, MathhammerListSchema),
  });
