import type { MetaRow } from '@bcp/shared';
import { Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { AnchorLink } from '../../components/AnchorLink';
import { Panel } from '../../components/Panel';
import { plural } from '../../lib/format';
import { ChangeText } from './FactionTable';
import { movementOf, podiumOf, tierOf, tierPercent } from './faction-tiers';
import classes from './FactionsPage.module.css';
import { DEFAULT_MIN_PLAYERS, sharePercent, type MetaSearch } from './meta-queries';
import { FactionIcon } from '../../components/FactionIcon';

type KnownRow = MetaRow & { faction: string };
type MetaFilters = Pick<MetaSearch, 'from' | 'to' | 'type'>;

function FactionLink({ row, filters }: { row: KnownRow; filters: MetaFilters }) {
  return (
    <AnchorLink to="/analysis/meta" search={{ ...filters, factions: row.faction }}>
      <FactionIcon faction={row.faction} size={28} />
      {row.faction}
    </AnchorLink>
  );
}

/** The three best win rates, each with its tier, size and change. */
export function Podium({ rows, filters }: { rows: KnownRow[]; filters: MetaFilters }) {
  const podium = podiumOf(rows, DEFAULT_MIN_PLAYERS);
  if (podium.length === 0) return null;
  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm" aria-label="Podium" component="section">
      {podium.map((row, index) => {
        const tier = tierOf(row.winRate);
        return (
          <div
            key={row.faction}
            className={classes.podium}
            data-place={index + 1}
            data-tier={tier.key}
            data-podium={row.faction}
          >
            <Text className={`numeric ${classes.place}`} component="span">
              {`#${String(index + 1)}`}
            </Text>
            <Stack gap={2} className={classes.podiumName}>
              <Text fw={700} size="lg" className={classes.link} component="span">
                <FactionLink row={row} filters={filters} />
              </Text>
              <Text size="xs" c="dimmed" className="numeric" component="span">
                <span className={classes.tierLetter}>{tier.key}</span>
                {` · ${plural(row.players, 'player')} · ${sharePercent(row.share)} share`}
              </Text>
            </Stack>
            <Stack gap={0} align="flex-end" className={classes.podiumFigures}>
              <Text fw={700} className={`numeric ${classes.podiumRate}`} component="span">
                {tierPercent(row.winRate)}
              </Text>
              <ChangeText change={row.change} />
            </Stack>
          </div>
        );
      })}
    </SimpleGrid>
  );
}

function MoveList({
  title,
  arrow,
  rows,
  filters,
}: {
  title: string;
  arrow: string;
  rows: KnownRow[];
  filters: MetaFilters;
}) {
  return (
    <Stack gap="xs" aria-label={title} component="section">
      <Text size="xs" c="dimmed" className={classes.moveTitle}>
        <span aria-hidden>{arrow}</span> {title}
      </Text>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          None
        </Text>
      ) : (
        rows.map((row) => (
          <Group key={row.faction} justify="space-between" wrap="nowrap" data-move={row.faction}>
            <Text size="sm" className={classes.link} component="span">
              <FactionLink row={row} filters={filters} />
            </Text>
            <ChangeText change={row.change} />
          </Group>
        ))
      )}
    </Stack>
  );
}

/** The biggest risers and fallers in win rate between the two compared spans. */
export function Movement({
  rows,
  filters,
  label,
}: {
  rows: KnownRow[];
  filters: MetaFilters;
  /** What the change compares, e.g. "June dataslate vs March dataslate". */
  label: string;
}) {
  const { risers, fallers } = movementOf(rows, DEFAULT_MIN_PLAYERS);
  return (
    <Panel>
      <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
        <Text fw={700} size="sm">
          Movement
        </Text>
        <Text size="xs" c="dimmed">
          {label}
        </Text>
      </Group>
      {risers.length === 0 && fallers.length === 0 ? (
        <Text size="sm" c="dimmed">
          Not enough games in both spans to compare.
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xl" className={classes.moves}>
          <MoveList title="Risers" arrow="▲" rows={risers} filters={filters} />
          <MoveList title="Fallers" arrow="▼" rows={fallers} filters={filters} />
        </SimpleGrid>
      )}
    </Panel>
  );
}
