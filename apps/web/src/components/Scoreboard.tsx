import { Title, VisuallyHidden, type TitleOrder } from '@mantine/core';
import type { MouseEvent, ReactNode } from 'react';
import classes from './Scoreboard.module.css';

export { classes as scoreboardClasses };

interface SidebarLayoutProps {
  /** What the sidebar holds, e.g. "Filters"; names it for screen readers. */
  sidebarLabel: string;
  sidebar: ReactNode;
  children: ReactNode;
}

/** The Scoreboard layout: a sidebar (filters, totals, actions) beside the page's content. */
export function SidebarLayout({ sidebarLabel, sidebar, children }: SidebarLayoutProps) {
  return (
    <div className={classes.layout}>
      <aside aria-label={sidebarLabel} className={classes.sidebar}>
        {sidebar}
      </aside>
      <div className={classes.main}>{children}</div>
    </div>
  );
}

/**
 * A page's title, for screen readers only: the menu already shows which page is open, so the
 * space goes to the content.
 */
export function PageTitle({ children, order = 1 }: { children: ReactNode; order?: TitleOrder }) {
  return (
    <VisuallyHidden>
      <Title order={order}>{children}</Title>
    </VisuallyHidden>
  );
}

/** A page's title row: the title and its line on the left, controls (a sort) on the right. */
export function PageHeading({ children, controls }: { children: ReactNode; controls?: ReactNode }) {
  return (
    <div className={classes.pageHeading}>
      <div>{children}</div>
      {controls}
    </div>
  );
}

interface CardGroupProps {
  /** The group's key, shown big: "4-1-0", "Nov 14–15", "Tier 1". */
  label: ReactNode;
  /** What the key means, after it: "One loss · 6 players". */
  description?: ReactNode;
  /** Names the group for screen readers; defaults to the label when that's text. */
  ariaLabel?: string;
  /** Cards closer together, for long lists. */
  dense?: boolean;
  children: ReactNode;
}

/** A run of cards under a big heading. */
export function CardGroup({ label, description, ariaLabel, dense, children }: CardGroupProps) {
  return (
    <section
      className={classes.group}
      data-dense={dense === true ? true : undefined}
      aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
    >
      <h2 className={classes.groupHeading}>
        <span className={classes.groupKey}>{label}</span>
        {description !== undefined && <span className={classes.groupLabel}>{description}</span>}
      </h2>
      {children}
    </section>
  );
}

interface CardProps {
  /** Clicking anywhere on the card but its links and buttons; none, not clickable. */
  onOpen?: () => void;
  className?: string;
  /** Less padding and smaller figures, for long lists. */
  dense?: boolean;
  /** Data attributes for the card (`data-faction`, `data-dimmed`), for styling and tests. */
  data?: Record<string, string | number | boolean | undefined>;
  children: ReactNode;
}

/** One item's card; with `onOpen`, the whole card opens it. */
export function Card({ onOpen, className, dense, data = {}, children }: CardProps) {
  const attributes = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [`data-${key}`, value]),
  );
  const open =
    onOpen === undefined
      ? undefined
      : (e: MouseEvent) => {
          // Links, buttons and form controls on the card do their own thing.
          if (e.target instanceof Element && e.target.closest('a, button, input, label')) return;
          onOpen();
        };
  return (
    <article
      {...attributes}
      className={className === undefined ? classes.card : `${classes.card} ${className}`}
      data-clickable={onOpen === undefined ? undefined : true}
      data-dense={dense === true ? true : undefined}
      onClick={open}
    >
      {children}
    </article>
  );
}

/** A figure with its label under it: "1543" over "field Elo". */
export function Stat({
  value,
  label,
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  className?: string;
}) {
  return (
    <div className={className === undefined ? classes.stat : `${classes.stat} ${className}`}>
      <span className={classes.statValue}>{value}</span>
      <span className={classes.statLabel}>{label}</span>
    </div>
  );
}

/** A row of stat tiles under a page's title. */
export function StatTiles({ items }: { items: { value: ReactNode; label: string }[] }) {
  return (
    <div className={classes.tiles}>
      {items.map((item) => (
        <Stat key={item.label} value={item.value} label={item.label} className={classes.tile} />
      ))}
    </div>
  );
}
