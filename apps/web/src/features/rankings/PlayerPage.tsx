import type { EloFigure, PlayerHistoryEntry } from '@bcp/shared';
import { Anchor, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { NewLeaf, playedLately } from '../../components/EventSymbols';
import { Panel } from '../../components/Panel';
import { formatIsoDay, ordinal } from '../../lib/format';
import { playerRankingQuery } from './rankings-queries';
import { FactionIcon } from '../../components/FactionIcon';

/** wh40k-elo's site (it has no page per player). */
const WH40K_ELO_SITE = 'https://wh40k-elo.duckdns.org/';

/** "1612 (23 games)", or "–" when unrated. */
const eloText = (figure: EloFigure | null) =>
  figure === null
    ? '–'
    : `${String(figure.elo)} (${String(figure.games)} ${figure.games === 1 ? 'game' : 'games'})`;

/** "3rd of 64"; team events "2nd of 20 teams"; "–" without a placing. */
const placingText = (entry: PlayerHistoryEntry) =>
  entry.placing === null || entry.field === null
    ? '–'
    : `${ordinal(entry.placing)} of ${String(entry.field)}${entry.isTeamEvent ? ' teams' : ''}`;

function HistoryRow({ entry }: { entry: PlayerHistoryEntry }) {
  const dim = entry.score === null ? 'dimmed' : undefined;
  const army = [entry.faction, entry.detachments.join(' + ')].filter(Boolean).join(' · ');
  return (
    <Table.Tr data-counted={entry.score !== null}>
      <Table.Td>
        <Text size="sm" c={dim} className="numeric">
          {formatIsoDay(entry.eventStart)}
        </Text>
      </Table.Td>
      <Table.Td>
        <AnchorLink
          to="/events/$eventId"
          params={{ eventId: entry.eventId }}
          search={{ tab: 'players' }}
        >
          {entry.eventName}
        </AnchorLink>
        {playedLately(entry.eventStart) && <NewLeaf />}
        {entry.teamName !== null && (
          <Text size="xs" c="dimmed">
            {entry.teamName}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Text size="sm" c={dim}>
          <FactionIcon faction={entry.faction} size={20} />
          {army || '–'}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c={dim} className="numeric">
          {placingText(entry)}
        </Text>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" c={dim} className="numeric">
          {entry.score === null ? '–' : entry.score.toFixed(1)}
        </Text>
      </Table.Td>
      <Table.Td ta="center">
        {entry.counts && (
          <Text span c="neon.4" aria-label="Counts" title="One of the 5 best: counts">
            ✓
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        {entry.hasList && (
          <AnchorLink
            to="/events/$eventId"
            params={{ eventId: entry.eventId }}
            search={{ tab: 'players', list: entry.playerId }}
          >
            List
          </AnchorLink>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

/** One player's ranking and every event they played, the counted results marked. */
export function PlayerPage({ userId }: { userId: string }) {
  const player = useQuery(playerRankingQuery(userId));
  if (player.isPending) return <Skeleton height={240} />;
  if (player.error) {
    return player.error instanceof ApiError && player.error.status === 404 ? (
      <Text c="dimmed">No player with that account.</Text>
    ) : (
      <ErrorState error={player.error} onRetry={() => void player.refetch()} />
    );
  }
  const { data } = player;
  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={1}>{data.name}</Title>
        <Text className="numeric">
          {data.rank === null
            ? 'Not ranked: no counted results in the last 12 months.'
            : `#${String(data.rank)} of ${data.ranked.toLocaleString('en-GB')} · ${data.points.toFixed(1)} points`}
        </Text>
        <Text size="sm" className="numeric">
          <Anchor href={WH40K_ELO_SITE} target="_blank" rel="noreferrer" inherit>
            wh40k-elo
          </Anchor>{' '}
          {eloText(data.wh40kElo)}
        </Text>
        {data.dropsOn !== null && (
          <Text size="sm" c="dimmed">
            Oldest counted result drops out on {formatIsoDay(data.dropsOn)}
          </Text>
        )}
      </Stack>
      <Panel title="History">
        <Table.ScrollContainer minWidth={720}>
          <Table aria-label="History" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Event</Table.Th>
                <Table.Th>Army</Table.Th>
                <Table.Th>Placing</Table.Th>
                <Table.Th ta="right">Score</Table.Th>
                <Table.Th ta="center">Counts</Table.Th>
                <Table.Th>List</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.history.map((entry) => (
                <HistoryRow key={entry.playerId} entry={entry} />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Panel>
    </Stack>
  );
}
