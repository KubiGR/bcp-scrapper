import type { EventPlayer } from '@bcp/shared';
import { Button, Code, CopyButton, Drawer, Group, Skeleton, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import { playerListQuery } from './event-queries';

interface ListDrawerProps {
  player: EventPlayer | null;
  onClose: () => void;
}

export function ListDrawer({ player, onClose }: ListDrawerProps) {
  return (
    <Drawer
      opened={player !== null}
      onClose={onClose}
      position="right"
      size="lg"
      title={player?.name}
    >
      {player && <ListContent player={player} />}
    </Drawer>
  );
}

function ListContent({ player }: { player: EventPlayer }) {
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
      <Text size="sm" c="dimmed">
        This list hasn't been fetched yet. Use "Fetch all lists" to download it.
      </Text>
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
