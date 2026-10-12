import classes from './SizeBadge.module.css';

export type SizeTier = 'small' | 'medium' | 'large' | 'major';

/** How big an event is, in steps that match the rankings (a 100-player event scores 100). */
export function sizeTier(playerCount: number): SizeTier {
  if (playerCount >= 200) return 'major';
  if (playerCount >= 100) return 'large';
  if (playerCount >= 50) return 'medium';
  return 'small';
}

/** "432 players", standing out more the bigger the event. */
export function SizeBadge({ playerCount }: { playerCount: number }) {
  return (
    <span className={classes.badge} data-tier={sizeTier(playerCount)}>
      {playerCount} {playerCount === 1 ? 'player' : 'players'}
    </span>
  );
}
