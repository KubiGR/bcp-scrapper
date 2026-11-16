import { createFileRoute } from '@tanstack/react-router';
import { MathhammerPage } from '../features/mathhammer/MathhammerPage';
import { usePageTitle } from '../lib/page-title';

export const Route = createFileRoute('/mathhammer')({ component: MathhammerPageRoute });

function MathhammerPageRoute() {
  usePageTitle('Mathhammer');
  return <MathhammerPage />;
}
