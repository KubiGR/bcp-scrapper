import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { TopListsPage } from '../features/top-lists/TopListsPage';
import type { TopListsSearch } from '../features/top-lists/top-lists-queries';

const optionalDay = z.iso.date().optional().catch(undefined);
const optionalText = z.string().trim().min(1).optional().catch(undefined);

const TopListsSearchSchema = z.object({
  factions: optionalText,
  dispositions: optionalText,
  detachments: optionalText,
  from: optionalDay,
  to: optionalDay,
  maxLosses: z.coerce.number().int().min(0).max(5).optional().catch(undefined),
});

export const Route = createFileRoute('/analysis/top-lists')({
  validateSearch: TopListsSearchSchema,
  component: TopListsRoute,
});

function TopListsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <TopListsPage
      search={search}
      onSearchChange={(next: TopListsSearch) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}
