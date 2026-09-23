import { Button, Skeleton, Stack, Tabs, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { isActiveRun } from '../sync/follow-sync';
import { useSync } from '../sync/use-sync';
import { EventHeader } from './EventHeader';
import { eventQuery } from './event-queries';
import { PlayersPanel } from './PlayersPanel';

export function EventPage({ eventId }: { eventId: string }) {
  const event = useQuery(eventQuery(eventId));
  const { start, isSyncing } = useSync({ label: 'Event sync', invalidate: [['event', eventId]] });
  const eventRun = event.data?.syncs.event ?? null;
  const needsLoad = event.data?.stale === true && !(eventRun && isActiveRun(eventRun));

  // A never-synced event, or a running one synced 10+ minutes ago, is (re)loaded from BCP on open.
  // The dependencies don't change if that sync fails, so a failure is not retried in a loop.
  useEffect(() => {
    if (needsLoad) start({ kind: 'event', eventId });
  }, [needsLoad, start, eventId]);

  if (event.isPending) return <Skeleton height={160} />;

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
  return (
    <Stack gap="lg">
      <EventHeader
        event={detail}
        syncing={isSyncing}
        onRefresh={() => {
          start({ kind: 'event', eventId });
        }}
      />
      {/* Plan 3 adds the Rounds, Standings and Matchups tabs. */}
      <Tabs defaultValue="players">
        <Tabs.List>
          <Tabs.Tab value="players">Players &amp; lists</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="players" pt="md">
          <PlayersPanel event={detail} loadingFromBcp={isSyncing && detail.lastSyncedAt === null} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
