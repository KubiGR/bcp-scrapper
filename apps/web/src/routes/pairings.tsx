import { createFileRoute } from '@tanstack/react-router';
import { PairingsAccess } from '../features/pairings/PairingsAccess';

export const Route = createFileRoute('/pairings')({ component: PairingsAccess });
