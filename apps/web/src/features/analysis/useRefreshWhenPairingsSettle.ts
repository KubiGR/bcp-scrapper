import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Invalidates an event's analysis queries (rounds, standings, team, players — everything keyed
 * under `['event', eventId]`) the moment `queued` drops from >0 to 0. The rounds/standings/team
 * queries only poll while pairings are queued, on their own timer separate from the event
 * query's; without this, the last round's job can land after the event query already saw
 * `queued === 0` and stopped polling, and nothing else would refresh those views.
 */
export function useRefreshWhenPairingsSettle(eventId: string, queued: number): void {
  const queryClient = useQueryClient();
  const [previous, setPrevious] = useState(queued);
  if (queued !== previous) {
    if (previous > 0 && queued === 0) {
      void queryClient.invalidateQueries({ queryKey: ['event', eventId] });
    }
    setPrevious(queued);
  }
}
