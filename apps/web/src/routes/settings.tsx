import { Stack, Title } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { FetchQueueCard } from '../features/fetch-queue/FetchQueueCard';
import { AutoFetchCard } from '../features/settings/AutoFetchCard';
import { BcpStatusCard } from '../features/settings/BcpStatusCard';
import { UsersCard } from '../features/settings/UsersCard';

export const Route = createFileRoute('/settings')({ component: SettingsPage });

function SettingsPage() {
  return (
    <Stack gap="lg" maw={720}>
      <Title order={1}>Settings</Title>
      <BcpStatusCard />
      <FetchQueueCard />
      <AutoFetchCard />
      <UsersCard />
    </Stack>
  );
}
