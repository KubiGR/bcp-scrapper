import type { EventDetail, StandingCell } from '@bcp/shared';
import { Skeleton, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { standingsQuery } from './analysis-queries';
import { formatPoints, formatTotals, outcomeLabel } from './format';

function Cell({ cell }: { cell: StandingCell | null }) {
  if (!cell) return <Text c="dimmed">—</Text>;
  return (
    <Text size="sm" className="numeric" title={cell.opponent ? `vs ${cell.opponent.name}` : 'Bye'}>
      {outcomeLabel(cell.outcome)} {formatPoints(cell.points)}
    </Text>
  );
}

export function StandingsPanel({ event }: { event: EventDetail }) {
  const standings = useQuery(standingsQuery(event.bcpId, event.pairings.queued > 0));
  if (standings.isPending) return <Skeleton height={200} />;
  if (standings.error) {
    return <ErrorState error={standings.error} onRetry={() => void standings.refetch()} />;
  }
  const { rounds, teams } = standings.data;
  if (teams.length === 0) return <Text c="dimmed">No teams stored yet.</Text>;

  return (
    <Panel p={0}>
      <Table.ScrollContainer minWidth={360 + rounds.length * 80}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th ta="right">#</Table.Th>
              <Table.Th>Team</Table.Th>
              {rounds.map((round) => (
                <Table.Th key={round.round}>
                  {round.bracket ? `R${round.round} · Bracket` : `R${round.round}`}
                </Table.Th>
              ))}
              <Table.Th ta="right">W-L-D</Table.Th>
              <Table.Th ta="right">Points</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {teams.map((row) => (
              <Table.Tr key={row.team.id}>
                <Table.Td ta="right" className="numeric">
                  {row.placing ?? '—'}
                </Table.Td>
                <Table.Td>
                  <AnchorLink
                    to="/events/$eventId/teams/$teamId"
                    params={{ eventId: event.bcpId, teamId: row.team.id }}
                  >
                    {row.team.name}
                  </AnchorLink>
                </Table.Td>
                {row.perRound.map((cell, index) => (
                  <Table.Td key={rounds[index]?.round ?? index}>
                    <Cell cell={cell} />
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
  );
}
