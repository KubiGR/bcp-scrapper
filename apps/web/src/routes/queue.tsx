import { createFileRoute } from '@tanstack/react-router';
import { AdminOnly } from '../features/auth/AdminOnly';
import { QueuePage } from '../features/fetch-queue/QueuePage';
import { usePageTitle } from '../lib/page-title';

export const Route = createFileRoute('/queue')({
  component: QueueRoute,
});

function QueueRoute() {
  usePageTitle('Queue');
  return (
    <AdminOnly>
      <QueuePage />
    </AdminOnly>
  );
}
