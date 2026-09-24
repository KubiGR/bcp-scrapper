import type { ListQueueState } from '@bcp/shared';
import { Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatDateTime, formatDuration } from '../../lib/format';
import { listQueueQuery, pauseQueue, resumeQueue, retryFailed } from './list-queue-queries';

function PausedNote({ state }: { state: ListQueueState }) {
  switch (state.pausedReason) {
    case 'login-rejected':
      return (
        <Text size="sm" c="red">
          Paused: BCP rejected the login.{' '}
          <Anchor component={Link} to="/settings" inherit>
            Fix it in Settings
          </Anchor>
          , then resume.
        </Text>
      );
    case 'rate-limited':
      return (
        <Text size="sm" c="yellow">
          Paused by a BCP rate limit
          {state.pausedUntil ? ` until ${formatDateTime(state.pausedUntil)}` : ''}; it resumes by
          itself.
        </Text>
      );
    case 'user':
      return (
        <Text size="sm" c="dimmed">
          Paused.
        </Text>
      );
    case null:
      return null;
  }
}

/** Totals plus Pause/Resume and Retry, shared by the header popover and the Settings card. */
export function QueueControls({ state }: { state: ListQueueState }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: listQueueQuery.queryKey });
  const toggle = useMutation({
    mutationFn: () => (state.paused ? resumeQueue() : pauseQueue()),
    onSuccess: refresh,
  });
  const retry = useMutation({
    mutationFn: () => retryFailed(),
    onSuccess: async () => {
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['event'] })]);
    },
  });
  const { queued, fetching, failed } = state.totals;
  const inProgress = queued + fetching;

  return (
    <Stack gap="xs">
      <Text size="sm" aria-live="polite" className="numeric">
        {inProgress} in progress · {failed} failed
        {state.estimatedSeconds !== null && !state.paused && (
          <> · about {formatDuration(state.estimatedSeconds)} left</>
        )}
      </Text>
      <PausedNote state={state} />
      {toggle.error && (
        <Text size="sm" c="red">
          {toggle.error.message}
        </Text>
      )}
      <Group gap="xs">
        <Button
          size="xs"
          variant="outline"
          loading={toggle.isPending}
          onClick={() => {
            toggle.mutate();
          }}
        >
          {state.paused ? 'Resume' : 'Pause'}
        </Button>
        {failed > 0 && (
          <Button
            size="xs"
            variant="subtle"
            loading={retry.isPending}
            onClick={() => {
              retry.mutate();
            }}
          >
            Retry {failed} failed
          </Button>
        )}
      </Group>
    </Stack>
  );
}
