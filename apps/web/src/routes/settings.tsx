import { Grid, Stack, Title } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { FetchQueueCard } from '../features/fetch-queue/FetchQueueCard';
import { AutoFetchCard } from '../features/settings/AutoFetchCard';
import { BcpStatusCard } from '../features/settings/BcpStatusCard';
import { DetachmentNamesCard } from '../features/settings/DetachmentNamesCard';
import { UsersCard } from '../features/settings/UsersCard';

export const Route = createFileRoute('/settings')({ component: SettingsPage });

/** Two columns on wide screens: the app's state on the left, detachment names on the right. */
function SettingsPage() {
  return (
    <Stack gap="lg">
      <Title order={1}>Settings</Title>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack gap="lg">
            <BcpStatusCard />
            <FetchQueueCard />
            <AutoFetchCard />
            <UsersCard />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <DetachmentNamesCard />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
