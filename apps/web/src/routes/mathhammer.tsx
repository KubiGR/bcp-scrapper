import { createFileRoute } from '@tanstack/react-router';
import { MathhammerPage } from '../features/mathhammer/MathhammerPage';

export const Route = createFileRoute('/mathhammer')({ component: MathhammerPage });
