import type { TeamMetaRow } from '@bcp/shared';
import { ActionIcon, Group, Select, Stack, Text } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import { Card, scoreboardClasses } from '../../components/Scoreboard';
import { plural } from '../../lib/format';
import { sortRows, type SortDir, type SortValue } from '../../lib/table-sort';
import classes from './MetaCards.module.css';
import { factionKey, UNKNOWN_DETACHMENT } from './FactionTable';
import { percent } from './meta-queries';
import { FactionIcon } from '../../components/FactionIcon';

/** Percentage points to one decimal; a difference that rounds to 0 is neutral. */
function difference(value: number): { text: string; tone: 'good' | 'bad' | 'even' } {
  const points = Math.round(value * 1000) / 10;
  if (points === 0) return { text: '0.0 pp', tone: 'even' };
  return points > 0
    ? { text: `+${points.toFixed(1)} pp`, tone: 'good' }
    : { text: `−${Math.abs(points).toFixed(1)} pp`, tone: 'bad' };
}
// Blue and orange, like the Matchups colours: apart for colour-blind readers too.
const TONE_COLOR = { good: 'blue.4', bad: 'orange.5', even: undefined } as const;

/** A row's team figures as a strip: slots in top teams, their share there and overall, the gap. */
function Slots({ row }: { row: Omit<TeamMetaRow, 'faction' | 'archetypes'> }) {
  const gap = difference(row.difference);
  const figure = (label: string, value: ReactNode) => (
    <div className={classes.figure}>
      <span className={classes.figureValue}>{value}</span>
      <span className={classes.figureLabel}>{label}</span>
    </div>
  );
  return (
    <div className={classes.figures}>
      {figure('in top teams', <span className="numeric">{row.topSlots}</span>)}
      {figure('top share', <span className="numeric">{percent(row.topShare)}</span>)}
      {figure('all teams', <span className="numeric">{percent(row.allShare)}</span>)}
      {figure(
        'difference',
        <Text
          size="sm"
          component="span"
          className="numeric"
          c={TONE_COLOR[gap.tone]}
          data-tone={gap.tone}
        >
          {gap.text}
        </Text>,
      )}
    </div>
  );
}

const TEAM_META_SORT = {
  faction: (row) => row.faction,
  topSlots: (row) => row.topSlots,
  topShare: (row) => row.topShare,
  allShare: (row) => row.allShare,
  difference: (row) => row.difference,
} satisfies Record<string, SortValue<TeamMetaRow>>;

/** The orders on offer: as the server ranks them, or by a figure (high first) or name. */
const TEAM_META_SORTS: {
  value: 'given' | keyof typeof TEAM_META_SORT;
  label: string;
  dir: SortDir;
}[] = [
  { value: 'given', label: 'Most over-represented', dir: 'desc' },
  { value: 'difference', label: 'Difference', dir: 'desc' },
  { value: 'topSlots', label: 'In top teams', dir: 'desc' },
  { value: 'topShare', label: 'Top share', dir: 'desc' },
  { value: 'allShare', label: 'All teams', dir: 'desc' },
  { value: 'faction', label: 'Faction A–Z', dir: 'asc' },
];

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
  const [sortKey, setSortKey] = useState<(typeof TEAM_META_SORTS)[number]['value']>('given');
  const dimmed = (row: TeamMetaRow) => row.faction === null || row.allSlots < minPlayers;
  const bySort =
    sortKey === 'given'
      ? rows
      : sortRows(
          rows,
          TEAM_META_SORT[sortKey],
          TEAM_META_SORTS.find((option) => option.value === sortKey)?.dir ?? 'desc',
        );
  // Whatever the order, small factions and the Unknown one stay last.
  const sorted = [...bySort].sort((a, b) => Number(dimmed(a)) - Number(dimmed(b)));
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Text size="sm" c="dimmed">
          Based on {plural(eventsCounted, 'team event')} with final placings; top teams are each
          event’s top quarter.
        </Text>
        <Select
          aria-label="Sort top teams by"
          data={TEAM_META_SORTS.map(({ value, label }) => ({ value, label }))}
          value={sortKey}
          onChange={(value) => {
            const next = TEAM_META_SORTS.find((option) => option.value === value);
            if (next) setSortKey(next.value);
          }}
          allowDeselect={false}
          size="xs"
          w={190}
        />
      </Group>
      <div
        role="list"
        aria-label="Top team factions"
        className={scoreboardClasses.group}
        data-dense
      >
        {sorted.map((row) => {
          const key = factionKey(row.faction);
          const name = row.faction ?? 'Unknown faction';
          const expanded = open.includes(key);
          return (
            <div role="listitem" key={key}>
              <Card dense data={{ dimmed: dimmed(row) }} className={classes.card}>
                <div className={classes.name}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`Show ${name} detachments in teams`}
                    aria-expanded={expanded}
                    onClick={() => {
                      setOpen(expanded ? open.filter((k) => k !== key) : [...open, key]);
                    }}
                  >
                    {expanded ? '▾' : '▸'}
                  </ActionIcon>
                  <FactionIcon faction={row.faction} size={28} />
                  <Text size="sm" fw={600}>
                    {name}
                  </Text>
                </div>
                <Slots row={row} />
              </Card>
              {expanded && (
                <div className={classes.nested}>
                  {[...row.archetypes]
                    .sort(
                      (a, b) => Number(a.allSlots < minPlayers) - Number(b.allSlots < minPlayers),
                    )
                    .map((archetype) => {
                      const label =
                        archetype.detachments === null
                          ? UNKNOWN_DETACHMENT
                          : archetype.detachments.join(' + ');
                      const small = archetype.allSlots < minPlayers;
                      return (
                        <Card
                          dense
                          key={`${key}:${label}`}
                          data={{ dimmed: small }}
                          className={classes.card}
                        >
                          <div className={classes.name}>
                            <Text size="sm" c="dimmed">
                              {label}
                            </Text>
                          </div>
                          <Slots row={archetype} />
                        </Card>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Stack>
  );
}
