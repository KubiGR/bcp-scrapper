import type { ArchetypeRow, MetaRow } from '@bcp/shared';
import { MultiSelect, Stack, Table, Text, useMatches } from '@mantine/core';
import { plural } from '../../lib/format';
import { SortableTh, type SortDir } from '../../lib/table-sort';
import { DispositionBreakdown } from './DispositionBreakdown';
import { changeOf, factionKey, factionName, Figures, type PlayersFilter } from './FactionTable';
import { DEFAULT_CHANGE_LABEL, type MetaSort } from './meta-queries';

/** One archetype with its faction: a row of the flat table. */
interface Archetype extends ArchetypeRow {
  faction: string | null;
  detachments: string[];
}

interface ArchetypeTableProps {
  rows: MetaRow[];
  /** What Change compares, for its header's tooltip (default: the last 30 days vs the 30 before). */
  changeLabel?: string;
  /** The weeks each row's trend follows. */
  weeks: string[];
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

const nameOf = (archetype: Archetype) =>
  `${factionName(archetype.faction)} · ${archetype.detachments.join(' + ')}`;

/**
 * Every faction + detachments combination in one table (the Meta page's default view): players,
 * share of all players, win rate, reliable win rate (allowing for sample size) and X-1. Archetypes under the minimum players, and the Unknown
 * faction's, are dimmed and sorted last; players without a known detachment in English can't be shown.
 */
export function ArchetypeTable({
  changeLabel = DEFAULT_CHANGE_LABEL,
  rows,
  weeks,
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
    sort === 'winRate'
      ? a.winRate
      : sort === 'reliable'
        ? a.reliableWinRate
        : sort === 'change'
          ? (changeOf(a) ?? 0)
          : sort === 'x1'
            ? a.x1Share
            : a.players;
  const sorted = [...archetypes].sort(
    (a, b) =>
      Number(dimmed(a)) - Number(dimmed(b)) ||
      // Sorting by change, archetypes without one (too few games) go last either way.
      (sort === 'change' ? Number(changeOf(a) === null) - Number(changeOf(b) === null) : 0) ||
      sign * (sort === 'faction' ? nameOf(a).localeCompare(nameOf(b)) : metric(a) - metric(b)) ||
      b.players - a.players ||
      nameOf(a).localeCompare(nameOf(b)),
  );

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
              <Table.Th ta="right" visibleFrom="sm">
                Trend
              </Table.Th>
              <SortableTh column="winRate" sort={state} onSort={onSort} ta="right">
                Win rate
              </SortableTh>
              <SortableTh
                column="reliable"
                sort={state}
                onSort={onSort}
                ta="right"
                title="The win rate allowing for how many games there are: the low end of its 95% range. Few games pull it down."
              >
                Reliable
              </SortableTh>
              <SortableTh
                column="change"
                sort={state}
                onSort={onSort}
                ta="right"
                visibleFrom="sm"
                title={changeLabel}
              >
                Change
              </SortableTh>
              <SortableTh column="x1" sort={state} onSort={onSort} ta="right" visibleFrom="sm">
                X-1 or better
              </SortableTh>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((archetype) => {
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
                    <DispositionBreakdown archetype={archetype} />
                  </Table.Td>
                  <Figures
                    weeks={weeks}
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
