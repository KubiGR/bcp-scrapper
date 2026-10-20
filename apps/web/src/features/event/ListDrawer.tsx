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
import { useState, type ReactNode } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { formatDuration } from '../../lib/format';
import { queueLists } from '../fetch-queue/fetch-queue-api';
import { fetchQueueQuery } from '../fetch-queue/fetch-queue-queries';
import { eventQuery, playerListQuery } from './event-queries';
import { PlayerGames } from './PlayerGames';
import { RankBadge } from '../rankings/RankBadge';

interface ListDrawerProps {
  eventId: string;
  player: EventPlayer | null;
  onClose: () => void;
  /** Open without sliding in: for a list opened by the page's address. */
  instant?: boolean;
}

/** Where a list can be opened from a shared link: its event's players, with the list open. */
export const listLink = (eventId: string, playerId: string) =>
  `${window.location.origin}/events/${encodeURIComponent(eventId)}?tab=players&list=${encodeURIComponent(playerId)}`;

/**
 * Shares the list's link: the phone's share sheet when there is one, otherwise the clipboard.
 */
function ShareListButton({ eventId, player }: { eventId: string; player: EventPlayer }) {
  const [copied, setCopied] = useState(false);
  const url = listLink(eventId, player.bcpId);
  return (
    <Group gap="xs" wrap="nowrap">
      <Button
        size="xs"
        variant="light"
        onClick={() => {
          // Feature check: browsers without a share sheet leave `share` undefined.
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (navigator.share) {
            // A dismissed share sheet rejects; nothing to do then.
            navigator.share({ title: `${player.name}’s list`, url }).catch(() => undefined);
            return;
          }
          navigator.clipboard.writeText(url).then(
            () => {
              setCopied(true);
            },
            () => undefined,
          );
        }}
      >
        Share list
      </Button>
      {copied && (
        <Text size="xs" c="dimmed" aria-live="polite">
          Link copied
        </Text>
      )}
    </Group>
  );
}

export function ListDrawer({ eventId, player, onClose, instant = false }: ListDrawerProps) {
  return (
    <Drawer
      opened={player !== null}
      onClose={onClose}
      position="right"
      size="lg"
      // Opened as the page loads, the slide-in never finishes (the drawer stays empty): no slide.
      transitionProps={instant ? { duration: 0 } : undefined}
      title={
        player && (
          <>
            {player.name}
            <RankBadge userId={player.bcpUserId} />
          </>
        )
      }
    >
      {player && (
        <Stack gap="md">
          <ShareListButton eventId={eventId} player={player} />
          <PlayerGames eventId={eventId} playerId={player.bcpId} playerName={player.name} />
          <ListContent eventId={eventId} player={player} />
        </Stack>
      )}
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
        // Top lists shows the same players' list states.
        queryClient.invalidateQueries({ queryKey: ['top-lists'] }),
        queryClient.invalidateQueries({ queryKey: fetchQueueQuery.queryKey }),
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

/**
 * Where a queued list stands: being fetched (a fetch under way finishes even once the queue is
 * paused), paused, or about how long this event's queue takes.
 */
function QueuedStatus({ eventId, player }: { eventId: string; player: EventPlayer }) {
  const event = useQuery(eventQuery(eventId));
  const queue = useQuery(fetchQueueQuery);
  const seconds = event.data?.queueSeconds ?? null;
  const fetching = player.listStatus === 'fetching';
  const paused = !fetching && (queue.data?.paused ?? false);

  let status: ReactNode;
  if (fetching) status = 'Fetching this list…';
  else if (paused) status = 'Queued · the fetch queue is paused.';
  else if (seconds !== null) {
    status = (
      <>
        Queued · about <span className="numeric">{formatDuration(seconds)}</span> for this event's
        queue.
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

/**
 * The desktop version: the site sends touch and narrow screens (and anyone it once did) to a
 * mobile version that currently leads to a missing page.
 */
const COMPACTOR_URL = 'https://desjani.github.io/40kCompactor/?ui=desktop';

/**
 * 40kCompactor shortens a list, but takes no input in its URL: copy the list, open the site in a
 * new tab (a real link, so no popup blocker), and say what to do there.
 */
function CompactButton({ text }: { text: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <Stack gap={4} align="flex-end">
      <Button
        component="a"
        href={COMPACTOR_URL}
        target="_blank"
        rel="noopener noreferrer"
        size="xs"
        variant="subtle"
        onClick={() => {
          navigator.clipboard.writeText(text).then(
            () => {
              setCopied(true);
            },
            () => {
              setCopied(false);
            },
          );
        }}
      >
        Compact on 40kCompactor ↗
      </Button>
      {copied === true && (
        <Text size="xs" c="dimmed" aria-live="polite">
          List copied: paste it into 40kCompactor, then press Compact.
        </Text>
      )}
      {copied === false && (
        <Text size="xs" c="red" aria-live="polite">
          Couldn't copy the list: use Copy list, then paste it there.
        </Text>
      )}
    </Stack>
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
        <Group gap="xs">
          <CopyButton value={text}>
            {({ copied, copy }) => (
              <Button size="xs" variant="outline" onClick={copy}>
                {copied ? 'Copied' : 'Copy list'}
              </Button>
            )}
          </CopyButton>
          <CompactButton text={text} />
        </Group>
      </Group>
      <Code block>{text === '' ? 'The list is empty.' : text}</Code>
    </Stack>
  );
}
