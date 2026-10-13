import { Grid, Stack, Tabs, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { meQuery } from '../auth/auth-queries';
import { FetchQueueCard } from '../fetch-queue/FetchQueueCard';
import { UpdatesSection } from '../updates/UpdatesSection';
import { AutoFetchCard } from './AutoFetchCard';
import { BcpStatusCard } from './BcpStatusCard';
import { BsdataCard } from './BsdataCard';
import { DetachmentNamesCard } from './DetachmentNamesCard';
import { RulesCard } from './RulesCard';
import { SETTINGS_TABS, type SettingsTab } from './settings-search';
import { UsersCard } from './UsersCard';

const LABELS: Record<SettingsTab, string> = {
  general: 'General',
  users: 'Users',
  detachments: 'Detachments',
};

/** Settings on three tabs: the app's state, who may use it, and detachment names to sort. */
export function SettingsPage({
  tab,
  onTabChange,
  faction,
  focus,
  onFactionChange,
}: {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  /** The detachments tab's faction and focus (the address keeps them). */
  faction?: string;
  focus?: 'outside';
  onFactionChange?: (faction: string) => void;
}) {
  const me = useQuery(meQuery);
  return (
    <Stack gap="lg">
      <Title order={1}>Settings</Title>
      <Tabs
        value={tab}
        onChange={(next) => {
          const picked = SETTINGS_TABS.find((t) => t === next);
          if (picked !== undefined) onTabChange(picked);
        }}
        keepMounted={false}
      >
        <Tabs.List>
          {SETTINGS_TABS.map((t) => (
            <Tabs.Tab key={t} value={t}>
              {LABELS[t]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="general" pt="md">
          <Grid gap="lg">
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <Stack gap="lg">
                <BcpStatusCard />
                <FetchQueueCard />
                <AutoFetchCard />
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <Stack gap="lg">
                <BsdataCard />
                <UpdatesSection />
                <RulesCard />
              </Stack>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
        <Tabs.Panel value="users" pt="md">
          {me.data?.authRequired === false ? (
            <Text c="dimmed">Logins are off here, so there are no accounts to manage.</Text>
          ) : (
            <UsersCard />
          )}
        </Tabs.Panel>
        <Tabs.Panel value="detachments" pt="md">
          <DetachmentNamesCard faction={faction} focus={focus} onFactionChange={onFactionChange} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
