import { createFileRoute } from '@tanstack/react-router';
import { EventPage } from '../features/event/EventPage';
import { EventSearchSchema } from '../features/event/event-search';

export const Route = createFileRoute('/events/$eventId')({
  validateSearch: EventSearchSchema,
  component: EventRoute,
});

function EventRoute() {
  const { eventId } = Route.useParams();
  const { tab, list } = Route.useSearch();
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
      openListId={list ?? null}
      onOpenList={(playerId) => {
        // Opening a list is a step Back undoes; closing it just tidies the address.
        void navigate({
          search: { tab, list: playerId ?? undefined },
          replace: playerId === null,
        });
      }}
    />
  );
}
