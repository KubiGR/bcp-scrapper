import type { EventDetail } from '@bcp/shared';
import { Anchor, Button, Group, Stack, Text, Title } from '@mantine/core';
import { EventStatusBadges } from '../../components/EventStatusBadges';
import { FieldElo } from '../../components/FieldElo';
import { HotCount, NewLeaf, playedLately } from '../../components/EventSymbols';
import { StatTiles } from '../../components/Scoreboard';
import { formatDateTime, formatEventDates } from '../../lib/format';
import { UpdateLabel } from '../updates/UpdateLabel';
import { BlockEventButton } from './BlockEventButton';

interface EventHeaderProps {
  event: EventDetail;
  syncing: boolean;
  onRefresh: () => void;
}

/** The event's size and strength as tiles: players, teams, rounds and field Elo, those known. */
function sizeTiles(event: EventDetail) {
  return [
    {
      value: <HotCount playerCount={event.playerCount}>{event.playerCount}</HotCount>,
      label: event.playerCount === 1 ? 'player' : 'players',
    },
    ...(event.teamCount === null
      ? []
      : [{ value: event.teamCount, label: event.teamCount === 1 ? 'team' : 'teams' }]),
    ...(event.roundCount > 0
      ? [{ value: event.roundCount, label: event.roundCount === 1 ? 'round' : 'rounds' }]
      : []),
    ...(event.fieldElo === null
      ? []
      : [{ value: <FieldElo elo={event.fieldElo} bare />, label: 'field Elo' }]),
  ];
}

export function EventHeader({ event, syncing, onRefresh }: EventHeaderProps) {
  const location = [event.city, event.country].filter(Boolean).join(', ');
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Title order={1}>
          {event.name}
          {playedLately(event.startDate) && <NewLeaf />}
        </Title>
        <Group gap="sm">
          <Anchor
            href={`https://www.bestcoastpairings.com/event/${encodeURIComponent(event.bcpId)}`}
            target="_blank"
            rel="noreferrer"
            size="sm"
          >
            Open on BCP ↗
          </Anchor>
          <BlockEventButton event={event} />
          {/* A blocked event isn't fetched, by hand either: Unblock first. */}
          {event.blockedAt === null && (
            <Button variant="outline" size="sm" loading={syncing} onClick={onRefresh}>
              Refresh from BCP
            </Button>
          )}
        </Group>
      </Group>
      <Group gap="md" wrap="wrap">
        <Text size="sm" c="dimmed" className="numeric">
          {formatEventDates(event.startDate, event.endDate)}
        </Text>
        {location !== '' && (
          <Text size="sm" c="dimmed">
            {location}
          </Text>
        )}
        <UpdateLabel startDate={event.startDate} prefix="Update: " size="sm" c="dimmed" />
        <EventStatusBadges event={event} listProgress={event.counts} />
      </Group>
      <StatTiles items={sizeTiles(event)} />
      {event.lastSyncedAt !== null && (
        <Text size="xs" c="dimmed" className="numeric">
          Synced {formatDateTime(event.lastSyncedAt)}
        </Text>
      )}
      {event.blockedAt !== null && (
        <Text size="sm" c="dimmed">
          An admin blocked this event ({formatDateTime(event.blockedAt)}), so Logis doesn't ask BCP
          for it any more. The players and lists below are what was stored before.
        </Text>
      )}
      {event.removedFromBcpAt !== null && (
        <Text size="sm" c="dimmed">
          BCP no longer has this event (checked {formatDateTime(event.removedFromBcpAt)}), so it
          isn't synced any more. The players and lists below are what was stored before.
        </Text>
      )}
    </Stack>
  );
}
