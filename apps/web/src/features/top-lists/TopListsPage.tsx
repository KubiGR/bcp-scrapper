import { DETACHMENT_SEPARATOR, KNOWN_DISPOSITIONS } from '@bcp/shared';
import {
  Alert,
  Box,
  Button,
  Group,
  MultiSelect,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  useMatches,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AnchorLink } from '../../components/AnchorLink';
import { DispositionText } from '../../components/DispositionText';
import { ErrorState } from '../../components/ErrorState';
import { FilterToggle } from '../../components/FilterToggle';
import { Panel } from '../../components/Panel';
import rowClasses from '../../components/ClickableRow.module.css';
import { PlayerLine } from '../../components/PlayerLine';
import { formatIsoDay, plural } from '../../lib/format';
import { useDraftRange } from '../../lib/use-draft-range';
import { ListDrawer } from '../event/ListDrawer';
import { formatRecord, lossLabel } from '../event/players-filter';
import classes from './TopListsPage.module.css';
import { topListsQuery, topListsWindow, type TopListsSearch } from './top-lists-queries';

const LOSS_CHOICES = [0, 1, 2, 3, 4, 5];

const split = (value: string | undefined, separator = ',') =>
  value?.split(separator).filter(Boolean) ?? [];
const join = (values: string[], separator = ',') =>
  values.length === 0 ? undefined : values.join(separator);
const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

interface TopListsPageProps {
  search: TopListsSearch;
  onSearchChange: (next: TopListsSearch) => void;
}

/** Players of big events who went X-n or better, across events, with their lists. */
export function TopListsPage({ search, onSearchChange }: TopListsPageProps) {
  const results = useQuery(topListsQuery(search));
  // The open row, by key: the drawer follows the refreshed results (e.g. after "Fetch this list").
  const [openKey, setOpenKey] = useState<{ eventId: string; bcpId: string } | null>(null);
  const dates = useDraftRange(topListsWindow(search, new Date()), (range) => {
    onSearchChange({ ...search, from: range.from, to: range.to });
  });

  const factions = split(search.factions);
  const dispositions = split(search.dispositions);
  const detachments = split(search.detachments, DETACHMENT_SEPARATOR);
  const found = results.data?.players ?? [];
  const open =
    openKey === null
      ? null
      : (found.find((p) => p.eventId === openKey.eventId && p.bcpId === openKey.bcpId) ?? null);
  const maxLosses = search.maxLosses ?? 1;
  // Phones show each result as a card (see the CSS module), which needs no scrolling.
  const tableMinWidth = useMatches({ base: 0, sm: 720 });
  const notLoaded = results.data ? results.data.eventsInRange - results.data.eventsLoaded : 0;

  return (
    <Stack gap="lg">
      <Title order={1}>Top lists</Title>
      <FilterToggle
        active={[factions, dispositions, detachments].filter((chosen) => chosen.length > 0).length}
      >
        <Group gap="md" align="flex-end" wrap="wrap">
          <MultiSelect
            label="Factions"
            placeholder={factions.length === 0 ? 'All factions' : undefined}
            data={uniqueSorted([...(results.data?.factionOptions ?? []), ...factions])}
            value={factions}
            onChange={(value) => {
              onSearchChange({ ...search, factions: join(value) });
            }}
            searchable
            clearable
            w={{ base: '100%', xs: 260 }}
          />
          <DatePickerInput
            type="range"
            label="Dates"
            valueFormat="D MMM YYYY"
            allowSingleDateInRange
            value={dates.draft}
            onChange={dates.onRangeChange}
            w={{ base: '100%', xs: 280 }}
          />
          <Select
            label="Record"
            data={LOSS_CHOICES.map((n) => ({ value: String(n), label: lossLabel(n) }))}
            value={String(maxLosses)}
            onChange={(value) => {
              if (value !== null) onSearchChange({ ...search, maxLosses: Number(value) });
            }}
            allowDeselect={false}
            w={{ base: '100%', xs: 170 }}
          />
          <MultiSelect
            label="Disposition"
            placeholder={dispositions.length === 0 ? 'All dispositions' : undefined}
            data={uniqueSorted([...KNOWN_DISPOSITIONS, ...dispositions])}
            value={dispositions}
            onChange={(value) => {
              onSearchChange({ ...search, dispositions: join(value) });
            }}
            renderOption={({ option }) => <DispositionText disposition={option.value} />}
            clearable
            w={{ base: '100%', xs: 240 }}
          />
          <MultiSelect
            label="Detachment"
            placeholder={detachments.length === 0 ? 'All detachments' : undefined}
            data={uniqueSorted([...(results.data?.detachmentOptions ?? []), ...detachments])}
            value={detachments}
            onChange={(value) => {
              onSearchChange({ ...search, detachments: join(value, DETACHMENT_SEPARATOR) });
            }}
            searchable
            clearable
            w={{ base: '100%', xs: 240 }}
          />
        </Group>
      </FilterToggle>

      {results.isPending && <Skeleton height={200} />}
      {results.error && <ErrorState error={results.error} onRetry={() => void results.refetch()} />}
      {results.data && (
        <Box
          style={{ opacity: results.isPlaceholderData ? 0.6 : 1 }}
          aria-busy={results.isFetching}
        >
          <Stack gap="sm">
            {notLoaded > 0 && (
              <Text size="sm" c="dimmed">
                {plural(notLoaded, 'big event')} in this range{' '}
                {notLoaded === 1 ? 'isn’t' : 'aren’t'} loaded yet, so their players aren’t searched.
              </Text>
            )}
            {results.data.truncated && (
              <Alert color="yellow">
                Showing the first 500 — narrow the search to see the rest.
              </Alert>
            )}
            {found.length === 0 ? (
              <Text size="sm" c="dimmed">
                No players match. Try more losses, other factions or a wider range.
              </Text>
            ) : (
              <Panel p={0}>
                <Table.ScrollContainer minWidth={tableMinWidth}>
                  <Table verticalSpacing="xs" className={classes.results}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Player</Table.Th>
                        <Table.Th>Event</Table.Th>
                        <Table.Th ta="right">W-L-D</Table.Th>
                        <Table.Th>Army</Table.Th>
                        <Table.Th aria-label="List" />
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {found.map((player) => (
                        <Table.Tr
                          key={`${player.eventId}:${player.bcpId}`}
                          className={rowClasses.row}
                          onClick={(e) => {
                            // Links and buttons in the row do their own thing.
                            if (e.target instanceof Element && e.target.closest('a, button'))
                              return;
                            setOpenKey({ eventId: player.eventId, bcpId: player.bcpId });
                          }}
                        >
                          <Table.Td>
                            <Text size="sm">{player.name}</Text>
                            {player.teamName && (
                              <Text size="xs" c="dimmed">
                                {player.teamName}
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <AnchorLink
                              to="/events/$eventId"
                              params={{ eventId: player.eventId }}
                              search={{ tab: 'players' }}
                            >
                              {player.eventName}
                            </AnchorLink>
                            <Text size="xs" c="dimmed" className="numeric">
                              {formatIsoDay(player.eventStartDate.slice(0, 10))}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right" className="numeric">
                            {formatRecord(player)}
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">
                              <PlayerLine {...player} />
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => {
                                setOpenKey({ eventId: player.eventId, bcpId: player.bcpId });
                              }}
                            >
                              List
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Panel>
            )}
          </Stack>
        </Box>
      )}
      <ListDrawer
        eventId={open?.eventId ?? ''}
        player={open}
        onClose={() => {
          setOpenKey(null);
        }}
      />
    </Stack>
  );
}
