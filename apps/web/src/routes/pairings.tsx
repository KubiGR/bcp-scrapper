import { createFileRoute } from '@tanstack/react-router';
import { PairingsAccess } from '../features/pairings/PairingsAccess';
import { usePageTitle } from '../lib/page-title';

export const Route = createFileRoute('/pairings')({ component: PairingsAccessRoute });

function PairingsAccessRoute() {
  usePageTitle('Pairings');
  return <PairingsAccess />;
}
