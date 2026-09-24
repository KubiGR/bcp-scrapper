import type { EventDetail } from '@bcp/shared';
import { Button, Group, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDuration } from '../../lib/format';
import { cancelQueued, fetchQueueQuery, retryFailed } from '../fetch-queue/fetch-queue-queries';

/** "3 queued · 3 fetched · 1 failed · about 15 s left", with Cancel and Retry. */
export function EventQueueLine({ event }: { event: EventDetail }) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['event', event.bcpId] }),
      queryClient.invalidateQueries({ queryKey: fetchQueueQuery.queryKey }),
    ]);
  const cancel = useMutation({ mutationFn: () => cancelQueued(event.bcpId), onSuccess: refresh });
  const retry = useMutation({ mutationFn: () => retryFailed(event.bcpId), onSuccess: refresh });
  const { listsQueued, listsFetched, listsFailed } = event.counts;
  if (listsQueued === 0 && listsFailed === 0) return null;

  return (
    <Group gap="sm" wrap="wrap">
      <Text size="sm" c="dimmed" aria-live="polite">
        <span className="numeric">{listsQueued}</span> queued ·{' '}
        <span className="numeric">{listsFetched}</span> fetched ·{' '}
        <span className="numeric">{listsFailed}</span> failed
        {event.queueSeconds !== null && (
          <>
            {' '}
            · about <span className="numeric">{formatDuration(event.queueSeconds)}</span> left
          </>
        )}
      </Text>
      {listsQueued > 0 && (
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          loading={cancel.isPending}
          onClick={() => {
            cancel.mutate();
          }}
        >
          Cancel queued
        </Button>
      )}
      {listsFailed > 0 && (
        <Button
          size="compact-xs"
          variant="subtle"
          loading={retry.isPending}
          onClick={() => {
            retry.mutate();
          }}
        >
          Retry failed
        </Button>
      )}
      {(
        [
          ['cancel', cancel.error],
          ['retry', retry.error],
        ] as const
      ).map(
        ([key, error]) =>
          error && (
            <Text key={key} size="sm" c="red">
              {error.message}
            </Text>
          ),
      )}
    </Group>
  );
}
