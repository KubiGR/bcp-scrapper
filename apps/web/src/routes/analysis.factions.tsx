import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { FactionsPage, type FactionsSearch } from '../features/meta/FactionsPage';
import { usePageTitle } from '../lib/page-title';

const optionalDay = z.iso.date().optional().catch(undefined);

const FactionsSearchSchema = z.object({
  from: optionalDay,
  to: optionalDay,
  type: z.enum(['all', 'singles', 'teams']).optional().catch(undefined),
  layout: z.literal('flat').optional().catch(undefined),
});

export const Route = createFileRoute('/analysis/factions')({
  validateSearch: FactionsSearchSchema,
  component: FactionsRoute,
});

function FactionsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  usePageTitle('Factions');
  return (
    <FactionsPage
      search={search}
      onSearchChange={(next: FactionsSearch) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}
