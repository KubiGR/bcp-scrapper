import type { PlayerRound } from '@bcp/shared';
import { Group, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { eventQuery } from '../event/event-queries';
import { teamQuery } from './analysis-queries';
import { formatPoints, formatTotals, outcomeLabel } from './format';

function RoundCell({ cell }: { cell: PlayerRound | null }) {
  if (!cell) return <Text c="dimmed">—</Text>;
  return (
    <Stack gap={0}>
      <Text size="sm">
        {outcomeLabel(cell.outcome)}{' '}
        <span className="numeric">
          {formatPoints(cell.gamePoints)}–{formatPoints(cell.opponentGamePoints)}
        </span>
      </Text>
      <Text size="xs" c="dimmed">
        {cell.opponent
          ? `${cell.opponent.name} (${cell.opponent.faction ?? 'unknown faction'})`
          : 'Bye'}
      </Text>
    </Stack>
  );
}

export function TeamPage({ eventId, teamId }: { eventId: string; teamId: string }) {
  const event = useQuery(eventQuery(eventId));
  const live = (event.data?.pairings.queued ?? 0) > 0;
  const team = useQuery(teamQuery(eventId, teamId, live));

  if (team.isPending) return <Skeleton height={240} />;
  if (team.error) return <ErrorState error={team.error} onRetry={() => void team.refetch()} />;
  const { rounds, players, totals } = team.data;

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <AnchorLink to="/events/$eventId" params={{ eventId }} search={{ tab: 'standings' }}>
          <Text size="sm">← {event.data?.name ?? 'Event'}</Text>
        </AnchorLink>
        <Title order={2}>{team.data.team.name}</Title>
        <Group gap="md">
          <Text size="sm" c="dimmed">
            Placing <span className="numeric">{team.data.team.placing ?? '—'}</span>
          </Text>
          <Text size="sm" c="dimmed">
            <span className="numeric">{formatTotals(totals)}</span> ·{' '}
            <span className="numeric">{totals.points}</span> game points
          </Text>
        </Group>
      </Stack>
      <Panel p={0}>
        <Table.ScrollContainer minWidth={320 + rounds.length * 150}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Player</Table.Th>
                {rounds.map((round) => (
                  <Table.Th key={round.round}>
                    {round.bracket ? `R${round.round} · Bracket` : `R${round.round}`}
                  </Table.Th>
                ))}
                <Table.Th ta="right">W-L-D</Table.Th>
                <Table.Th ta="right">GP</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {players.map((row) => (
                <Table.Tr key={row.player.id}>
                  <Table.Td>
                    <Text size="sm">{row.player.name}</Text>
                    <Text size="xs" c="dimmed">
                      {row.player.faction ?? 'Unknown faction'}
                    </Text>
                  </Table.Td>
                  {row.perRound.map((cell, index) => (
                    <Table.Td key={rounds[index]?.round ?? index}>
                      <RoundCell cell={cell} />
                    </Table.Td>
                  ))}
                  <Table.Td ta="right" className="numeric">
                    {formatTotals(row.totals)}
                  </Table.Td>
                  <Table.Td ta="right" className="numeric">
                    {row.totals.points}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Panel>
    </Stack>
  );
}
