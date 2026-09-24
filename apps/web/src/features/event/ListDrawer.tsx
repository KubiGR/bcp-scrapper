import type { EventPlayer } from '@bcp/shared';
import {
  Button,
  Code,
  CopyButton,
  Drawer,
  Group,
  Loader,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { formatDuration } from '../../lib/format';
import { queueLists } from '../list-queue/list-queue-api';
import { listQueueQuery } from '../list-queue/list-queue-queries';
import { eventQuery, playerListQuery } from './event-queries';

interface ListDrawerProps {
  eventId: string;
  player: EventPlayer | null;
  onClose: () => void;
}

export function ListDrawer({ eventId, player, onClose }: ListDrawerProps) {
  return (
    <Drawer
      opened={player !== null}
      onClose={onClose}
      position="right"
      size="lg"
      title={player?.name}
    >
      {player && <ListContent eventId={eventId} player={player} />}
    </Drawer>
  );
}

function FetchThisList({
  eventId,
  player,
  label,
}: {
  eventId: string;
  player: EventPlayer;
  label: string;
}) {
  const queryClient = useQueryClient();
  const queue = useMutation({
    mutationFn: () => queueLists(eventId, { playerIds: [player.bcpId] }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event', eventId] }),
        queryClient.invalidateQueries({ queryKey: listQueueQuery.queryKey }),
      ]),
  });
  return (
    <Stack gap="xs" align="flex-start">
      <Button
        size="xs"
        loading={queue.isPending}
        onClick={() => {
          queue.mutate();
        }}
      >
        {label}
      </Button>
      {queue.error && (
        <Text size="sm" c="red">
          {queue.error.message}
        </Text>
      )}
    </Stack>
  );
}

/** Where a queued list stands: paused, being fetched, or about how long this event's lists take. */
function QueuedStatus({ eventId, player }: { eventId: string; player: EventPlayer }) {
  const event = useQuery(eventQuery(eventId));
  const queue = useQuery(listQueueQuery);
  const seconds = event.data?.listQueueSeconds ?? null;
  const paused = queue.data?.paused ?? false;

  let status: ReactNode;
  if (paused) status = 'Queued · the list queue is paused.';
  else if (player.listStatus === 'fetching') status = 'Fetching this list…';
  else if (seconds !== null) {
    status = (
      <>
        Queued · about <span className="numeric">{formatDuration(seconds)}</span> for this event's
        lists.
      </>
    );
  } else status = 'Queued.';

  return (
    <Group gap="xs">
      {!paused && <Loader size="xs" />}
      <Text size="sm" aria-live="polite">
        {status}
      </Text>
    </Group>
  );
}

function ListContent({ eventId, player }: { eventId: string; player: EventPlayer }) {
  const list = useQuery({
    ...playerListQuery(player.bcpId),
    enabled: player.listStatus === 'fetched',
  });

  if (player.listStatus === 'none') {
    return (
      <Text size="sm" c="dimmed">
        This player didn't submit a list on BCP.
      </Text>
    );
  }
  if (player.listStatus === 'available') {
    return (
      <Stack gap="xs" align="flex-start">
        <Text size="sm" c="dimmed">
          This list hasn't been fetched yet.
        </Text>
        <FetchThisList eventId={eventId} player={player} label="Fetch this list" />
      </Stack>
    );
  }
  if (player.listStatus === 'queued' || player.listStatus === 'fetching') {
    return <QueuedStatus eventId={eventId} player={player} />;
  }
  if (player.listStatus === 'failed') {
    return (
      <Stack gap="xs" align="flex-start">
        <Text size="sm" c="red">
          {player.listError}
        </Text>
        <FetchThisList eventId={eventId} player={player} label="Retry" />
      </Stack>
    );
  }

  if (list.isPending) return <Skeleton height={240} />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;

  const text = list.data.text ?? '';
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {[list.data.faction, list.data.teamName].filter(Boolean).join(' · ')}
        </Text>
        <CopyButton value={text}>
          {({ copied, copy }) => (
            <Button size="xs" variant="outline" onClick={copy}>
              {copied ? 'Copied' : 'Copy list'}
            </Button>
          )}
        </CopyButton>
      </Group>
      <Code block>{text === '' ? 'The list is empty.' : text}</Code>
    </Stack>
  );
}
