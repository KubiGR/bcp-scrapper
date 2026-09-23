import { createFileRoute } from '@tanstack/react-router';
import { EventPage } from '../features/event/EventPage';

export const Route = createFileRoute('/events/$eventId')({ component: EventRoute });

function EventRoute() {
  const { eventId } = Route.useParams();
  // A new key per event resets filters, the open drawer and sync progress when switching events.
  return <EventPage key={eventId} eventId={eventId} />;
}
