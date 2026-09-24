import { Skeleton, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { fetchQueueQuery } from './fetch-queue-queries';
import { QueueControls } from './QueueControls';

export function FetchQueueCard() {
  const queue = useQuery(fetchQueueQuery);
  return (
    <Panel title="Fetch queue">
      {queue.isPending && <Skeleton height={56} />}
      {queue.error && <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />}
      {queue.data && (
        <>
          <Text size="sm" c="dimmed" mb="xs">
            Army lists and pairings are fetched from BCP in the background, one request every{' '}
            <span className="numeric">{queue.data.intervalMs / 1000}</span> s.
          </Text>
          <QueueControls state={queue.data} />
        </>
      )}
    </Panel>
  );
}
