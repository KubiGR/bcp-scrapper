import type { ReactNode } from 'react';
import { plural } from '../lib/format';
import classes from './EventSymbols.module.css';

export type SizeTier = 'small' | 'medium' | 'large' | 'major';

/** How big an event is, in steps that match the rankings (a 100-player event scores 100). */
export function sizeTier(playerCount: number): SizeTier {
  if (playerCount >= 200) return 'major';
  if (playerCount >= 100) return 'large';
  if (playerCount >= 50) return 'medium';
  return 'small';
}

const WEEK_MS = 7 * 24 * 60 * 60_000;

/** Whether an event started in the last week (not one still to come). */
export function playedLately(startDate: string, now = Date.now()): boolean {
  const ago = now - new Date(startDate).getTime();
  return ago >= 0 && ago < WEEK_MS;
}

const NAMES: Record<SizeTier, string> = {
  small: 'Small event',
  medium: 'Medium event',
  large: 'Large event',
  major: 'Major event',
};

/** "Major event", "Small event": a size tier in words. */
export const sizeName = (tier: SizeTier): string => NAMES[tier];

/**
 * An event's player count, hotter in colour the bigger the event (yellow, orange, red); plain for a
 * small one. Its size in words on hover. Shows "432 players" unless given its own text.
 */
export function HotCount({ playerCount, children }: { playerCount: number; children?: ReactNode }) {
  const tier = sizeTier(playerCount);
  return (
    <span className={classes.hot} data-size={tier} title={NAMES[tier]}>
      {children ?? plural(playerCount, 'player')}
    </span>
  );
}

/** A green leaf: the event started in the last week. */
export function NewLeaf() {
  return (
    <span role="img" aria-label="New this week" title="New this week" className={classes.leaf}>
      <svg
        viewBox="0 0 24 24"
        width={14}
        height={14}
        aria-hidden
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      >
        <path d="M4.5 19.5C4.5 10 10 4.5 20 4.5c0 10-5.5 15-14 15z" />
        <path d="M4.5 19.5 13 11" fill="none" stroke="var(--mantine-color-body)" />
      </svg>
    </span>
  );
}

/** An event's name with the leaf when it's new, the leaf kept on the line of the last word. */
export function NameWithLeaf({ name, startDate }: { name: string; startDate: string }) {
  if (!playedLately(startDate)) return name;
  const cut = name.lastIndexOf(' ') + 1;
  return (
    <>
      {name.slice(0, cut)}
      <span className={classes.together}>
        {name.slice(cut)}
        <NewLeaf />
      </span>
    </>
  );
}
