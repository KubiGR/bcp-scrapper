import type { EventCounts, EventDetail, SyncRun } from '@bcp/shared';
import { Button, Group, Progress, Stack, Text } from '@mantine/core';
import { useEffect } from 'react';
import { isActiveRun } from '../sync/follow-sync';
import { SyncRunError, useSync } from '../sync/use-sync';

function buttonLabel(counts: EventCounts): string {
  if (counts.listsAvailable === 0) return 'No lists on BCP';
  return counts.listsMissing > 0
    ? `Fetch all lists (${counts.listsMissing} missing)`
    : 'All lists fetched';
}

const listsWere = (count: number) => (count === 1 ? '1 list was' : `${count} lists were`);

function FetchProgress({ run }: { run: SyncRun | null }) {
  const total = run?.total ?? 0;
  const processed = (run?.done ?? 0) + (run?.failed ?? 0);
  return (
    <Stack gap={4} w={160}>
      <Text size="xs" c="dimmed" className="numeric" aria-live="polite">
        Fetching lists {processed}/{total}
      </Text>
      <Progress
        value={total > 0 ? (processed / total) * 100 : 0}
        aria-label="List fetch progress"
      />
    </Stack>
  );
}

export function FetchListsButton({ event }: { event: EventDetail }) {
  const sync = useSync({ label: 'Army lists', invalidate: [['event', event.bcpId]] });
  const { follow } = sync;
  const lastRun = event.syncs.lists;
  const activeRun = lastRun && isActiveRun(lastRun) ? lastRun : null;
  const syncing = sync.isSyncing || activeRun !== null;

  // A fetch that is still running (started before a reload, or in another tab) is followed to the end.
  useEffect(() => {
    if (activeRun) follow(activeRun);
  }, [activeRun, follow]);

  return (
    <Stack gap={4} align="flex-end" maw={360}>
      <Group gap="sm" wrap="nowrap" align="center">
        {syncing && <FetchProgress run={sync.run ?? activeRun} />}
        <Button
          size="sm"
          loading={syncing}
          disabled={event.counts.listsMissing <= 0}
          onClick={() => {
            sync.start({ kind: 'lists', eventId: event.bcpId });
          }}
        >
          {buttonLabel(event.counts)}
        </Button>
      </Group>
      {event.hideLists && (
        <Text size="xs" c="yellow" ta="right">
          BCP marks this event's lists as hidden, so some may be unavailable.
        </Text>
      )}
      {!syncing && lastRun?.status === 'succeeded' && lastRun.failed > 0 && (
        <Text size="xs" c="dimmed" ta="right">
          {listsWere(lastRun.failed)} unavailable on the last fetch.
        </Text>
      )}
      {!syncing && lastRun?.status === 'failed' && (
        <Text size="xs" c="red" ta="right">
          The last list fetch failed: <SyncRunError run={lastRun} />
        </Text>
      )}
    </Stack>
  );
}
