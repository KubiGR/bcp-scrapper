import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { PairingsPage } from '../features/pairings/PairingsPage';

export const Route = createFileRoute('/events/$eventId_/teams/$teamId_/pairings')({
  validateSearch: z.object({ opponent: z.string().optional() }),
  component: PairingsRoute,
});

function PairingsRoute() {
  const { eventId, teamId } = Route.useParams();
  const { opponent } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PairingsPage
      key={`${eventId}/${teamId}`}
      eventId={eventId}
      teamId={teamId}
      opponentId={opponent ?? null}
      onOpponentChange={(next) => {
        void navigate({ search: { opponent: next }, replace: true });
      }}
    />
  );
}
