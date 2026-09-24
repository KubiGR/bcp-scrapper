import { Stack, Title } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { ListQueueCard } from '../features/list-queue/ListQueueCard';
import { BcpStatusCard } from '../features/settings/BcpStatusCard';

export const Route = createFileRoute('/settings')({ component: SettingsPage });

function SettingsPage() {
  return (
    <Stack gap="lg" maw={720}>
      <Title order={1}>Settings</Title>
      <BcpStatusCard />
      <ListQueueCard />
    </Stack>
  );
}
