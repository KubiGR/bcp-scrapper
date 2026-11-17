import type { MatchupEvent, PairingsState } from '@bcp/shared';
import { Button, Checkbox, Group, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnchorLink } from '../../components/AnchorLink';
import { Card, scoreboardClasses } from '../../components/Scoreboard';
import { useState } from 'react';
import classes from './EventSelection.module.css';
import { formatDuration, formatEventSize, formatIsoDay, plural } from '../../lib/format';
import { HotCount, NewLeaf, playedLately } from '../../components/EventSymbols';
import { sortRows, type SortDir, type SortValue } from '../../lib/table-sort';
import { fetchQueueQuery } from '../fetch-queue/fetch-queue-queries';
import { queueManyPairingsChunked } from './matchups-queries';

const STATE_LABEL: Record<PairingsState, string> = {
  synced: 'Synced',
  fetching: 'Fetching',
  partial: 'Partial',
  missing: 'No pairings',
};

const DIMMED_STATES: PairingsState[] = ['partial', 'missing'];

const EVENT_SORT = {
  name: (event) => event.name,
  date: (event) => Date.parse(event.startDate),
  size: (event) => event.playerCount,
  pairings: (event) => STATE_LABEL[event.pairings],
} satisfies Record<string, SortValue<MatchupEvent>>;

/** The orders on offer, each its natural way round; newest first. */
const EVENT_SORTS: { value: keyof typeof EVENT_SORT; label: string; dir: SortDir }[] = [
  { value: 'date', label: 'Newest first', dir: 'desc' },
  { value: 'size', label: 'Biggest first', dir: 'desc' },
  { value: 'name', label: 'Name A–Z', dir: 'asc' },
  { value: 'pairings', label: 'Pairings', dir: 'asc' },
];

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
  const [sortKey, setSortKey] = useState<keyof typeof EVENT_SORT>('date');
  const sorted = sortRows(
    events,
    EVENT_SORT[sortKey],
    EVENT_SORTS.find((option) => option.value === sortKey)?.dir ?? 'desc',
  );
  const sync = useMutation({
    mutationFn: (eventIds: string[]) => queueManyPairingsChunked(eventIds),
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

  const tickedCount = events.filter((event) => event.included).length;
  const allTicked = events.length > 0 && tickedCount === events.length;

  /** Ticks (or clears) every listed event; choices about events outside the range stay. */
  const setAll = (included: boolean) => {
    const syncedIds = new Set(events.filter((e) => e.pairings === 'synced').map((e) => e.id));
    const otherIds = new Set(events.filter((e) => e.pairings !== 'synced').map((e) => e.id));
    if (included) {
      onChange({
        exclude: exclude.filter((id) => !syncedIds.has(id)),
        include: [...include.filter((id) => !otherIds.has(id)), ...otherIds],
      });
    } else {
      onChange({
        exclude: [...exclude.filter((id) => !syncedIds.has(id)), ...syncedIds],
        include: include.filter((id) => !otherIds.has(id)),
      });
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
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Group gap="md" align="center">
          <Checkbox
            label="All"
            aria-label="Select all events"
            checked={allTicked}
            indeterminate={tickedCount > 0 && !allTicked}
            onChange={() => {
              setAll(!allTicked);
            }}
          />
          {toSync.length > 0 && (
            <Button
              size="xs"
              loading={sync.isPending}
              onClick={() => {
                sync.mutate(toSync.map((event) => event.id));
              }}
            >
              Sync pairings for {plural(toSync.length, 'event')}
            </Button>
          )}
        </Group>
        <Select
          label="Sort by"
          data={EVENT_SORTS.map(({ value, label }) => ({ value, label }))}
          value={sortKey}
          onChange={(value) => {
            const next = EVENT_SORTS.find((option) => option.value === value);
            if (next) setSortKey(next.value);
          }}
          allowDeselect={false}
          w={170}
        />
      </Group>
      <div className={scoreboardClasses.group} data-dense>
        {sorted.map((event) => (
          <Card dense key={event.id}>
            <Checkbox
              aria-label={`Include ${event.name}`}
              checked={event.included}
              onChange={() => {
                toggle(event);
              }}
            />
            <div className={classes.name}>
              <Text size="sm" fw={600}>
                <AnchorLink
                  to="/events/$eventId"
                  params={{ eventId: event.id }}
                  search={{ tab: 'matchups' }}
                >
                  {event.name}
                </AnchorLink>
                {playedLately(event.startDate) && <NewLeaf />}
              </Text>
              <Text size="xs" c="dimmed" className="numeric">
                {formatIsoDay(event.startDate.slice(0, 10))}
              </Text>
            </div>
            <Text size="sm" className={`numeric ${classes.size}`}>
              <HotCount playerCount={event.playerCount}>{formatEventSize(event)}</HotCount>
            </Text>
            <Text
              size="sm"
              className={classes.state}
              c={DIMMED_STATES.includes(event.pairings) ? 'dimmed' : undefined}
            >
              {STATE_LABEL[event.pairings]}
            </Text>
          </Card>
        ))}
      </div>
    </Stack>
  );
}
