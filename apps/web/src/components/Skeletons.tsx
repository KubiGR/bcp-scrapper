import { Group, Skeleton, Stack, VisuallyHidden } from '@mantine/core';
import type { ReactNode } from 'react';
import { Panel } from './Panel';
import { scoreboardClasses as classes } from './Scoreboard';
import skeletonClasses from './Skeletons.module.css';

/*
 * Placeholders shaped like what is loading (cards under a group heading, stat tiles, a panel's
 * lines, a matrix), in the same boxes, so the page doesn't jump when the data arrives.
 */

/** Widths that vary from one row to the next, so a list of placeholders doesn't look stamped. */
const WIDTHS = ['62%', '48%', '71%', '55%', '66%', '44%'];
const widthAt = (i: number) => WIDTHS[i % WIDTHS.length] ?? '60%';

/** Announces what is loading to screen readers; the placeholders themselves are hidden. */
export function Loading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true">
      <VisuallyHidden>{label}</VisuallyHidden>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** One card: an icon, a name over a line of details, and a figure on the right. */
export function CardSkeleton({ index = 0, dense = false }: { index?: number; dense?: boolean }) {
  return (
    <div className={classes.card} data-dense={dense ? true : undefined}>
      <Skeleton circle height={dense ? 22 : 28} />
      <Stack gap={6} className={skeletonClasses.grow}>
        <Skeleton height={dense ? 12 : 14} width={widthAt(index)} />
        <Skeleton height={dense ? 9 : 10} width={widthAt(index + 3)} />
      </Stack>
      <Stack gap={4} align="flex-end">
        <Skeleton height={dense ? 14 : 18} width={44} />
        <Skeleton height={8} width={36} />
      </Stack>
    </div>
  );
}

interface CardGroupsSkeletonProps {
  /** Groups of cards, each under a heading; 0 for one list without headings. */
  groups?: number;
  /** Cards in each group. */
  cards?: number;
  dense?: boolean;
}

/**
 * Groups of cards under headings (or one list without, for 0 groups). Not announced: inside a
 * `Loading` with other placeholders.
 */
export function CardGroupsSkeleton({
  groups = 2,
  cards = 3,
  dense = false,
}: CardGroupsSkeletonProps) {
  const list = (offset: number) =>
    Array.from({ length: cards }, (_, i) => (
      <CardSkeleton key={i} index={offset + i} dense={dense} />
    ));
  if (groups === 0) {
    return (
      <div className={classes.group} data-dense={dense ? true : undefined}>
        {list(0)}
      </div>
    );
  }
  return (
    <Stack gap="lg">
      {Array.from({ length: groups }, (_, g) => (
        <div key={g} className={classes.group} data-dense={dense ? true : undefined}>
          <Group gap="md" align="flex-end" className={classes.groupHeading}>
            <Skeleton height={26} width={84} />
            <Skeleton height={10} width={110} />
          </Group>
          {list(g * cards)}
        </div>
      ))}
    </Stack>
  );
}

/** Cards grouped under big headings, as the card pages show them. */
export function CardsSkeleton({ label, ...groups }: CardGroupsSkeletonProps & { label: string }) {
  return (
    <Loading label={label}>
      <CardGroupsSkeleton {...groups} />
    </Loading>
  );
}

/** A page's heading: its name, big, over a line of details. */
export function TitleSkeleton() {
  return (
    <Stack gap={8}>
      <Skeleton height={28} width="45%" />
      <Skeleton height={12} width="30%" />
    </Stack>
  );
}

/** A row of stat tiles. */
export function TilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={classes.tiles}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${classes.stat} ${classes.tile}`}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={8} width="45%" mt={4} />
        </div>
      ))}
    </div>
  );
}

/** Lines of text, for a panel's content. */
export function LinesSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Stack gap={10}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? '40%' : widthAt(i + 1)} />
      ))}
    </Stack>
  );
}

/** A panel's lines, announced as loading: for a settings card's content. */
export function PanelSkeleton({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <Loading label={label}>
      <LinesSkeleton lines={lines} />
    </Loading>
  );
}

interface MatrixSkeletonProps {
  label: string;
  rows?: number;
  columns?: number;
}

/** A grid of cells under a header row, beside a column of row names: the matchups matrix. */
export function MatrixSkeleton({ label, rows = 8, columns = 8 }: MatrixSkeletonProps) {
  return (
    <Loading label={label}>
      <div
        className={skeletonClasses.matrix}
        style={{ gridTemplateColumns: `minmax(120px, 180px) repeat(${String(columns)}, 1fr)` }}
      >
        {Array.from({ length: (rows + 1) * (columns + 1) }, (_, i) => {
          const row = Math.floor(i / (columns + 1));
          const column = i % (columns + 1);
          if (row === 0 && column === 0) return <span key={i} />;
          if (column === 0) return <Skeleton key={i} height={12} width={widthAt(row)} my="auto" />;
          if (row === 0) return <Skeleton key={i} circle height={22} mx="auto" />;
          return (
            <div key={i} className={skeletonClasses.cell}>
              <Skeleton height={28} radius="sm" />
            </div>
          );
        })}
      </div>
    </Loading>
  );
}

/**
 * A Scoreboard page: a sidebar of filters beside groups of cards, under `header` (a title and
 * stat tiles) when given.
 */
export function PageSkeleton({ label, header }: { label: string; header?: ReactNode }) {
  return (
    <Loading label={label}>
      {header !== undefined && (
        <Stack gap="lg" mb="lg">
          {header}
        </Stack>
      )}
      <div className={classes.layout}>
        <div className={classes.sidebar}>
          <Panel>
            <Stack gap="md">
              {Array.from({ length: 3 }, (_, i) => (
                <Stack key={i} gap={6}>
                  <Skeleton height={9} width="35%" />
                  <Skeleton height={32} />
                </Stack>
              ))}
            </Stack>
          </Panel>
        </div>
        <div className={classes.main}>
          <CardGroupsSkeleton />
        </div>
      </div>
    </Loading>
  );
}
