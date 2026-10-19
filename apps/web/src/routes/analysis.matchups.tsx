import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { MatchupsPage } from '../features/matchups/MatchupsPage';
import { fromLegacySearch, type CrossSearch } from '../features/matchups/matchups-queries';

const optionalDay = z.iso.date().optional().catch(undefined);
const optionalText = z.string().trim().min(1).optional().catch(undefined);

const MatchupsSearchSchema = z.object({
  from: optionalDay,
  to: optionalDay,
  exclude: optionalText,
  include: optionalText,
  metric: z.enum(['winRate', 'points']).optional().catch(undefined),
  order: z.enum(['overall', 'name']).optional().catch(undefined),
  minGames: z.coerce.number().int().positive().optional().catch(undefined),
  dispositions: optionalText,
  detachments: optionalText,
  /** Pre-multi-select links; read into `dispositions`. */
  disposition: optionalText,
  side: z.enum(['row', 'both']).optional().catch(undefined),
  /** `|`-separated factions shown as rows. */
  factions: optionalText,
});

export const Route = createFileRoute('/analysis/matchups')({
  validateSearch: MatchupsSearchSchema,
  component: MatchupsRoute,
});

function MatchupsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <MatchupsPage
      search={fromLegacySearch(search)}
      onSearchChange={(next: CrossSearch) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}
