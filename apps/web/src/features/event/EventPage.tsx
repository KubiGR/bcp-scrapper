import { Button, Stack, Tabs, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { PairingsGate } from '../analysis/PairingsGate';
import { RoundsPanel } from '../analysis/RoundsPanel';
import { StandingsPanel } from '../analysis/StandingsPanel';
import { MatchupsPanel } from '../matchups/MatchupsPanel';
import { isActiveRun } from '../sync/follow-sync';
import { SyncRunError, useSync } from '../sync/use-sync';
import { EventHeader } from './EventHeader';
import { eventQuery } from './event-queries';
import { EVENT_TABS, type EventTab, type PlayerSearch } from './event-search';
import { PlayersPanel } from './PlayersPanel';
import { usePageTitle } from '../../lib/page-title';
import { PageSkeleton, TilesSkeleton, TitleSkeleton } from '../../components/Skeletons';

/** Standings only make sense for team events. */
export const tabsFor = (event: { isTeamEvent: boolean }) =>
  EVENT_TABS.filter((tab) => tab.value !== 'standings' || event.isTeamEvent);

const isEventTab = (value: string | null): value is EventTab =>
  EVENT_TABS.some((tab) => tab.value === value);

interface EventPageProps {
  eventId: string;
  tab: EventTab;
  onTabChange: (tab: EventTab) => void;
  /** The player whose list is open on the players tab (from the address, so it can be shared). */
  openListId?: string | null;
  onOpenList?: (playerId: string | null) => void;
  playerSearch?: PlayerSearch;
  onPlayerSearchChange?: (changes: PlayerSearch) => void;
}

export function EventPage({
  eventId,
  tab,
  onTabChange,
  openListId,
  onOpenList,
  playerSearch,
  onPlayerSearchChange,
}: EventPageProps) {
  const event = useQuery(eventQuery(eventId));
  usePageTitle(
    event.data?.name ?? 'Event',
    EVENT_TABS.find((option) => option.value === tab)?.label,
  );
  const { start, follow, isSyncing } = useSync({
    label: 'Event sync',
    invalidate: [['event', eventId]],
  });
  const eventRun = event.data?.syncs.event ?? null;
  const activeRun = eventRun && isActiveRun(eventRun) ? eventRun : null;
  const needsLoad = event.data?.stale === true && !activeRun;
  const syncing = isSyncing || activeRun !== null;

  // A never-synced event, or a running one synced 10+ minutes ago, is (re)loaded from BCP on open.
  // The dependencies don't change if that sync fails, so a failure is not retried in a loop.
  useEffect(() => {
    if (needsLoad) start({ kind: 'event', eventId });
  }, [needsLoad, start, eventId]);

  // A sync that is still running (started before a reload, or in another tab) is followed to the end.
  useEffect(() => {
    if (activeRun) follow(activeRun);
  }, [activeRun, follow]);

  if (event.isPending) {
    return (
      <PageSkeleton
        label="Loading the event"
        header={
          <>
            <TitleSkeleton />
            <TilesSkeleton />
          </>
        }
      />
    );
  }

  if (event.error) {
    if (event.error instanceof ApiError && event.error.code === 'NOT_FOUND') {
      return (
        <Panel title="Not in the catalogue">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">
              This event isn't in the local catalogue yet. Fetch it from BCP to see its players and
              lists.
            </Text>
            <Button
              loading={isSyncing}
              onClick={() => {
                start({ kind: 'event', eventId });
              }}
            >
              Fetch from BCP
            </Button>
          </Stack>
        </Panel>
      );
    }
    return <ErrorState error={event.error} onRetry={() => void event.refetch()} />;
  }

  const detail = event.data;
  const activeTab = tabsFor(detail).some((t) => t.value === tab) ? tab : 'players';
  return (
    <Stack gap="lg">
      <EventHeader
        event={detail}
        syncing={syncing}
        onRefresh={() => {
          start({ kind: 'event', eventId });
        }}
      />
      {!syncing &&
        eventRun?.status === 'failed' &&
        detail.removedFromBcpAt === null &&
        detail.blockedAt === null && (
          <Text size="sm" c="red">
            The last event sync failed: <SyncRunError run={eventRun} />
          </Text>
        )}
      <Tabs
        value={activeTab}
        onChange={(value) => {
          if (isEventTab(value)) onTabChange(value);
        }}
        keepMounted={false}
      >
        <Tabs.List>
          {tabsFor(detail).map(({ value, label }) => (
            <Tabs.Tab key={value} value={value}>
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="players" pt="md">
          <PlayersPanel
            event={detail}
            loadingFromBcp={syncing && detail.lastSyncedAt === null}
            openPlayerId={openListId}
            onOpenPlayer={onOpenList}
            playerSearch={playerSearch}
            onPlayerSearchChange={onPlayerSearchChange}
          />
        </Tabs.Panel>
        <Tabs.Panel value="rounds" pt="md">
          <PairingsGate event={detail}>
            <RoundsPanel event={detail} />
          </PairingsGate>
        </Tabs.Panel>
        {detail.isTeamEvent && (
          <Tabs.Panel value="standings" pt="md">
            <PairingsGate event={detail}>
              <StandingsPanel event={detail} />
            </PairingsGate>
          </Tabs.Panel>
        )}
        <Tabs.Panel value="matchups" pt="md">
          <PairingsGate event={detail}>
            <MatchupsPanel event={detail} />
          </PairingsGate>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
