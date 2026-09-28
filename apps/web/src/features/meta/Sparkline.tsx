const WIDTH = 72;
const HEIGHT = 20;
const PAD = 2;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
/** "7 Sep" from "2026-09-07". */
const dayLabel = (day: string) => {
  const [, month = '1', date = '1'] = day.split('-');
  return `${String(Number(date))} ${MONTHS[Number(month) - 1] ?? ''}`;
};

/**
 * A tiny line of weekly shares of players, scaled to its own highest week. Weeks without events
 * (null) break the line; the numbers are in its tooltip and its label, so it never relies on the
 * picture alone.
 */
export function Sparkline({ values, weeks }: { values: (number | null)[]; weeks: string[] }) {
  const known = values.filter((value): value is number => value !== null);
  const first = known[0];
  const last = known.at(-1);
  if (values.length === 0 || first === undefined || last === undefined) return null;

  const max = Math.max(...known) || 1;
  const x = (index: number) =>
    values.length === 1 ? WIDTH / 2 : PAD + (index / (values.length - 1)) * (WIDTH - 2 * PAD);
  const y = (value: number) => HEIGHT - PAD - (value / max) * (HEIGHT - 2 * PAD);

  // Runs of consecutive weeks with events, each drawn as its own line.
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push({ x: x(index), y: y(value) });
    }
  });
  if (current.length > 0) segments.push(current);

  const detail = weeks
    .map((week, index) => {
      const value = values[index];
      return `${dayLabel(week)}: ${value === null || value === undefined ? 'no events' : pct(value)}`;
    })
    .join('\n');

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      role="img"
      aria-label={`Share by week: ${pct(first)} to ${pct(last)}`}
      style={{ display: 'block', marginLeft: 'auto' }}
    >
      <title>{`Share of players, week by week\n${detail}`}</title>
      {segments.map((points) => {
        const start = points[0];
        return (
          <g key={String(start?.x)}>
            <polyline
              points={points
                .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke="var(--mantine-color-neon-5)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.length === 1 && start && (
              <circle cx={start.x} cy={start.y} r={1.5} fill="var(--mantine-color-neon-5)" />
            )}
          </g>
        );
      })}
    </svg>
  );
}
