import { EventListResponseSchema } from '@bcp/shared';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { SearchSelect } from '../../components/SearchSelect';
import { apiGet } from '../../api/client';
import { AnchorLink } from '../../components/AnchorLink';
import { playerListQuery, playersQuery } from '../event/event-queries';
import { planFromEvent, teamsOf } from './event-plan';
import type { SheetPlan } from './sheet-plan';

const PLAYERS = 5;
const LAST = 'pairings:last-teams';

/** Team events, newest first. */
const teamEventsQuery = {
  queryKey: ['pairings', 'team-events'],
  queryFn: () =>
    apiGet('/api/events?type=teams&sort=date&dir=desc&pageSize=100', EventListResponseSchema),
};

function readLast(): { event?: string; team?: string } {
  try {
    const value = JSON.parse(localStorage.getItem(LAST) ?? '{}') as unknown;
    if (typeof value !== 'object' || value === null) return {};
    const { event, team } = value as { event?: unknown; team?: unknown };
    return {
      event: typeof event === 'string' ? event : undefined,
      team: typeof team === 'string' ? team : undefined,
    };
  } catch {
    return {};
  }
}

function writeLast(event: string, team: string): void {
  try {
    localStorage.setItem(LAST, JSON.stringify({ event, team }));
  } catch {
    // Storage blocked: the picker starts empty next time.
  }
}

/**
 * Pick the event, our team and the opponent: both rosters come with their armies, detachments,
 * dispositions and short lists (from the lists fetched so far). The last event and team are
 * remembered, so each round only the opponent changes.
 */
export function TeamPicker({ onUse }: { onUse: (plan: SheetPlan) => void }) {
  const last = readLast();
  const [event, setEvent] = useState<string | null>(last.event ?? null);
  const [team, setTeam] = useState<string | null>(last.team ?? null);
  const [opponent, setOpponent] = useState<string | null>(null);
  const events = useQuery(teamEventsQuery);
  const players = useQuery({ ...playersQuery(event ?? ''), enabled: event !== null });
  const all = players.data?.items ?? [];
  const teams = teamsOf(all);
  const picked = all.filter(
    (p) => !p.dropped && (p.teamId === team || p.teamId === opponent) && opponent !== null,
  );
  const fetched = picked.filter((p) => p.listStatus === 'fetched');
  const lists = useQueries({ queries: fetched.map((p) => playerListQuery(p.bcpId)) });
  const listsReady = lists.every((q) => !q.isPending);
  const short = [team, opponent]
    .map((id) => teams.find((t) => t.id === id))
    .find((t) => t !== undefined && t.players !== PLAYERS);
  const eventName = events.data?.items.find((e) => e.bcpId === event)?.name;
  const use = () => {
    if (!event || !team || !opponent) return;
    const texts = new Map(fetched.map((p, i) => [p.bcpId, lists[i]?.data?.text ?? null]));
    const plan = planFromEvent(all, texts, team, opponent, event);
    writeLast(event, team);
    onUse({
      ...plan,
      source: {
        event,
        team,
        opponent,
        eventName,
        teamName: teams.find((t) => t.id === team)?.name,
        opponentName: teams.find((t) => t.id === opponent)?.name,
      },
    });
  };
  const options = (list: { id: string; name: string; players: number }[]) =>
    list.map((t) => ({
      value: t.id,
      label: t.players === PLAYERS ? t.name : `${t.name} (${String(t.players)} players)`,
    }));
  // A–Z, so a known event is quick to find (typing filters too).
  const eventOptions = [...(events.data?.items ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ value: e.bcpId, label: `${e.name} · ${e.startDate.slice(0, 10)}` }));
  return (
    <Stack gap="sm">
      <Group align="flex-end" gap="sm">
        <SearchSelect
          label="Event"
          placeholder="Pick a team event"
          selectFirstOptionOnChange
          value={event}
          onChange={(v) => {
            setEvent(v);
            setTeam(null);
            setOpponent(null);
          }}
          data={eventOptions}
          nothingFoundMessage="No such team event"
          w={380}
        />
        <SearchSelect
          label="Your team"
          placeholder="Pick a team"
          selectFirstOptionOnChange
          disabled={event === null || teams.length === 0}
          value={team}
          onChange={(v) => {
            setTeam(v);
            setOpponent(null);
          }}
          data={options(teams)}
          nothingFoundMessage="No such team"
          w={260}
        />
        <SearchSelect
          label="Opponent"
          placeholder="Pick a team"
          selectFirstOptionOnChange
          disabled={team === null}
          value={opponent}
          onChange={setOpponent}
          data={options(teams.filter((t) => t.id !== team))}
          nothingFoundMessage="No such team"
          w={260}
        />
      </Group>
      {short && (
        <Alert color="yellow">
          {short.name} has {String(short.players)} players; pairings need {String(PLAYERS)} on each
          team.
        </Alert>
      )}
      {opponent !== null && !short && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {String(fetched.length)} of {String(picked.length)} lists fetched
            {fetched.length < picked.length && event && (
              <>
                {' '}
                · the others come without a short list.{' '}
                <AnchorLink
                  to="/events/$eventId"
                  params={{ eventId: event }}
                  search={{ tab: 'players' }}
                >
                  Fetch them on the event page
                </AnchorLink>
              </>
            )}
          </Text>
          <Button onClick={use} loading={!listsReady}>
            Use these teams
          </Button>
        </Group>
      )}
    </Stack>
  );
}
