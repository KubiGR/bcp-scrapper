import { Skeleton, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { fetchQueueQuery } from './fetch-queue-queries';
import { QueueControls } from './QueueControls';

export function FetchQueueCard() {
  const queue = useQuery(fetchQueueQuery);
  return (
    <Panel title="List queue">
      {queue.isPending && <Skeleton height={56} />}
      {queue.error && <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />}
      {queue.data && (
        <>
          <Text size="sm" c="dimmed" mb="xs">
            Army lists are fetched in the background, one every{' '}
            <span className="numeric">{queue.data.intervalMs / 1000}</span> s.
          </Text>
          <QueueControls state={queue.data} />
        </>
      )}
    </Panel>
  );
}
