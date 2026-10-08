import { createFileRoute, redirect } from '@tanstack/react-router';
import { useEffect } from 'react';
import {
  PairingsChoiceSchema,
  startChoice,
  writeLastChoice,
} from '../features/pairings/last-choice';
import { PairingsPage } from '../features/pairings/PairingsPage';

export const Route = createFileRoute('/pairings')({
  validateSearch: PairingsChoiceSchema,
  // Opening the planner from the menu goes back to the last event, team and opponent.
  beforeLoad: ({ search }) => {
    const start = startChoice(search);
    if (start) redirect({ to: '/pairings', search: start, replace: true, throw: true });
  },
  component: PairingsRoute,
});

function PairingsRoute() {
  const choice = Route.useSearch();
  const navigate = Route.useNavigate();
  useEffect(() => {
    if (choice.event !== undefined) writeLastChoice(choice);
  }, [choice]);
  return (
    <PairingsPage
      choice={choice}
      onChange={(next) => {
        void navigate({ search: next, replace: true });
      }}
    />
  );
}
