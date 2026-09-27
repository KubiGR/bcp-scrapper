import type { TeamMetaRow } from '@bcp/shared';
import { ActionIcon, Table, Text } from '@mantine/core';
import { Fragment, useState } from 'react';
import { plural } from '../../lib/format';
import { factionKey } from './FactionTable';
import { percent } from './meta-queries';

const difference = (value: number) =>
  `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(1)} pp`;

function Slots({ row }: { row: Omit<TeamMetaRow, 'faction' | 'archetypes'> }) {
  return (
    <>
      <Table.Td ta="right" className="numeric">
        {row.topSlots}
      </Table.Td>
      <Table.Td ta="right" className="numeric">
        {percent(row.topShare)}
      </Table.Td>
      <Table.Td ta="right" className="numeric">
        {percent(row.allShare)}
      </Table.Td>
      <Table.Td ta="right">
        <Text
          size="sm"
          component="span"
          className="numeric"
          c={row.difference > 0 ? 'green.5' : row.difference < 0 ? 'red.5' : undefined}
        >
          {difference(row.difference)}
        </Text>
      </Table.Td>
    </>
  );
}

/** Which factions (and archetypes) top-25 % teams field more often than teams overall. */
export function TeamMeta({
  rows,
  eventsCounted,
  minPlayers,
}: {
  rows: TeamMetaRow[];
  eventsCounted: number;
  minPlayers: number;
}) {
  const [open, setOpen] = useState<string[]>([]);
  const dimmed = (row: TeamMetaRow) => row.faction === null || row.allSlots < minPlayers;
  const sorted = [...rows].sort((a, b) => Number(dimmed(a)) - Number(dimmed(b)));
  return (
    <>
      <Text size="sm" c="dimmed" mb="xs">
        Based on {plural(eventsCounted, 'team event')} with final placings; top teams are each
        event’s top quarter.
      </Text>
      <Table.ScrollContainer minWidth={560}>
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Faction</Table.Th>
              <Table.Th ta="right">In top teams</Table.Th>
              <Table.Th ta="right">Top share</Table.Th>
              <Table.Th ta="right">All teams</Table.Th>
              <Table.Th ta="right">Difference</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((row) => {
              const key = factionKey(row.faction);
              const name = row.faction ?? 'Unknown faction';
              const expanded = open.includes(key);
              return (
                <Fragment key={key}>
                  <Table.Tr style={{ opacity: dimmed(row) ? 0.55 : 1 }}>
                    <Table.Td>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        mr={6}
                        aria-label={`Show ${name} detachments in teams`}
                        aria-expanded={expanded}
                        onClick={() => {
                          setOpen(expanded ? open.filter((k) => k !== key) : [...open, key]);
                        }}
                      >
                        {expanded ? '▾' : '▸'}
                      </ActionIcon>
                      {name}
                    </Table.Td>
                    <Slots row={row} />
                  </Table.Tr>
                  {expanded &&
                    row.archetypes.map((archetype) => {
                      const label =
                        archetype.detachments === null
                          ? 'Detachment unknown'
                          : archetype.detachments.join(' + ');
                      return (
                        <Table.Tr key={`${key}:${label}`}>
                          <Table.Td pl={40}>
                            <Text size="sm" c="dimmed" component="span">
                              {label}
                            </Text>
                          </Table.Td>
                          <Slots row={archetype} />
                        </Table.Tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </>
  );
}
