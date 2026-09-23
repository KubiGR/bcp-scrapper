import type { EventCounts, EventDetail } from '@bcp/shared';
import { Button, Progress, Stack, Text } from '@mantine/core';
import { useSync } from '../sync/use-sync';

function buttonLabel(counts: EventCounts): string {
  if (counts.listsAvailable === 0) return 'No lists on BCP';
  const missing = counts.listsAvailable - counts.listsFetched;
  return missing > 0 ? `Fetch all lists (${missing} missing)` : 'All lists fetched';
}

const listsWere = (count: number) => (count === 1 ? '1 list was' : `${count} lists were`);

export function FetchListsButton({ event }: { event: EventDetail }) {
  const sync = useSync({ label: 'Army lists', invalidate: [['event', event.bcpId]] });
  const missing = event.counts.listsAvailable - event.counts.listsFetched;
  const lastRun = event.syncs.lists;

  if (sync.isSyncing) {
    const total = sync.run?.total ?? 0;
    const processed = (sync.run?.done ?? 0) + (sync.run?.failed ?? 0);
    return (
      <Stack gap={4} w={220}>
        <Text size="xs" c="dimmed" className="numeric">
          Fetching lists {processed}/{total}
        </Text>
        <Progress
          value={total > 0 ? (processed / total) * 100 : 0}
          aria-label="List fetch progress"
        />
      </Stack>
    );
  }

  return (
    <Stack gap={4} align="flex-end" maw={300}>
      <Button
        size="sm"
        disabled={missing <= 0}
        onClick={() => {
          sync.start({ kind: 'lists', eventId: event.bcpId });
        }}
      >
        {buttonLabel(event.counts)}
      </Button>
      {event.hideLists && (
        <Text size="xs" c="yellow" ta="right">
          BCP marks this event's lists as hidden, so some may be unavailable.
        </Text>
      )}
      {lastRun?.status === 'succeeded' && lastRun.failed > 0 && (
        <Text size="xs" c="dimmed" ta="right">
          {listsWere(lastRun.failed)} unavailable on the last fetch.
        </Text>
      )}
    </Stack>
  );
}
