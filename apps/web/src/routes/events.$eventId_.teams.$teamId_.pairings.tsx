import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

/** The old per-team address: the planner now lives at /pairings. */
export const Route = createFileRoute('/events/$eventId_/teams/$teamId_/pairings')({
  validateSearch: z.object({ opponent: z.string().optional() }),
  beforeLoad: ({ params, search }) => {
    redirect({
      to: '/pairings',
      search: { event: params.eventId, team: params.teamId, opponent: search.opponent },
      replace: true,
      throw: true,
    });
  },
});
