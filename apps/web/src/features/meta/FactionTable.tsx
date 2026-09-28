import type { MetaRow } from '@bcp/shared';
import { ActionIcon, Table, Text, UnstyledButton, useMatches } from '@mantine/core';
import { Fragment } from 'react';
import { SortableTh, type SortDir } from '../../lib/table-sort';
import { percent, sharePercent, winRateTone, type MetaSort } from './meta-queries';

/** A row's players, for the drill-down: `detachments` undefined = the whole faction. */
export interface PlayersFilter {
  faction: string | null;
  detachments?: string[] | null;
}

export const factionKey = (faction: string | null) => faction ?? '(unknown)';
export const factionName = (faction: string | null) => faction ?? 'Unknown faction';
/** Players whose list names no detachment, or one that isn't English (Meta can't tell those apart). */
export const UNKNOWN_DETACHMENT = 'Detachment unknown or not in English';
const archetypeName = (detachments: string[] | null) =>
  detachments === null ? UNKNOWN_DETACHMENT : detachments.join(' + ');

const TONE_COLOR = { good: 'green.5', bad: 'red.5', even: undefined } as const;

interface FactionTableProps {
  rows: MetaRow[];
  minPlayers: number;
  sort: MetaSort;
  dir: SortDir;
  expanded: string[];
  /** The next sort; null = back to the default. */
  onSortChange: (next: { sort: MetaSort; dir: SortDir } | null) => void;
  onToggle: (key: string) => void;
  onOpenPlayers: (filter: PlayersFilter) => void;
}

export function Figures({
  row,
  label,
  onOpen,
}: {
  row: Pick<MetaRow, 'players' | 'share' | 'winRate' | 'x1' | 'x1Share'>;
  label: string;
  onOpen: () => void;
}) {
  const tone = winRateTone(row.winRate);
  return (
    <>
      <Table.Td ta="right">
        <UnstyledButton
          className="numeric"
          onClick={onOpen}
          aria-label={`${row.players} ${label} players`}
        >
          <Text size="sm" td="underline" component="span">
            {row.players}
          </Text>
        </UnstyledButton>
      </Table.Td>
      <Table.Td ta="right" className="numeric" visibleFrom="sm">
        {sharePercent(row.share)}
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" className="numeric" c={TONE_COLOR[tone]} data-tone={tone} component="span">
          {percent(row.winRate)}
        </Text>
      </Table.Td>
      <Table.Td ta="right" className="numeric" visibleFrom="sm">
        {`${row.x1} · ${percent(row.x1Share)}`}
      </Table.Td>
    </>
  );
}

/**
 * Factions by popularity (or win rate / X-1), each expandable into its archetypes. Rows under the
 * minimum players, and the Unknown faction, are dimmed and sorted last.
 */
export function FactionTable({
  rows,
  minPlayers,
  sort,
  dir,
  expanded,
  onSortChange,
  onToggle,
  onOpenPlayers,
}: FactionTableProps) {
  // Phones drop Share and X-1 (see the cells), so the rest fits without scrolling.
  const tableMinWidth = useMatches({ base: 0, sm: 560 });
  const sign = dir === 'asc' ? 1 : -1;
  const dimmed = (row: MetaRow) => row.faction === null || row.players < minPlayers;
  const metric = (row: Pick<MetaRow, 'players' | 'winRate' | 'x1Share'>) =>
    sort === 'winRate' ? row.winRate : sort === 'x1' ? row.x1Share : row.players;
  const byName = (a: MetaRow, b: MetaRow) =>
    factionName(a.faction).localeCompare(factionName(b.faction));
  const sorted = [...rows].sort(
    (a, b) =>
      Number(dimmed(a)) - Number(dimmed(b)) ||
      Number(a.faction === null) - Number(b.faction === null) ||
      sign * (sort === 'faction' ? byName(a, b) : metric(a) - metric(b)) ||
      b.players - a.players ||
      byName(a, b),
  );
  // Detachment rows follow the same rules: the chosen column, small ones and "unknown" last.
  const sortArchetypes = (archetypes: MetaRow['archetypes']) =>
    [...archetypes].sort((a, b) => {
      const small = (x: typeof a) => x.players < minPlayers;
      return (
        Number(a.detachments === null) - Number(b.detachments === null) ||
        Number(small(a)) - Number(small(b)) ||
        sign *
          (sort === 'faction'
            ? archetypeName(a.detachments).localeCompare(archetypeName(b.detachments))
            : metric(a) - metric(b)) ||
        b.players - a.players
      );
    });
  // First click: numbers high to low, names A→Z; second flips; third goes back to the default.
  const onSort = (key: MetaSort) => {
    const first: SortDir = key === 'faction' ? 'asc' : 'desc';
    if (key !== sort) onSortChange({ sort: key, dir: first });
    else if (dir === first) onSortChange({ sort: key, dir: first === 'asc' ? 'desc' : 'asc' });
    else onSortChange(null);
  };
  const state = { key: sort, dir };

  return (
    <Table.ScrollContainer minWidth={tableMinWidth}>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <SortableTh column="faction" sort={state} onSort={onSort}>
              Faction
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
          {sorted.map((row) => {
            const key = factionKey(row.faction);
            const name = factionName(row.faction);
            const open = expanded.includes(key);
            return (
              <Fragment key={key}>
                <Table.Tr data-dimmed={dimmed(row)} style={{ opacity: dimmed(row) ? 0.55 : 1 }}>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      mr={6}
                      aria-label={`Show ${name} detachments`}
                      aria-expanded={open}
                      onClick={() => {
                        onToggle(key);
                      }}
                    >
                      {open ? '▾' : '▸'}
                    </ActionIcon>
                    {name}
                  </Table.Td>
                  <Figures
                    row={row}
                    label={name}
                    onOpen={() => {
                      onOpenPlayers({ faction: row.faction });
                    }}
                  />
                </Table.Tr>
                {open &&
                  sortArchetypes(row.archetypes).map((archetype) => {
                    const label = archetypeName(archetype.detachments);
                    const small = archetype.players < minPlayers;
                    return (
                      <Table.Tr
                        key={`${key}:${label}`}
                        data-dimmed={small}
                        style={{ opacity: small ? 0.55 : 1 }}
                      >
                        <Table.Td pl={40}>
                          <Text size="sm" c="dimmed" component="span">
                            {label}
                          </Text>
                        </Table.Td>
                        <Figures
                          row={archetype}
                          label={`${name} · ${label}`}
                          onOpen={() => {
                            onOpenPlayers({
                              faction: row.faction,
                              detachments: archetype.detachments,
                            });
                          }}
                        />
                      </Table.Tr>
                    );
                  })}
              </Fragment>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
