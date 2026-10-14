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

const FLAMES: Record<SizeTier, number> = { small: 0, medium: 1, large: 2, major: 3 };
const NAMES: Record<SizeTier, string> = {
  small: 'Small event',
  medium: 'Medium event',
  large: 'Large event',
  major: 'Major event',
};

function Flame() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden fill="currentColor">
      <path d="M12 2c.6 3.2 3.4 4.9 4.9 7.6A6 6 0 1 1 6.4 14c0-2.3 1.2-4 2.6-5.2-.1 1.9.7 3.2 1.9 3.6C10.3 8.7 10.6 5 12 2z" />
    </svg>
  );
}

/**
 * Flames for an event's size: none for a small one, up to three, hotter the bigger it is. After
 * the text, or `before` it (in a column aligned right).
 */
export function EventHeat({
  playerCount,
  before = false,
}: {
  playerCount: number;
  before?: boolean;
}) {
  const tier = sizeTier(playerCount);
  if (FLAMES[tier] === 0) return null;
  return (
    <span
      role="img"
      aria-label={NAMES[tier]}
      title={NAMES[tier]}
      className={classes.heat}
      data-tier={tier}
      data-before={before || undefined}
    >
      {Array.from({ length: FLAMES[tier] }, (_, i) => (
        <Flame key={i} />
      ))}
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
