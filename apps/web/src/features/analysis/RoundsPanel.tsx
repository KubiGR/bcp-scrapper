import type { EventDetail, GameView, MatchupView } from '@bcp/shared';
import { Accordion, Group, SegmentedControl, Skeleton, Stack, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { roundsQuery } from './analysis-queries';
import { formatPoints, outcomeLabel } from './format';

function GamesTable({ games }: { games: GameView[] }) {
  if (games.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No individual games for this matchup.
      </Text>
    );
  }
  return (
    <Table.ScrollContainer minWidth={560}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Table</Table.Th>
            <Table.Th>Player</Table.Th>
            <Table.Th ta="right">GP</Table.Th>
            <Table.Th ta="right">VP</Table.Th>
            <Table.Th ta="right">VP</Table.Th>
            <Table.Th ta="right">GP</Table.Th>
            <Table.Th>Opponent</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {games.map((game) => (
            <Table.Tr key={game.id}>
              <Table.Td className="numeric">{game.tableNo ?? '–'}</Table.Td>
              <Table.Td>
                <Text size="sm">{game.playerA.name}</Text>
                <Text size="xs" c="dimmed">
                  {game.playerA.faction ?? 'Unknown faction'}
                  {game.firstTurn === 'a' && ' · went first'}
                </Text>
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {formatPoints(game.gamePointsA)}
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {formatPoints(game.vpA)}
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {formatPoints(game.vpB)}
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {formatPoints(game.gamePointsB)}
              </Table.Td>
              <Table.Td>
                {game.playerB ? (
                  <>
                    <Text size="sm">{game.playerB.name}</Text>
                    <Text size="xs" c="dimmed">
                      {game.playerB.faction ?? 'Unknown faction'}
                      {game.firstTurn === 'b' && ' · went first'}
                    </Text>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
                    Bye
                  </Text>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function MatchupControl({ matchup }: { matchup: MatchupView }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Text size="xs" c="dimmed" className="numeric" w={32}>
        T{matchup.tableNo ?? '–'}
      </Text>
      <Text size="sm">{matchup.teamA.name}</Text>
      {matchup.teamB ? (
        <>
          <Text size="sm" className="numeric">
            {formatPoints(matchup.pointsA)} – {formatPoints(matchup.pointsB)}
          </Text>
          <Text size="sm">{matchup.teamB.name}</Text>
        </>
      ) : (
        <Text size="sm" c="dimmed">
          {outcomeLabel('bye')} <span className="numeric">{formatPoints(matchup.pointsA)}</span>
        </Text>
      )}
    </Group>
  );
}

export function RoundsPanel({ event }: { event: EventDetail }) {
  const rounds = useQuery(roundsQuery(event.bcpId, event.pairings.queued > 0));
  const [selected, setSelected] = useState<string | null>(null);

  if (rounds.isPending) return <Skeleton height={200} />;
  if (rounds.error)
    return <ErrorState error={rounds.error} onRetry={() => void rounds.refetch()} />;
  const all = rounds.data.rounds;
  if (all.length === 0) return <Text c="dimmed">No rounds stored yet.</Text>;
  const current = all.find((round) => String(round.round) === selected) ?? all[0];
  if (!current) return null;

  return (
    <Stack gap="md">
      <SegmentedControl
        aria-label="Round"
        value={String(current.round)}
        onChange={setSelected}
        data={all.map((round) => ({
          value: String(round.round),
          label: round.bracket ? `Round ${round.round} · Bracket` : `Round ${round.round}`,
        }))}
      />
      {current.matchups.length > 0 && (
        <Panel p={0}>
          <Accordion multiple chevronPosition="left">
            {current.matchups.map((matchup) => (
              <Accordion.Item key={matchup.id} value={matchup.id}>
                <Accordion.Control>
                  <MatchupControl matchup={matchup} />
                </Accordion.Control>
                <Accordion.Panel>
                  <GamesTable games={matchup.games} />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Panel>
      )}
      {current.games.length > 0 && (
        <Panel>
          <GamesTable games={current.games} />
        </Panel>
      )}
    </Stack>
  );
}
