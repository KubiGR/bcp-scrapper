import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { EVENT_TABS, EventPage, type EventTab } from '../features/event/EventPage';

const tabValues = EVENT_TABS.map((tab) => tab.value) as [EventTab, ...EventTab[]];

export const Route = createFileRoute('/events/$eventId')({
  validateSearch: z.object({ tab: z.enum(tabValues).catch('players') }),
  component: EventRoute,
});

function EventRoute() {
  const { eventId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  // A new key per event resets filters, the open drawer and sync progress when switching events.
  return (
    <EventPage
      key={eventId}
      eventId={eventId}
      tab={tab}
      onTabChange={(next) => {
        void navigate({ search: { tab: next }, replace: true });
      }}
    />
  );
}
