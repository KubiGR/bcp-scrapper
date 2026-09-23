import type { EventListItem } from '@bcp/shared';
import { Badge, Group } from '@mantine/core';

type BadgeFields = Pick<
  EventListItem,
  'isTeamEvent' | 'isOnline' | 'ended' | 'hideLists' | 'lastSyncedAt'
>;

/** Small state tags, shared by the finder table and the event header. */
export function EventStatusBadges({ event }: { event: BadgeFields }) {
  return (
    <Group gap={6} wrap="nowrap">
      {event.isTeamEvent && (
        <Badge size="xs" variant="outline">
          Teams
        </Badge>
      )}
      {event.isOnline && (
        <Badge size="xs" variant="outline" color="gray">
          Online
        </Badge>
      )}
      {!event.ended && (
        <Badge size="xs" variant="light">
          Running
        </Badge>
      )}
      {event.hideLists && (
        <Badge size="xs" variant="outline" color="yellow">
          Lists hidden
        </Badge>
      )}
      {event.lastSyncedAt !== null && (
        <Badge size="xs" variant="outline" color="gray">
          Synced
        </Badge>
      )}
    </Group>
  );
}
