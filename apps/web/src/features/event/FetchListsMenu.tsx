import type { EventDetail, EventPlayer, QueueListsRequest } from '@bcp/shared';
import { Button, Menu, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { describeQueueResult, queueLists } from '../fetch-queue/fetch-queue-api';
import { fetchQueueQuery } from '../fetch-queue/fetch-queue-queries';
import { lossLabel, lossOptions, missingListCount } from './players-filter';

interface FetchListsMenuProps {
  event: EventDetail;
  players: EventPlayer[];
}

export function FetchListsMenu({ event, players }: FetchListsMenuProps) {
  const queryClient = useQueryClient();
  const queue = useMutation({
    mutationFn: (request: QueueListsRequest) => queueLists(event.bcpId, request),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event', event.bcpId] }),
        queryClient.invalidateQueries({ queryKey: fetchQueueQuery.queryKey }),
      ]);
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
  const allMissing = missingListCount(players, null);

  return (
    <Stack gap={4} align="flex-end" maw={360}>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button size="sm" loading={queue.isPending} disabled={event.counts.listsAvailable === 0}>
            Fetch lists
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            disabled={allMissing === 0}
            onClick={() => {
              queue.mutate({});
            }}
          >
            All missing lists ({allMissing})
          </Menu.Item>
          <Menu.Divider />
          {lossOptions(event.roundCount).map((losses) => {
            const count = missingListCount(players, losses);
            return (
              <Menu.Item
                key={losses}
                disabled={count === 0}
                onClick={() => {
                  queue.mutate({ maxLosses: losses });
                }}
              >
                {lossLabel(losses)} ({count})
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
      {event.hideLists && (
        <Text size="xs" c="yellow" ta="right">
          BCP marks this event's lists as hidden, so some may be unavailable.
        </Text>
      )}
    </Stack>
  );
}
