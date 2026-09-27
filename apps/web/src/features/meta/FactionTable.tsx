import type { MetaRow } from '@bcp/shared';
import { ActionIcon, Table, Text, UnstyledButton } from '@mantine/core';
import { Fragment } from 'react';
import { percent, winRateTone, type MetaSort } from './meta-queries';

/** A row's players, for the drill-down: `detachments` undefined = the whole faction. */
export interface PlayersFilter {
  faction: string | null;
  detachments?: string[] | null;
}

export const factionKey = (faction: string | null) => faction ?? '(unknown)';
const factionName = (faction: string | null) => faction ?? 'Unknown faction';
const archetypeName = (detachments: string[] | null) =>
  detachments === null ? 'Detachment unknown' : detachments.join(' + ');

const TONE_COLOR = { good: 'green.5', bad: 'red.5', even: undefined } as const;

interface FactionTableProps {
  rows: MetaRow[];
  minPlayers: number;
  sort: MetaSort;
  expanded: string[];
  onSortChange: (sort: MetaSort) => void;
  onToggle: (key: string) => void;
  onOpenPlayers: (filter: PlayersFilter) => void;
}

function Figures({
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
      <Table.Td ta="right" className="numeric">
        {percent(row.share)}
      </Table.Td>
      <Table.Td ta="right">
        <Text size="sm" className="numeric" c={TONE_COLOR[tone]} data-tone={tone} component="span">
          {percent(row.winRate)}
        </Text>
      </Table.Td>
      <Table.Td ta="right" className="numeric">
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
  expanded,
  onSortChange,
  onToggle,
  onOpenPlayers,
}: FactionTableProps) {
  const dimmed = (row: MetaRow) => row.faction === null || row.players < minPlayers;
  const value = (row: MetaRow) =>
    sort === 'winRate' ? row.winRate : sort === 'x1' ? row.x1Share : row.players;
  const sorted = [...rows].sort(
    (a, b) =>
      Number(dimmed(a)) - Number(dimmed(b)) ||
      Number(a.faction === null) - Number(b.faction === null) ||
      value(b) - value(a) ||
      b.players - a.players ||
      factionName(a.faction).localeCompare(factionName(b.faction)),
  );
  const header = (label: string, key: MetaSort) => (
    <Table.Th ta="right">
      <UnstyledButton
        onClick={() => {
          onSortChange(key);
        }}
        fw={sort === key ? 700 : 500}
        fz="sm"
      >
        {label}
      </UnstyledButton>
    </Table.Th>
  );

  return (
    <Table.ScrollContainer minWidth={560}>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Faction</Table.Th>
            {header('Players', 'players')}
            <Table.Th ta="right">Share</Table.Th>
            {header('Win rate', 'winRate')}
            {header('X-1 or better', 'x1')}
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
                  row.archetypes.map((archetype) => {
                    const label = archetypeName(archetype.detachments);
                    return (
                      <Table.Tr
                        key={`${key}:${label}`}
                        style={{ opacity: archetype.players < minPlayers ? 0.55 : 1 }}
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
