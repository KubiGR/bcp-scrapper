import type { ArchetypeRow, MetaRow } from '@bcp/shared';
import { Group, MultiSelect, Stack, Switch, Table, Text, useMatches } from '@mantine/core';
import { Fragment } from 'react';
import { plural } from '../../lib/format';
import { SortableTh, type SortDir } from '../../lib/table-sort';
import { factionKey, factionName, Figures, type PlayersFilter } from './FactionTable';
import type { MetaSort } from './meta-queries';

/** One archetype with its faction: a row of the flat table. */
interface Archetype extends ArchetypeRow {
  faction: string | null;
  detachments: string[];
}

interface ArchetypeTableProps {
  rows: MetaRow[];
  /** All counted players, for the groups' player counts. */
  totalPlayers: number;
  /** Group by popularity (share of players), sorting within each group. */
  grouped: boolean;
  onGroupedChange: (grouped: boolean) => void;
  minPlayers: number;
  /** `faction` sorts by archetype name (faction, then detachments). */
  sort: MetaSort;
  dir: SortDir;
  /** Shown factions; empty = all. */
  factions: string[];
  /** The next sort; null = back to the default. */
  onSortChange: (next: { sort: MetaSort; dir: SortDir } | null) => void;
  onFactionsChange: (factions: string[]) => void;
  onOpenPlayers: (filter: PlayersFilter) => void;
}

/**
 * Popularity groups by share of all players, so a high win rate from a handful of players
 * doesn't outrank a solid one from hundreds. Shares, not counts, so they fit any date range.
 */
const BANDS = [
  { name: 'Very popular', range: '2%+ of players', min: 0.02 },
  { name: 'Popular', range: '1–2%', min: 0.01 },
  { name: 'Played', range: '0.5–1%', min: 0.005 },
  { name: 'Rare', range: 'under 0.5%', min: 0 },
] as const;

/** The fewest players with at least `share` of `total` (rounding error aside). */
const playersFor = (share: number, total: number) => Math.ceil(share * total - 1e-9);

function bandTitle(index: number, total: number): string {
  const band = BANDS[index];
  if (band === undefined) return '';
  const low = playersFor(band.min, total);
  const above = BANDS[index - 1];
  const players =
    index === BANDS.length - 1
      ? `under ${String(playersFor(BANDS[index - 1]?.min ?? 0, total))}`
      : above === undefined
        ? `${String(low)}+`
        : `${String(low)}–${String(playersFor(above.min, total) - 1)}`;
  return `${band.name} · ${band.range} (${players})`;
}

const nameOf = (archetype: Archetype) =>
  `${factionName(archetype.faction)} · ${archetype.detachments.join(' + ')}`;

/**
 * Every faction + detachments combination in one table (the Meta page's default view): players,
 * share of all players, win rate and X-1. Archetypes under the minimum players, and the Unknown
 * faction's, are dimmed and sorted last; players without a known detachment in English can't be shown.
 */
