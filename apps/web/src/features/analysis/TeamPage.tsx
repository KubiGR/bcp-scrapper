import type { PlayerRound, RoundView } from '@bcp/shared';
import { Accordion, Group, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AnchorLink } from '../../components/AnchorLink';
import { PlayerLine } from '../../components/PlayerLine';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { eventQuery, playersQuery } from '../event/event-queries';
import { ListDrawer } from '../event/ListDrawer';
import { roundsQuery, teamQuery } from './analysis-queries';
import { GamesTable } from './GamesTable';
import { formatPoints, formatTotals, outcomeLabel } from './format';
import { matchupFor, type TeamMatchup } from './team-matches';
import { useRefreshWhenPairingsSettle } from './useRefreshWhenPairingsSettle';

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
      {(cell.vp !== null || cell.opponentVp !== null) && (
        <Text size="sm">
          VP{' '}
          <span className="numeric">
            {formatPoints(cell.vp)}–{formatPoints(cell.opponentVp)}
          </span>
        </Text>
      )}
      {cell.opponent ? (
        <Text size="xs" c="dimmed">
          {cell.opponent.name} (<PlayerLine {...cell.opponent} />)
        </Text>
      ) : (
        <Text size="xs" c="dimmed">
          Bye
        </Text>
      )}
    </Stack>
  );
}

interface TeamRoundMatch {
  round: RoundView;
  view: TeamMatchup;
}

function TeamMatchRow({ round, view }: { round: RoundView; view: TeamMatchup }) {
  const prefix = round.bracket ? `R${round.round} · Bracket` : `R${round.round}`;
  return (
    <Text size="sm">
      {prefix} ·{' '}
      {view.opponent ? (
        <>
          vs {view.opponent.name} · {outcomeLabel(view.outcome)}{' '}
          <span className="numeric">
            {formatPoints(view.points)}–{formatPoints(view.opponentPoints)}
          </span>
        </>
      ) : (
        <>
          Bye · <span className="numeric">{formatPoints(view.points)}</span>
        </>
      )}
    </Text>
  );
}

function TeamMatches({
  eventId,
  teamId,
  live,
}: {
  eventId: string;
  teamId: string;
  live: boolean;
}) {
  const rounds = useQuery(roundsQuery(eventId, live));
  const players = useQuery(playersQuery(eventId));
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);

  if (rounds.isPending) return <Skeleton height={120} />;
  if (rounds.error)
    return <ErrorState error={rounds.error} onRetry={() => void rounds.refetch()} />;

  const teamRounds: TeamRoundMatch[] = rounds.data.rounds.flatMap((round) => {
    for (const matchup of round.matchups) {
      const view = matchupFor(matchup, teamId);
      if (view) return [{ round, view }];
    }
    return [];
  });

  const knownPlayerIds = new Set((players.data?.items ?? []).map((p) => p.bcpId));
  const openPlayer = players.data?.items.find((p) => p.bcpId === openPlayerId) ?? null;

  return (
    <Stack gap="sm">
      <Title order={3}>Matches</Title>
      {teamRounds.length === 0 ? (
        <Text c="dimmed">No matches stored yet.</Text>
      ) : (
        <Panel p={0}>
          <Accordion multiple chevronPosition="left">
            {teamRounds.map(({ round, view }) => (
              <Accordion.Item key={view.matchupId} value={view.matchupId}>
                <Accordion.Control>
                  <TeamMatchRow round={round} view={view} />
                </Accordion.Control>
                <Accordion.Panel>
                  <GamesTable
                    games={view.games}
                    onShowList={setOpenPlayerId}
                    knownPlayerIds={knownPlayerIds}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Panel>
      )}
      <ListDrawer
        eventId={eventId}
        player={openPlayer}
        onClose={() => {
          setOpenPlayerId(null);
        }}
      />
    </Stack>
  );
}

export function TeamPage({ eventId, teamId }: { eventId: string; teamId: string }) {
  const event = useQuery(eventQuery(eventId));
  const queued = event.data?.pairings.queued ?? 0;
  useRefreshWhenPairingsSettle(eventId, queued);
  const live = queued > 0;
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
          <AnchorLink to="/pairings" search={{ event: eventId, team: teamId }}>
            <Text size="sm">Pairings</Text>
          </AnchorLink>
          <Text size="sm" c="dimmed">
            <span className="numeric">{formatTotals(totals)}</span> ·{' '}
            <span className="numeric">{totals.points}</span> game points
          </Text>
        </Group>
      </Stack>
      <TeamMatches eventId={eventId} teamId={teamId} live={live} />
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
                      <PlayerLine {...row.player} />
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
