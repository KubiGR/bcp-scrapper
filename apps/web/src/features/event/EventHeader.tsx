import type { EventDetail } from '@bcp/shared';
import { Anchor, Button, Group, Stack, Text, Title } from '@mantine/core';
import { EventStatusBadges } from '../../components/EventStatusBadges';
import { EventHeat, NewLeaf, playedLately } from '../../components/EventSymbols';
import {
  formatDateTime,
  formatEventDates,
  formatEventSize,
  formatRoundCount,
} from '../../lib/format';
import { UpdateLabel } from '../updates/UpdateLabel';

interface EventHeaderProps {
  event: EventDetail;
  syncing: boolean;
  onRefresh: () => void;
}

export function EventHeader({ event, syncing, onRefresh }: EventHeaderProps) {
  const location = [event.city, event.country].filter(Boolean).join(', ');
  return (
    <Stack gap="xs">
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
          <Button variant="outline" size="sm" loading={syncing} onClick={onRefresh}>
            Refresh from BCP
          </Button>
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
        <Text size="sm" c="dimmed" className="numeric">
          {[formatEventSize(event), formatRoundCount(event.roundCount)].filter(Boolean).join(' · ')}
          <EventHeat playerCount={event.playerCount} />
        </Text>
        <UpdateLabel startDate={event.startDate} prefix="Update: " size="sm" c="dimmed" />
        <EventStatusBadges event={event} />
      </Group>
      {event.lastSyncedAt !== null && (
        <Text size="xs" c="dimmed" className="numeric">
          Synced {formatDateTime(event.lastSyncedAt)}
        </Text>
      )}
    </Stack>
  );
}
