import type { EventListItem } from '@bcp/shared';
import { eventPhase } from '@bcp/shared';
import { Badge, Group } from '@mantine/core';
import classes from './EventStatusBadges.module.css';

type BadgeFields = Pick<
  EventListItem,
  | 'isTeamEvent'
  | 'isOnline'
  | 'startDate'
  | 'endDate'
  | 'ended'
  | 'hideLists'
  | 'lastSyncedAt'
  | 'removedFromBcpAt'
  | 'blockedAt'
>;

/**
 * Small state tags, shared by the finder table and the event header.
 * They wrap onto a new line rather than shrink: a squeezed Mantine badge clips its label.
 */
export function EventStatusBadges({ event }: { event: BadgeFields }) {
  const phase = eventPhase(event, new Date());
  return (
    <Group gap={4} wrap="wrap" className={classes.badges}>
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
      {phase === 'running' && (
        <Badge size="xs" variant="light">
          Running
        </Badge>
      )}
      {phase === 'upcoming' && (
        <Badge size="xs" variant="outline" color="gray">
          Upcoming
        </Badge>
      )}
      {event.hideLists && (
        <Badge size="xs" variant="outline" color="yellow">
          Lists hidden
        </Badge>
      )}
      {event.blockedAt !== null && (
        <Badge size="xs" variant="filled" color="red">
          Blocked
        </Badge>
      )}
      {event.removedFromBcpAt !== null && (
        <Badge size="xs" variant="outline" color="orange">
          Removed from BCP
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
