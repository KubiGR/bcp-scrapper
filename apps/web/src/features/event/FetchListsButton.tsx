import type { EventCounts, EventDetail } from '@bcp/shared';
import { Button, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { describeQueueResult, queueLists } from '../list-queue/list-queue-api';

function buttonLabel(counts: EventCounts): string {
  if (counts.listsAvailable === 0) return 'No lists on BCP';
  if (counts.listsMissing === 0) return 'All lists fetched';
  const waiting = counts.listsMissing - counts.listsQueued;
  return waiting > 0 ? `Fetch all lists (${waiting} missing)` : 'All lists queued';
}

export function FetchListsButton({ event }: { event: EventDetail }) {
  const queryClient = useQueryClient();
  const queue = useMutation({
    mutationFn: () => queueLists(event.bcpId, {}),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['event', event.bcpId] });
      notifications.show({
        color: 'neon',
        title: 'Army lists',
        message: describeQueueResult(result),
      });
    },
    onError: (error) => {
      notifications.show({ color: 'red', title: 'Army lists', message: error.message });
    },
  });
  const waiting = event.counts.listsMissing - event.counts.listsQueued;
  return (
    <Stack gap={4} align="flex-end" maw={360}>
      <Button
        size="sm"
        loading={queue.isPending}
        disabled={waiting <= 0}
        onClick={() => {
          queue.mutate();
        }}
      >
        {buttonLabel(event.counts)}
      </Button>
      {event.hideLists && (
        <Text size="xs" c="yellow" ta="right">
          BCP marks this event's lists as hidden, so some may be unavailable.
        </Text>
      )}
    </Stack>
  );
}
