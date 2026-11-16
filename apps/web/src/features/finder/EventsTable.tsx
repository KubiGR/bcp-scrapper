import type { EventListItem, EventListResponse } from '@bcp/shared';
import {
  Group,
  LoadingOverlay,
  Pagination,
  Select,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { EventStatusBadges } from '../../components/EventStatusBadges';
import { EventHeat, NameWithLeaf } from '../../components/EventSymbols';
import { FieldElo } from '../../components/FieldElo';
import { Card, CardGroup, Stat, scoreboardClasses } from '../../components/Scoreboard';
import { formatEventDates, plural } from '../../lib/format';
import { eventPath, openHere } from '../../lib/open-link';
import { UpdateLabel } from '../updates/UpdateLabel';
import classes from './EventsTable.module.css';
import { FINDER_PAGE_SIZES, type FinderPageSize, type FinderSearch } from './finder-search';
import { weekOf } from './week';

type EventSort = FinderSearch['sort'];
type SortDir = FinderSearch['dir'];

/** The orders on offer; newest first is the default (no sort in the address). */
const ORDERS = [
  { value: 'date-desc', label: 'Newest first', sort: 'date', dir: 'desc' },
  { value: 'date-asc', label: 'Oldest first', sort: 'date', dir: 'asc' },
  { value: 'players-desc', label: 'Biggest first', sort: 'players', dir: 'desc' },
  { value: 'players-asc', label: 'Smallest first', sort: 'players', dir: 'asc' },
] as const satisfies readonly { value: string; label: string; sort: EventSort; dir: SortDir }[];

interface EventsTableProps {
  /** The server's sort (the list is paged there); `onSortChange(null)` goes back to newest first. */
  sort: EventSort;
  dir: SortDir;
  onSortChange: (next: { sort: EventSort; dir: SortDir } | null) => void;
  response: EventListResponse | undefined;
  fetching: boolean;
  page: number;
  onPageChange: (page: number) => void;
  perPage: FinderPageSize;
  onPerPageChange: (perPage: FinderPageSize) => void;
  onOpen: (eventId: string) => void;
  emptyText: string;
}

const placeOf = (event: EventListItem) => [event.city, event.country].filter(Boolean).join(', ');

/** Events in a run of the same week, in order: by date, the server sends a week at a time. */
function byWeek(events: EventListItem[]) {
  const weeks: { key: string; label: string; events: EventListItem[] }[] = [];
  for (const event of events) {
    const week = weekOf(event.startDate);
    const last = weeks.at(-1);
    if (last?.key === week.key) last.events.push(event);
    else weeks.push({ ...week, events: [event] });
  }
  return weeks;
}

/** The big events found, as cards: by date a group per week, by size one list; paged. */
export function EventsTable({
  sort,
  dir,
  onSortChange,
  response,
  fetching,
  page,
  onPageChange,
  perPage,
  onPerPageChange,
  onOpen,
  emptyText,
}: EventsTableProps) {
  const records = response?.items ?? [];
  const total = response?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const order = `${sort}-${dir}`;
  const card = (event: EventListItem) => (
    <EventCard key={event.bcpId} event={event} onOpen={onOpen} />
  );

  return (
    <Stack gap="lg" pos="relative">
      <LoadingOverlay visible={fetching && response === undefined} />
      <Group justify="space-between" align="flex-end">
        <Text c="dimmed">{response ? plural(total, 'event') : ''}</Text>
        <Select
          label="Sort by"
          data={ORDERS.map(({ value, label }) => ({ value, label }))}
          value={order}
          onChange={(value) => {
            const next = ORDERS.find((option) => option.value === value);
            if (next === undefined) return;
            onSortChange(next.value === 'date-desc' ? null : { sort: next.sort, dir: next.dir });
          }}
          allowDeselect={false}
          w={170}
        />
      </Group>

      {records.length === 0 ? (
        <Text c="dimmed" py="xl" ta="center">
          {response === undefined ? '' : emptyText}
        </Text>
      ) : sort === 'date' ? (
        byWeek(records).map((week) => (
          <CardGroup
            key={week.key}
            label={week.label}
            description={plural(week.events.length, 'event')}
          >
            {week.events.map(card)}
          </CardGroup>
        ))
      ) : (
        <div className={scoreboardClasses.group}>{records.map(card)}</div>
      )}

      {total > 0 && (
        <Group justify="space-between" align="flex-end">
          <Select
            label="Per page"
            data={FINDER_PAGE_SIZES.map(String)}
            value={String(perPage)}
            onChange={(value) => {
              const size = FINDER_PAGE_SIZES.find((option) => String(option) === value);
              if (size !== undefined) onPerPageChange(size);
            }}
            allowDeselect={false}
            w={110}
          />
          {pages > 1 && <Pagination total={pages} value={page} onChange={onPageChange} />}
        </Group>
      )}
    </Stack>
  );
}

/** One event: its name, dates and place; its size, field Elo and rounds; and how loaded it is. */
function EventCard({ event, onOpen }: { event: EventListItem; onOpen: (id: string) => void }) {
  const place = placeOf(event);
  return (
    <Card
      onOpen={() => {
        onOpen(event.bcpId);
      }}
    >
      <div className={classes.name}>
        {/* A real link (⌘-click opens a new tab); a plain click opens the event here. */}
        <UnstyledButton
          component="a"
          href={eventPath(event.bcpId)}
          className={classes.eventName}
          onClick={openHere(() => {
            onOpen(event.bcpId);
          })}
        >
          <NameWithLeaf name={event.name} startDate={event.startDate} />
        </UnstyledButton>
        <Text size="sm" c="dimmed" className={classes.when}>
          <span className="numeric">{formatEventDates(event.startDate, event.endDate)}</span>
          {place !== '' && ` · ${place}`}
        </Text>
        <UpdateLabel startDate={event.startDate} size="xs" c="dimmed" />
      </div>
      <Stat
        className={classes.size}
        value={
          <>
            {event.playerCount}
            <EventHeat playerCount={event.playerCount} />
          </>
        }
        label={
          event.teamCount === null
            ? event.playerCount === 1
              ? 'player'
              : 'players'
            : `players · ${plural(event.teamCount, 'team')}`
        }
      />
      <Stat
        className={classes.figure}
        value={event.fieldElo === null ? '—' : <FieldElo elo={event.fieldElo} bare />}
        label="field Elo"
      />
      <Stat
        className={classes.figure}
        value={event.roundCount > 0 ? event.roundCount : '—'}
        label="rounds"
      />
      <div className={classes.status}>
        <EventStatusBadges event={event} />
      </div>
    </Card>
  );
}
