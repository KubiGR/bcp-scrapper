import {
  analysePairing,
  pointsMatrix,
  type PairingRating,
  type PairingRosterPlayer,
} from '@bcp/shared';
import { Alert, Group, Select, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import {
  eventTeamsQuery,
  pairingQuery,
  teamEventsQuery,
  useSaveRating,
  useSaveRatings,
} from './pairing-queries';
import type { PairingsChoice } from './last-choice';
import { PasteFromSheet } from './PasteFromSheet';
import { ChainFlow } from './ChainFlow';
import { DefenderGrid } from './DefenderGrid';
import { PairingSummary } from './PairingSummary';
import { RatingsTable } from './RatingsTable';

/** The pairings planner: pick the event, your team and the team you play, then rate and analyse. */
export function PairingsPage({
  choice,
  onChange,
}: {
  choice: PairingsChoice;
  onChange: (next: PairingsChoice) => void;
}) {
  const { event, team, opponent } = choice;
  const events = useQuery(teamEventsQuery());
  const teams = useQuery({ ...eventTeamsQuery(event ?? ''), enabled: event !== undefined });
  const error = events.error ?? teams.error;
  const eventOptions = (events.data?.items ?? []).map((e) => ({
    value: e.bcpId,
    label: `${e.name} · ${e.startDate.slice(0, 10)}`,
  }));
  const teamOptions = (teams.data?.teams ?? []).map((t) => ({ value: t.id, label: t.name }));
  return (
    <Stack gap="lg">
      <Title order={2}>Pairings</Title>
      <Group align="flex-end" gap="sm">
        <Select
          label="Event"
          placeholder="Pick a team event"
          data={eventOptions}
          value={event ?? null}
          onChange={(v) => {
            if (v) onChange({ event: v });
          }}
          searchable
          w={360}
        />
        <Select
          label="My team"
          placeholder="Your team"
          data={teamOptions}
          value={team ?? null}
          disabled={event === undefined || !teams.data}
          onChange={(v) => {
            if (v) onChange({ event, team: v });
          }}
          searchable
          w={260}
        />
        <Select
          label="Opponent"
          placeholder="The team you play"
          data={teamOptions.filter((t) => t.value !== team)}
          value={opponent ?? null}
          disabled={team === undefined || !teams.data}
          onChange={(v) => {
            if (v) onChange({ event, team, opponent: v });
          }}
          searchable
          w={260}
        />
      </Group>
      {error && <ErrorState error={error} onRetry={() => void events.refetch()} />}
      {event !== undefined && team !== undefined && opponent !== undefined ? (
        <Matchup
          key={`${event}/${team}/${opponent}`}
          eventId={event}
          teamId={team}
          opponentId={opponent}
        />
      ) : (
        <Text c="dimmed">Pick the event, your team and the team you play.</Text>
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
  const saveAll = useSaveRatings(eventId, teamId, opponentId);
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
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {rated} of 25 rated{rated < 25 ? ' · unrated games count as Y (even)' : ''}
            </Text>
            <PasteFromSheet ours={ours} theirs={theirs} onSave={saveAll.mutateAsync} />
          </Group>
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
