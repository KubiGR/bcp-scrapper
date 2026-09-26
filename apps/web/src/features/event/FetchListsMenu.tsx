import type { EventDetail, EventPlayer } from '@bcp/shared';
import { Button, Menu, Stack, Text } from '@mantine/core';
import { lossLabel, lossOptions, missingListCount, missingListCountFor } from './players-filter';
import { useQueueLists } from './use-queue-lists';

interface FetchListsMenuProps {
  event: EventDetail;
  players: EventPlayer[];
  /** Teams ticked on the grouped players tab (team events). */
  selectedTeamIds?: string[];
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export function FetchListsMenu({ event, players, selectedTeamIds = [] }: FetchListsMenuProps) {
  const queue = useQueueLists(event);
  const allMissing = missingListCount(players, null);
  const selectedMissing = missingListCountFor(players, new Set(selectedTeamIds));
  const teams = selectedTeamIds.length;

  return (
    <Stack gap={4} align="flex-end" maw={360}>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button size="sm" loading={queue.isPending} disabled={event.counts.listsAvailable === 0}>
            Fetch lists
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            disabled={allMissing === 0}
            onClick={() => {
              queue.mutate({});
            }}
          >
            All missing lists ({allMissing})
          </Menu.Item>
          <Menu.Divider />
          {event.isTeamEvent ? (
            // Team events fetch whole teams rather than individual results.
            <Menu.Item
              disabled={teams === 0 || selectedMissing === 0}
              onClick={() => {
                queue.mutate({ teamIds: selectedTeamIds });
              }}
            >
              Selected teams ({teams} {plural(teams, 'team', 'teams')} · {selectedMissing}{' '}
              {plural(selectedMissing, 'list', 'lists')})
            </Menu.Item>
          ) : (
            lossOptions(event.roundCount).map((losses) => {
              const count = missingListCount(players, losses);
              return (
                <Menu.Item
                  key={losses}
                  disabled={count === 0}
                  onClick={() => {
                    queue.mutate({ maxLosses: losses });
                  }}
                >
                  {lossLabel(losses)} ({count})
                </Menu.Item>
              );
            })
          )}
        </Menu.Dropdown>
      </Menu>
      {event.hideLists && (
        <Text size="xs" c="yellow" ta="right">
          BCP marks this event's lists as hidden, so some may be unavailable.
        </Text>
      )}
    </Stack>
  );
}
