import { createFileRoute } from '@tanstack/react-router';
import { TeamPage } from '../features/analysis/TeamPage';

export const Route = createFileRoute('/events/$eventId_/teams/$teamId')({
  component: TeamRoute,
});

function TeamRoute() {
  const { eventId, teamId } = Route.useParams();
  return <TeamPage key={`${eventId}/${teamId}`} eventId={eventId} teamId={teamId} />;
}
