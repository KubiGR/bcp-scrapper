import { createFileRoute } from '@tanstack/react-router';
import { PairingsPage } from '../features/pairings/PairingsPage';

export const Route = createFileRoute('/pairings')({ component: PairingsPage });
