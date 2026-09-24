import type { FetchQueueState } from '@bcp/shared';
import { Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatDateTime, formatDuration } from '../../lib/format';
import { fetchQueueQuery, pauseQueue, resumeQueue, retryFailed } from './fetch-queue-queries';

function PausedNote({ state }: { state: FetchQueueState }) {
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
export function QueueControls({ state }: { state: FetchQueueState }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: fetchQueueQuery.queryKey });
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
  const byKindLine = (
    [
      ['list', 'Lists'],
      ['pairings-round', 'Pairing rounds'],
      ['event', 'Events'],
    ] as const
  )
    .map(([kind, label]) => {
      const open = state.totals.byKind[kind].queued + state.totals.byKind[kind].fetching;
      return open > 0 ? { label, open } : null;
    })
    .filter((entry) => entry !== null);

  return (
    <Stack gap="xs">
      <Text size="sm" aria-live="polite">
        <span className="numeric">{inProgress}</span> in progress ·{' '}
        <span className="numeric">{failed}</span> failed
        {state.estimatedSeconds !== null && !state.paused && (
          <>
            {' '}
            · about <span className="numeric">{formatDuration(state.estimatedSeconds)}</span> left
          </>
        )}
      </Text>
      {byKindLine.length > 0 && (
        <Text size="sm" c="dimmed">
          {byKindLine.map(({ label, open }, i) => (
            <span key={label}>
              {i > 0 && ' · '}
              {label} <span className="numeric">{open}</span>
            </span>
          ))}
        </Text>
      )}
      <PausedNote state={state} />
      {(
        [
          ['toggle', toggle.error],
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
