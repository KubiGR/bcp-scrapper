import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { MetaPage } from '../features/meta/MetaPage';
import type { MetaSearch } from '../features/meta/meta-queries';

const optionalDay = z.iso.date().optional().catch(undefined);

const MetaSearchSchema = z.object({
  from: optionalDay,
  to: optionalDay,
  type: z.enum(['all', 'singles', 'teams']).optional().catch(undefined),
  minPlayers: z.coerce.number().int().min(1).max(50).optional().catch(undefined),
  view: z.enum(['archetypes', 'armies']).optional().catch(undefined),
  factions: z.string().trim().min(1).optional().catch(undefined),
  sort: z.enum(['faction', 'players', 'winRate', 'x1']).optional().catch(undefined),
  dir: z.enum(['asc', 'desc']).optional().catch(undefined),
  expanded: z.string().trim().min(1).optional().catch(undefined),
});

export const Route = createFileRoute('/analysis/meta')({
  validateSearch: MetaSearchSchema,
  component: MetaRoute,
});

function MetaRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <MetaPage
      search={search}
      onSearchChange={(next: MetaSearch) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}
