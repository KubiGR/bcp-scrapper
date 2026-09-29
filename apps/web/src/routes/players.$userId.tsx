import { createFileRoute } from '@tanstack/react-router';
import { PlayerPage } from '../features/rankings/PlayerPage';

export const Route = createFileRoute('/players/$userId')({ component: PlayerRoute });

function PlayerRoute() {
  const { userId } = Route.useParams();
  return <PlayerPage userId={userId} />;
}
