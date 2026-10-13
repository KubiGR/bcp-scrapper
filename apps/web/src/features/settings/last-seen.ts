const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** When someone was last seen, said plainly: "5 min ago", "Yesterday", a date past a month. */
export function lastSeen(iso: string | null, now: Date = new Date()): string {
  if (iso === null) return 'Never';
  const at = new Date(iso);
  const ago = now.getTime() - at.getTime();
  if (ago < MIN) return 'Just now';
  if (ago < HOUR) return `${String(Math.floor(ago / MIN))} min ago`;
  if (ago < DAY) return `${String(Math.floor(ago / HOUR))} h ago`;
  if (ago < 2 * DAY) return 'Yesterday';
  if (ago < 30 * DAY) return `${String(Math.floor(ago / DAY))} days ago`;
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
