import type { ArchetypeRow, MetaRow } from '@bcp/shared';
import { Stack, Text } from '@mantine/core';
import { plural } from '../../lib/format';
import { Card, scoreboardClasses } from '../../components/Scoreboard';
import { type SortDir } from '../../lib/table-sort';
import classes from './MetaCards.module.css';
import { DispositionBreakdown } from './DispositionBreakdown';
import { changeOf, factionKey, factionName, Figures, type PlayersFilter } from './FactionTable';
import { DEFAULT_CHANGE_LABEL, type MetaSort } from './meta-queries';
import { FactionIcon } from '../../components/FactionIcon';

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
  onOpenPlayers,
}: ArchetypeTableProps) {
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
            : sort === 'overrep'
              ? (a.overrep ?? 0)
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

  return (
    <Stack gap="sm">
      <div role="list" aria-label="Archetypes" className={scoreboardClasses.group} data-dense>
        {sorted.map((archetype) => (
          <div role="listitem" key={nameOf(archetype)}>
            <Card dense data={{ dimmed: dimmed(archetype) }} className={classes.card}>
              {/* The faction's icon, big, beside the archetype's lines. */}
              <div className={classes.name}>
                <FactionIcon faction={archetype.faction} size={36} />
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600}>
                    {archetype.detachments.join(' + ')}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {factionName(archetype.faction)}
                  </Text>
                  <DispositionBreakdown archetype={archetype} />
                </div>
              </div>
              <Figures
                weeks={weeks}
                row={archetype}
                label={nameOf(archetype)}
                changeLabel={changeLabel}
                onOpen={() => {
                  onOpenPlayers({
                    faction: archetype.faction,
                    detachments: archetype.detachments,
                  });
                }}
              />
            </Card>
          </div>
        ))}
      </div>
      {withoutDetachment > 0 && (
        <Text size="xs" c="dimmed">
          {plural(withoutDetachment, 'player')} without a known detachment in English aren’t shown.
        </Text>
      )}
    </Stack>
  );
}
