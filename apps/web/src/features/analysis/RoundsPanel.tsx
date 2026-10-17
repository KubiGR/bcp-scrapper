import type { EventDetail, MatchupView } from '@bcp/shared';
import {
  Accordion,
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { playersQuery } from '../event/event-queries';
import { ListDrawer } from '../event/ListDrawer';
import { roundsQuery } from './analysis-queries';
import { GamesTable } from './GamesTable';
import { formatPoints, outcomeLabel } from './format';
import { filterRound } from './round-filter';

function MatchupTeamLinks({ eventId, matchup }: { eventId: string; matchup: MatchupView }) {
  return (
    <Group gap="sm" mb="sm">
      <AnchorLink
        to="/events/$eventId/teams/$teamId"
        params={{ eventId, teamId: matchup.teamA.id }}
      >
        <Text size="sm">{matchup.teamA.name} · team page</Text>
      </AnchorLink>
      {matchup.teamB && (
        <AnchorLink
          to="/events/$eventId/teams/$teamId"
          params={{ eventId, teamId: matchup.teamB.id }}
        >
          <Text size="sm">{matchup.teamB.name} · team page</Text>
        </AnchorLink>
      )}
    </Group>
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
  const players = useQuery(playersQuery(event.bcpId));
  const [selected, setSelected] = useState<string | null>(null);
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
  // Narrows every round to the games of a player, army or team (kept across rounds).
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<string[]>([]);

  if (rounds.isPending) return <Skeleton height={200} />;
  if (rounds.error)
    return <ErrorState error={rounds.error} onRetry={() => void rounds.refetch()} />;
  const all = rounds.data.rounds;
  if (all.length === 0) return <Text c="dimmed">No rounds stored yet.</Text>;
  const round = all.find((r) => String(r.round) === selected) ?? all[0];
  if (!round) return null;
  const current = filterRound(round, query);
  const filtering = query.trim() !== '';
  const nothing = filtering && current.matchups.length === 0 && current.games.length === 0;

  const knownPlayerIds = new Set((players.data?.items ?? []).map((p) => p.bcpId));
  const openPlayer = players.data?.items.find((p) => p.bcpId === openPlayerId) ?? null;

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
      <TextInput
        aria-label="Filter games"
        placeholder="Filter players, teams, armies, detachments…"
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
        }}
      />
      {nothing && (
        <Text c="dimmed" size="sm">
          No games match “{query.trim()}” in this round.
        </Text>
      )}
      {current.matchups.length > 0 && (
        <Panel p={0}>
          <Accordion
            multiple
            chevronPosition="left"
            // Filtering opens every matchup that still has a matching game.
            value={filtering ? current.matchups.map((m) => m.id) : opened}
            onChange={setOpened}
          >
            {current.matchups.map((matchup) => (
              <Accordion.Item key={matchup.id} value={matchup.id}>
                <Accordion.Control>
                  <MatchupControl matchup={matchup} />
                </Accordion.Control>
                <Accordion.Panel>
                  <MatchupTeamLinks eventId={event.bcpId} matchup={matchup} />
                  <GamesTable
                    games={matchup.games}
                    onShowList={setOpenPlayerId}
                    eventId={event.bcpId}
                    knownPlayerIds={knownPlayerIds}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Panel>
      )}
      {current.games.length > 0 && (
        <Panel>
          <GamesTable
            games={current.games}
            onShowList={setOpenPlayerId}
            eventId={event.bcpId}
            knownPlayerIds={knownPlayerIds}
          />
        </Panel>
      )}
      <ListDrawer
        eventId={event.bcpId}
        player={openPlayer}
        onClose={() => {
          setOpenPlayerId(null);
        }}
      />
    </Stack>
  );
}
