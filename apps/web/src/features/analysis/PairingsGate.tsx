import type { EventDetail } from '@bcp/shared';
import { Button, Group, Skeleton, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Panel } from '../../components/Panel';
import { formatDuration } from '../../lib/format';
import { fetchQueueQuery, retryFailed } from '../fetch-queue/fetch-queue-queries';
import { queuePairings } from './analysis-queries';
import { useRefreshWhenPairingsSettle } from './useRefreshWhenPairingsSettle';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Wraps an analysis tab: offers to fetch pairings when there are none, shows progress while the
 * fetch queue works through the rounds, and failures with Retry. Renders the tab once any round
 * is stored.
 */
export function PairingsGate({ event, children }: { event: EventDetail; children: ReactNode }) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['event', event.bcpId] }),
      queryClient.invalidateQueries({ queryKey: fetchQueueQuery.queryKey }),
    ]);
  const queue = useMutation({
    mutationFn: () => queuePairings(event.bcpId),
    onSuccess: refresh,
    onError: (error) => {
      notifications.show({ color: 'red', title: 'Pairings', message: error.message });
    },
  });
  const retry = useMutation({ mutationFn: () => retryFailed(event.bcpId), onSuccess: refresh });
  const { roundsDone, roundCount, queued, failed, gamesAvailable } = event.pairings;
  useRefreshWhenPairingsSettle(event.bcpId, queued);
  const hasData = roundsDone > 0;
  const fetching = queued > 0;

  return (
    <Stack gap="md">
      {fetching && (
        <Text size="sm" c="dimmed" aria-live="polite">
          Pairings · <span className="numeric">{roundsDone}</span>/
          <span className="numeric">{roundCount}</span> rounds
          {event.queueSeconds !== null && (
            <>
              {' '}
              · about <span className="numeric">{formatDuration(event.queueSeconds)}</span>
            </>
          )}
        </Text>
      )}
      {failed > 0 && !fetching && (
        <Group gap="sm">
          <Text size="sm" c="red">
            <span className="numeric">{failed}</span> {plural(failed, 'round', 'rounds')} failed
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            loading={retry.isPending}
            onClick={() => {
              retry.mutate();
            }}
          >
            Retry
          </Button>
          {retry.error && (
            <Text size="sm" c="red">
              {retry.error.message}
            </Text>
          )}
        </Group>
      )}
      {hasData && !gamesAvailable && (
        <Text size="sm" c="yellow">
          Individual games unavailable for this event: BCP only has the team results.
        </Text>
      )}
      {hasData ? (
        <>
          {children}
          {!fetching && (
            <Group>
              <Button
                size="xs"
                variant="subtle"
                loading={queue.isPending}
                onClick={() => {
                  queue.mutate();
                }}
              >
                Refresh pairings
              </Button>
            </Group>
          )}
        </>
      ) : fetching ? (
        <Skeleton height={160} />
      ) : (
        <Panel title="No pairings yet">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">
              Pairings and results are fetched from BCP in the background, one round every few
              seconds.
            </Text>
            <Button
              loading={queue.isPending}
              onClick={() => {
                queue.mutate();
              }}
            >
              Fetch pairings
            </Button>
          </Stack>
        </Panel>
      )}
    </Stack>
  );
}
