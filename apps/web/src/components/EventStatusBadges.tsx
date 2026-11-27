import type { EventListItem, EventListProgress } from '@bcp/shared';
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
  | 'listProgress'
>;

type ListCounts = Pick<EventListProgress, 'listsAvailable' | 'listsFetched'>;
const percentFormat = new Intl.NumberFormat(undefined, {
  style: 'percent',
  maximumFractionDigits: 1,
});

/**
 * Small state tags, shared by the finder table and the event header.
 * They wrap onto a new line rather than shrink: a squeezed Mantine badge clips its label.
 */
export function EventStatusBadges({
  event,
  listProgress = event.listProgress,
}: {
  event: BadgeFields;
  listProgress?: ListCounts;
}) {
  const phase = eventPhase(event, new Date());
  const available = listProgress?.listsAvailable ?? 0;
  const pending = Math.max(0, available - (listProgress?.listsFetched ?? 0));
  const fraction = available > 0 ? pending / available : 0;
  const percent =
    fraction > 0 && fraction < 0.001
      ? `<${percentFormat.format(0.001)}`
      : percentFormat.format(fraction);
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
        <Badge
          size="xs"
          variant="outline"
          color="gray"
          title={available > 0 ? `${pending} of ${available} available lists pending` : undefined}
        >
          Synced{available > 0 && ` · ${percent} lists pending`}
        </Badge>
      )}
    </Group>
  );
}
