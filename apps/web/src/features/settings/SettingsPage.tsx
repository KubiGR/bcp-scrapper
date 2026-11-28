import { Grid, Stack, Tabs, Text, useMatches } from '@mantine/core';
import { PageTitle } from '../../components/Scoreboard';
import { useQuery } from '@tanstack/react-query';
import { meQuery } from '../auth/auth-queries';
import { FetchQueueCard } from '../fetch-queue/FetchQueueCard';
import { UpdatesSection } from '../updates/UpdatesSection';
import { AutoFetchCard } from './AutoFetchCard';
import { BcpStatusCard } from './BcpStatusCard';
import { DetachmentsCard } from './DetachmentsCard';
import { DetachmentNamesCard } from './DetachmentNamesCard';
import { RulesCard } from './RulesCard';
import { SETTINGS_TABS, type DetachmentSection, type SettingsTab } from './settings-search';
import classes from './SettingsPage.module.css';
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
  detachmentSection,
  onDetachmentSectionChange,
  onFactionChange,
}: {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  /** The address keeps the faction and detachment section. */
  faction?: string;
  detachmentSection?: DetachmentSection;
  onDetachmentSectionChange?: (section: DetachmentSection) => void;
  onFactionChange?: (faction: string) => void;
}) {
  const me = useQuery(meQuery);
  // From tablet width up the tabs are a list on the left, like the other pages' sidebars.
  const orientation = useMatches<'horizontal' | 'vertical'>({ base: 'horizontal', sm: 'vertical' });
  return (
    <Stack gap="lg">
      <PageTitle>Settings</PageTitle>
      <Tabs
        value={tab}
        orientation={orientation}
        classNames={{ list: classes.tabs, tab: classes.tab, panel: classes.panel }}
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
        <Tabs.Panel value="general">
          <Grid gap="lg">
            <Grid.Col span={{ base: 12, xl: 6 }}>
              <Stack gap="lg">
                <BcpStatusCard />
                <FetchQueueCard />
                <AutoFetchCard />
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, xl: 6 }}>
              <Stack gap="lg">
                <DetachmentsCard />
                <UpdatesSection />
                <RulesCard />
              </Stack>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
        <Tabs.Panel value="users">
          {me.data?.authRequired === false ? (
            <Text c="dimmed">Logins are off here, so there are no accounts to manage.</Text>
          ) : (
            <UsersCard />
          )}
        </Tabs.Panel>
        <Tabs.Panel value="detachments">
          <DetachmentNamesCard
            faction={faction}
            section={detachmentSection}
            onSectionChange={onDetachmentSectionChange}
            onFactionChange={onFactionChange}
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
