import type { EventDetail, QueueListsRequest } from '@bcp/shared';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { describeQueueResult, queueLists } from '../fetch-queue/fetch-queue-api';
import { fetchQueueQuery } from '../fetch-queue/fetch-queue-queries';

/** Queues an event's lists and reports the result; shared by the Fetch lists menu and team headers. */
export function useQueueLists(event: EventDetail) {
  const queryClient = useQueryClient();
  return useMutation({
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
}
