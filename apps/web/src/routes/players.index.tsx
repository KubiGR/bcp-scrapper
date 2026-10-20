import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { PlayersPage, type PlayersSearch } from '../features/rankings/PlayersPage';

const optionalText = z.string().trim().min(1).max(100).optional().catch(undefined);

const PlayersSearchSchema = z.object({
  // As typed, spaces included: trimming here would eat the space between first and last name.
  q: z.string().min(1).max(100).optional().catch(undefined),
  faction: optionalText,
  order: z.enum(['overall', 'wh40kElo']).optional().catch(undefined),
});

export const Route = createFileRoute('/players/')({
  validateSearch: PlayersSearchSchema,
  component: PlayersRoute,
});

function PlayersRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PlayersPage
      search={search}
      onSearchChange={(next: PlayersSearch) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}
