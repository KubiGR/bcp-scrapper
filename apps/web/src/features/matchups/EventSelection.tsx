import type { MatchupEvent, PairingsState } from '@bcp/shared';
import { Button, Checkbox, Group, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnchorLink } from '../../components/AnchorLink';
import { Panel } from '../../components/Panel';
import { formatDuration, formatEventSize, formatIsoDay, plural } from '../../lib/format';
import { fetchQueueQuery } from '../fetch-queue/fetch-queue-queries';
import { queueManyPairings } from './matchups-queries';

const STATE_LABEL: Record<PairingsState, string> = {
  synced: 'Synced',
  fetching: 'Fetching',
  partial: 'Partial',
  missing: 'No pairings',
};

const DIMMED_STATES: PairingsState[] = ['partial', 'missing'];

interface EventSelectionProps {
  events: MatchupEvent[];
  exclude: string[];
  include: string[];
  onChange: (next: { exclude: string[]; include: string[] }) => void;
}

/** A compact list of the team events in the selected range, with a tick box, name (links to the
 * event's Matchups tab), date, size and pairings state, plus a bulk Sync button for the events
 * whose pairings are missing or partial. */
export function EventSelection({ events, exclude, include, onChange }: EventSelectionProps) {
  const queryClient = useQueryClient();
  const sync = useMutation({
    mutationFn: (eventIds: string[]) => queueManyPairings(eventIds),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['matchups'] }),
        queryClient.invalidateQueries({ queryKey: fetchQueueQuery.queryKey }),
      ]);
      const parts = [
        `Queued ${plural(result.queuedRounds, 'round')} for ${plural(result.events, 'event')}`,
      ];
      if (result.estimatedSeconds !== null) {
        parts.push(`about ${formatDuration(result.estimatedSeconds)}`);
      }
      notifications.show({ color: 'neon', title: 'Pairings', message: parts.join(' · ') });
    },
    onError: (error) => {
      notifications.show({ color: 'red', title: 'Pairings', message: error.message });
    },
  });

  const toggle = (event: MatchupEvent) => {
    if (event.pairings === 'synced') {
      const nextExclude = event.included
        ? [...exclude, event.id]
        : exclude.filter((id) => id !== event.id);
      onChange({ exclude: nextExclude, include });
    } else {
      const nextInclude = event.included
        ? include.filter((id) => id !== event.id)
        : [...include, event.id];
      onChange({ exclude, include: nextInclude });
    }
  };

  const toSync = events.filter((e) => e.pairings === 'missing' || e.pairings === 'partial');

  if (events.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No team events in this range.
      </Text>
    );
  }

  return (
    <Group gap="sm" align="flex-start" wrap="wrap">
      <div style={{ flex: '1 1 480px' }}>
        {toSync.length > 0 && (
          <Group mb="sm">
            <Button
              size="xs"
              loading={sync.isPending}
              onClick={() => {
                sync.mutate(toSync.map((event) => event.id));
              }}
            >
              Sync pairings for {toSync.length} events
            </Button>
          </Group>
        )}
        <Panel p={0}>
          <Table.ScrollContainer minWidth={480}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th />
                  <Table.Th>Event</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>Pairings</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {events.map((event) => (
                  <Table.Tr key={event.id}>
                    <Table.Td>
                      <Checkbox
                        aria-label={`Include ${event.name}`}
                        checked={event.included}
                        onChange={() => {
                          toggle(event);
                        }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <AnchorLink
                        to="/events/$eventId"
                        params={{ eventId: event.id }}
                        search={{ tab: 'matchups' }}
                      >
                        {event.name}
                      </AnchorLink>
                    </Table.Td>
                    <Table.Td className="numeric">
                      {formatIsoDay(event.startDate.slice(0, 10))}
                    </Table.Td>
                    <Table.Td className="numeric">{formatEventSize(event)}</Table.Td>
                    <Table.Td>
                      <Text
                        size="sm"
                        c={DIMMED_STATES.includes(event.pairings) ? 'dimmed' : undefined}
                      >
                        {STATE_LABEL[event.pairings]}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Panel>
      </div>
    </Group>
  );
}