export function ArchetypeTable({
  rows,
  totalPlayers,
  grouped,
  onGroupedChange,
  minPlayers,
  sort,
  dir,
  factions,
  onSortChange,
  onFactionsChange,
  onOpenPlayers,
}: ArchetypeTableProps) {
  // Phones drop Share and X-1 (see the cells), so the rest fits without scrolling.
  const tableMinWidth = useMatches({ base: 0, sm: 560 });
  const shown = rows.filter(
    (row) => factions.length === 0 || factions.includes(factionKey(row.faction)),
  );
  const archetypes: Archetype[] = shown.flatMap((row) =>
    row.archetypes.flatMap((archetype) =>
      archetype.detachments === null
        ? []
        : [{ ...archetype, faction: row.faction, detachments: archetype.detachments }],
    ),
  );
  const withoutDetachment = shown
    .flatMap((row) => row.archetypes)
    .filter((archetype) => archetype.detachments === null)
    .reduce((sum, archetype) => sum + archetype.players, 0);

  const sign = dir === 'asc' ? 1 : -1;
  const dimmed = (a: Archetype) => a.faction === null || a.players < minPlayers;
  const metric = (a: Archetype) =>
    sort === 'winRate' ? a.winRate : sort === 'x1' ? a.x1Share : a.players;
  const sorted = [...archetypes].sort(
    (a, b) =>
      Number(dimmed(a)) - Number(dimmed(b)) ||
      sign * (sort === 'faction' ? nameOf(a).localeCompare(nameOf(b)) : metric(a) - metric(b)) ||
      b.players - a.players ||
      nameOf(a).localeCompare(nameOf(b)),
  );

  const groups = grouped
    ? BANDS.map((band, index) => ({
        title: bandTitle(index, totalPlayers),
        archetypes: sorted.filter(
          (a) => a.share >= band.min && a.share < (BANDS[index - 1]?.min ?? Infinity),
        ),
      })).filter((group) => group.archetypes.length > 0)
    : [{ title: null, archetypes: sorted }];

  // First click: numbers high to low, names A→Z; second flips; third goes back to the default.
  const onSort = (key: MetaSort) => {
    const first: SortDir = key === 'faction' ? 'asc' : 'desc';
    if (key !== sort) onSortChange({ sort: key, dir: first });
    else if (dir === first) onSortChange({ sort: key, dir: first === 'asc' ? 'desc' : 'asc' });
    else onSortChange(null);
  };
  const state = { key: sort, dir };

  return (
    <Stack gap="sm">
      <Group gap="md" align="center" wrap="wrap">
        <MultiSelect
          aria-label="Factions"
          placeholder={factions.length === 0 ? 'All factions' : undefined}
          data={rows.map((row) => ({
            value: factionKey(row.faction),
            label: factionName(row.faction),
          }))}
          value={factions}
          onChange={onFactionsChange}
          searchable
          clearable
          w={{ base: '100%', xs: 320 }}
        />
        <Switch
          label="Group by popularity"
          checked={grouped}
          onChange={(event) => {
            onGroupedChange(event.currentTarget.checked);
          }}
        />
      </Group>
      <Table.ScrollContainer minWidth={tableMinWidth}>
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <SortableTh column="faction" sort={state} onSort={onSort}>
                Archetype
              </SortableTh>
              <SortableTh column="players" sort={state} onSort={onSort} ta="right">
                Players
              </SortableTh>
              <Table.Th ta="right" visibleFrom="sm">
                Share
              </Table.Th>
              <SortableTh column="winRate" sort={state} onSort={onSort} ta="right">
                Win rate
              </SortableTh>
              <SortableTh column="x1" sort={state} onSort={onSort} ta="right" visibleFrom="sm">
                X-1 or better
              </SortableTh>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {groups.map((group) => (
              <Fragment key={group.title ?? 'all'}>
                {group.title !== null && (
                  <Table.Tr>
                    <Table.Td colSpan={5} pt="md">
                      <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                        {group.title}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {group.archetypes.map((archetype) => {
                  const small = dimmed(archetype);
                  return (
                    <Table.Tr
                      key={nameOf(archetype)}
                      data-dimmed={small}
                      style={{ opacity: small ? 0.55 : 1 }}
                    >
                      <Table.Td>
                        <Text size="sm">{archetype.detachments.join(' + ')}</Text>
                        <Text size="xs" c="dimmed">
                          {factionName(archetype.faction)}
                        </Text>
                      </Table.Td>
                      <Figures
                        row={archetype}
                        label={nameOf(archetype)}
                        onOpen={() => {
                          onOpenPlayers({
                            faction: archetype.faction,
                            detachments: archetype.detachments,
                          });
                        }}
                      />
                    </Table.Tr>
                  );
                })}
              </Fragment>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {withoutDetachment > 0 && (
        <Text size="xs" c="dimmed">
          {plural(withoutDetachment, 'player')} without a known detachment in English aren’t shown.
        </Text>
      )}
    </Stack>
  );
}
