import { createFileRoute } from '@tanstack/react-router';
import { EventPage } from '../features/event/EventPage';
import { EventSearchSchema } from '../features/event/event-search';

export const Route = createFileRoute('/events/$eventId')({
  validateSearch: EventSearchSchema,
  component: EventRoute,
});

function EventRoute() {
  const { eventId } = Route.useParams();
  const { tab, list, ...playerSearch } = Route.useSearch();
  const navigate = Route.useNavigate();
  // A new key per event resets local state and sync progress when switching events.
  return (
    <EventPage
      key={eventId}
      eventId={eventId}
      tab={tab}
      onTabChange={(next) => {
        void navigate({
          search: (previous) => ({ ...previous, tab: next, list: undefined }),
          replace: true,
          resetScroll: false,
        });
      }}
      openListId={list ?? null}
      onOpenList={(playerId) => {
        // Opening a list is a step Back undoes; closing it just tidies the address. Either way
        // the page stays where it was scrolled to.
        void navigate({
          search: (previous) => ({ ...previous, tab: 'players', list: playerId ?? undefined }),
          replace: playerId === null,
          resetScroll: false,
        });
      }}
      playerSearch={playerSearch}
      onPlayerSearchChange={(changes) => {
        void navigate({
          search: (previous) => ({ ...previous, ...changes }),
          replace: 'q' in changes,
          resetScroll: false,
        });
      }}
    />
  );
}
