import { MathhammerFactionsSchema, MathhammerUnitsSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

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
