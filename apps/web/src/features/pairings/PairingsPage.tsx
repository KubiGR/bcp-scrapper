import {
  analysePairing,
  pointsMatrix,
  type PairingRating,
  type PairingRosterPlayer,
} from '@bcp/shared';
import { Alert, Select, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { pairingQuery, pairingTeamsQuery, useSaveRating } from './pairing-queries';
import { ChainFlow } from './ChainFlow';
import { DefenderGrid } from './DefenderGrid';
import { PairingSummary } from './PairingSummary';
import { RatingsTable } from './RatingsTable';

export function PairingsPage({
  eventId,
  teamId,
  opponentId,
  onOpponentChange,
}: {
  eventId: string;
  teamId: string;
  opponentId: string | null;
  onOpponentChange: (id: string) => void;
}) {
  const teams = useQuery(pairingTeamsQuery(eventId, teamId));
  if (teams.isPending) return <Skeleton height={200} />;
  if (teams.error) return <ErrorState error={teams.error} onRetry={() => void teams.refetch()} />;
  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <AnchorLink to="/events/$eventId/teams/$teamId" params={{ eventId, teamId }}>
          <Text size="sm">← {teams.data.team.name}</Text>
        </AnchorLink>
        <Title order={2}>Pairings</Title>
      </Stack>
      <Select
        label="Opposing team"
        placeholder="Pick a team"
        data={teams.data.opponents.map((t) => ({ value: t.id, label: t.name }))}
        value={opponentId}
        onChange={(v) => {
          if (v) onOpponentChange(v);
        }}
        searchable
        maw={360}
      />
      {opponentId === null ? (
        <Text c="dimmed">Pick the team you play this round.</Text>
      ) : (
        <Matchup eventId={eventId} teamId={teamId} opponentId={opponentId} />
      )}
    </Stack>
  );
}

function Matchup({
  eventId,
  teamId,
  opponentId,
}: {
  eventId: string;
  teamId: string;
  opponentId: string;
}) {
  const data = useQuery(pairingQuery(eventId, teamId, opponentId));
  const save = useSaveRating(eventId, teamId, opponentId);
  if (data.isPending) return <Skeleton height={240} />;
  if (data.error) return <ErrorState error={data.error} onRetry={() => void data.refetch()} />;
  const { ours, theirs, ratings, problem } = data.data;
  if (problem) return <Alert color="yellow">{problem}</Alert>;
  const { rated } = pointsMatrix(
    ours.map((p) => p.id),
    theirs.map((p) => p.id),
    ratings,
  );
  return (
    <Stack gap="lg">
      <Panel title="Rate the games">
        <Stack gap="xs">
          <RatingsTable
            ours={ours}
            theirs={theirs}
            ratings={ratings}
            onRate={(playerId, opponentPlayerId, chip) => {
              save.mutate({ playerId, opponentPlayerId, chip });
            }}
          />
          <Text size="xs" c="dimmed">
            {rated} of 25 rated{rated < 25 ? ' · unrated games count as Y (even)' : ''}
          </Text>
          {save.error && <Alert color="red">Couldn’t save: {save.error.message}</Alert>}
        </Stack>
      </Panel>
      <Analysis ours={ours} theirs={theirs} ratings={ratings} />
    </Stack>
  );
}

/** Everything worked out from the ratings: re-solved whenever a chip changes. */
function Analysis({
  ours,
  theirs,
  ratings,
}: {
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  ratings: PairingRating[];
}) {
  const { points } = pointsMatrix(
    ours.map((p) => p.id),
    theirs.map((p) => p.id),
    ratings,
  );
  const key = JSON.stringify(points);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `points` (same numbers, new array each render).
  const analysis = useMemo(() => analysePairing(points), [key]);
  const [square, setSquare] = useState<{ d: number; e: number } | null>(null);
  const selected = square ?? {
    d: analysis.safeDefender.index,
    e: analysis.theirDefender.indexOf(Math.max(...analysis.theirDefender)),
  };
  return (
    <>
      <Panel title="Summary">
        <PairingSummary analysis={analysis} ours={ours} theirs={theirs} />
      </Panel>
      <Panel title="Round 1 defenders">
        <DefenderGrid
          analysis={analysis}
          ours={ours}
          theirs={theirs}
          selected={selected}
          onSelect={(d, e) => {
            setSquare({ d, e });
          }}
        />
      </Panel>
      <Panel title="The chain">
        <ChainFlow
          key={`${String(selected.d)}-${String(selected.e)}`}
          analysis={analysis}
          ours={ours}
          theirs={theirs}
          d={selected.d}
          e={selected.e}
        />
      </Panel>
    </>
  );
}
