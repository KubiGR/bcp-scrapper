import type { EventDetail } from '@bcp/shared';
import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAdminView, meQuery } from '../auth/auth-queries';
import { fetchQueueQuery } from '../fetch-queue/fetch-queue-queries';
import { blockEvent, unblockEvent } from './event-queries';

/**
 * Admins only: Block stops Logis asking BCP for an event that fails on every fetch (its queued
 * work is dropped and its failures stop counting); Unblock makes it fetchable again.
 */
export function BlockEventButton({ event }: { event: Pick<EventDetail, 'bcpId' | 'blockedAt'> }) {
  const me = useQuery(meQuery);
  const queryClient = useQueryClient();
  const blocked = event.blockedAt !== null;
  const toggle = useMutation({
    mutationFn: () => (blocked ? unblockEvent(event.bcpId) : blockEvent(event.bcpId)),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event', event.bcpId] }),
        queryClient.invalidateQueries({ queryKey: fetchQueueQuery.queryKey }),
      ]),
    onError: (error) => {
      notifications.show({ color: 'red', title: 'Event', message: error.message });
    },
  });
  if (!isAdminView(me.data)) return null;
  return (
    <Button
      variant="subtle"
      color={blocked ? 'gray' : 'red'}
      size="sm"
      loading={toggle.isPending}
      title={
        blocked
          ? 'Let Logis fetch this event from BCP again'
          : 'Stop Logis asking BCP for this event (for events that fail every time)'
      }
      onClick={() => {
        toggle.mutate();
      }}
    >
      {blocked ? 'Unblock' : 'Block'}
    </Button>
  );
}
