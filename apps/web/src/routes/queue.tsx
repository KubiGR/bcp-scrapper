import { createFileRoute } from '@tanstack/react-router';
import { QueuePage } from '../features/fetch-queue/QueuePage';

export const Route = createFileRoute('/queue')({ component: QueuePage });
