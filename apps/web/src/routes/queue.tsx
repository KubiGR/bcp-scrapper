import { createFileRoute } from '@tanstack/react-router';
import { AdminOnly } from '../features/auth/AdminOnly';
import { QueuePage } from '../features/fetch-queue/QueuePage';

export const Route = createFileRoute('/queue')({
  component: () => (
    <AdminOnly>
      <QueuePage />
    </AdminOnly>
  ),
});
