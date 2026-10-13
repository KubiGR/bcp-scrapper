import { Group, Stack, Text, VisuallyHidden } from '@mantine/core';
import { useState } from 'react';
import classes from './DamageChart.module.css';
import { percent } from './ResultPanel';

const WIDTH = 640;
const HEIGHT = 250;
const LEFT = 44;
const RIGHT = 48;
const TOP = 26;
const BOTTOM = 40;
const PLOT_W = WIDTH - LEFT - RIGHT;
const PLOT_H = HEIGHT - TOP - BOTTOM;
/**
 * The chart's colours and type, written onto the SVG itself (not through classes) so a copied image
 * of it (Share) looks the same. Bars #00a3bf and line #cc7f12: checked apart for colour-blind
 * readers on the dark panel; the greys are the theme's dark steps.
 */
const MONO = '"JetBrains Mono Variable", ui-monospace, monospace';
const SANS = '"Exo 2 Variable", system-ui, sans-serif';
const SVG = {
  middle: { fill: '#2a3656', fillOpacity: 0.55 },
  grid: { stroke: '#2a3656', strokeWidth: 1, strokeDasharray: '4 4' },
  baseline: { stroke: '#5a6a8e', strokeWidth: 1 },
  axis: { fill: '#7f8fb0', fontSize: 11, fontFamily: MONO },
  axisTitle: { fill: '#7f8fb0', fontSize: 11, fontFamily: SANS },
  bar: { fill: '#00a3bf' },
  barHover: { fill: '#26c0db' },
  quartile: { stroke: '#7f8fb0', strokeWidth: 1, strokeDasharray: '3 3' },
  median: { stroke: '#ffffff', strokeWidth: 2 },
  medianLabel: { fill: '#ffffff', fontSize: 11, fontWeight: 600, fontFamily: MONO },
  line: { fill: 'none', stroke: '#cc7f12', strokeWidth: 2 },
  point: { fill: '#cc7f12', stroke: '#1b2440', strokeWidth: 2 },
} as const;

/** Totals less likely than this at the high end are left off. */
const TAIL = 0.0005;
/** Gridlines: both axes share them, the left in fifths of its top, the right in 20% steps. */
const LINES = 5;
const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2];

/**
 * The totals reached by a quarter, half and three quarters of results: the smallest totals whose
 * chance of "at most" is 25%, 50% and 75%.
 */
export function quartiles(dist: number[]): [number, number, number] {
  const at = (q: number) => {
    let sum = 0;
    for (let n = 0; n < dist.length; n += 1) {
      sum += dist[n] ?? 0;
      if (sum >= q - 1e-9) return n;
    }
    return dist.length - 1;
  };
  return [at(0.25), at(0.5), at(0.75)];
}

/**
 * The chance of each total of damage dealt (bars, left axis) and of at least that much (line,
 * right axis), from the exact calculation, with the quartiles marked and the middle half of
 * results shaded. Hovering a total gives both chances; a hidden table reads them out.
 */
export function DamageChart({ woundsDealt }: { woundsDealt: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  let last = woundsDealt.length - 1;
  while (last > 0 && (woundsDealt[last] ?? 0) < TAIL) last -= 1;
  const exactly = woundsDealt.slice(0, last + 1);
  if (exactly.length === 0) return null;
  // At least n: everything from n up (the trimmed tail included).
  const atLeastOf = exactly.map((_, n) => woundsDealt.slice(n).reduce((sum, p) => sum + p, 0));
  // Only the totals that can happen get a column: 2-damage hits make no odd totals, so no gaps.
  const totals = exactly.flatMap((p, n) => (p > 0 || n === 0 ? [n] : []));
  const at = (total: number) =>
    Math.max(
      0,
      totals.findIndex((t) => t >= total),
    );
  const step = STEPS.find((s) => s * LINES >= Math.max(...exactly) - 1e-9) ?? 0.2;
  const top = step * LINES;
  const slot = PLOT_W / totals.length;
  const barW = Math.max(2, Math.min(40, slot - 4));
  const center = (n: number) => LEFT + n * slot + slot / 2;
  const yLeft = (p: number) => TOP + PLOT_H - (Math.min(p, top) / top) * PLOT_H;
  const yRight = (p: number) => TOP + PLOT_H - p * PLOT_H;
  const lines = Array.from({ length: LINES }, (_, i) => i + 1);
  const qs = quartiles(woundsDealt.slice(0, last + 1));
  const labels = new Map<number, string[]>();
  qs.forEach((total, i) => labels.set(total, [...(labels.get(total) ?? []), `Q${String(i + 1)}`]));
  const labelEvery = Math.ceil(totals.length / 16);
  const mean = exactly.reduce((sum, p, n) => sum + p * n, 0);
  const quartileText = `Q1: ${String(qs[0])} · Q2: ${String(qs[1])} · Q3: ${String(qs[2])}`;

  return (
    <Stack gap={4} className={classes.block}>
      <Group justify="space-between" align="center">
        <Text size="sm" fw={600}>
          Damage dealt
        </Text>
        <Group component="ul" aria-label="Legend" gap="md" className={classes.legend}>
          <li>
            <span className={classes.swatchBar} aria-hidden />
            <Text span size="xs">
              Exactly
            </Text>
          </li>
          <li>
            <span className={classes.swatchLine} aria-hidden />
            <Text span size="xs">
              At least
            </Text>
          </li>
        </Group>
      </Group>
      <div className={classes.frame}>
        <svg
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          className={classes.chart}
          role="img"
          aria-label={`Damage dealt: ${mean.toFixed(2)} on average, up to ${String(last)}; ${quartileText}`}
          onMouseLeave={() => {
            setHover(null);
          }}
        >
          {/* The middle half of results. */}
          <rect
            x={LEFT + at(qs[0]) * slot}
            y={TOP}
            width={(at(qs[2]) - at(qs[0]) + 1) * slot}
            height={PLOT_H}
            {...SVG.middle}
          />
          {lines.map((i) => {
            const y = TOP + PLOT_H - (i / LINES) * PLOT_H;
            return (
              <g key={i}>
                <line x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} {...SVG.grid} />
                <text data-axis="left" x={LEFT - 6} y={y + 4} textAnchor="end" {...SVG.axis}>
                  {`${String(Math.round(step * i * 100))}%`}
                </text>
                <text data-axis="right" x={WIDTH - RIGHT + 6} y={y + 4} {...SVG.axis}>
                  {`${String((i * 100) / LINES)}%`}
                </text>
              </g>
            );
          })}
          <line
            x1={LEFT}
            x2={WIDTH - RIGHT}
            y1={TOP + PLOT_H}
            y2={TOP + PLOT_H}
            {...SVG.baseline}
          />
          {totals.map((total, n) => (
            <g
              key={total}
              onMouseEnter={() => {
                setHover(n);
              }}
            >
              {/* The whole column answers the pointer, not just the bar. */}
              <rect x={LEFT + n * slot} y={TOP} width={slot} height={PLOT_H} fill="transparent" />
              <rect
                data-testid="damage-bar"
                x={center(n) - barW / 2}
                y={yLeft(exactly[total] ?? 0)}
                width={barW}
                height={Math.max(0, TOP + PLOT_H - yLeft(exactly[total] ?? 0))}
                rx={Math.min(4, barW / 2)}
                {...(hover === n ? SVG.barHover : SVG.bar)}
              />
              {n % labelEvery === 0 && (
                <text x={center(n)} y={TOP + PLOT_H + 16} textAnchor="middle" {...SVG.axis}>
                  {total}
                </text>
              )}
            </g>
          ))}
          {qs.map((total, i) => (
            <line
              key={i}
              data-testid={`quartile-Q${String(i + 1)}`}
              data-total={total}
              x1={center(at(total))}
              x2={center(at(total))}
              y1={TOP}
              y2={TOP + PLOT_H}
              {...(i === 1 ? SVG.median : SVG.quartile)}
            />
          ))}
          {[...labels].map(([total, names]) => (
            <text
              key={total}
              x={center(at(total))}
              y={TOP - 8}
              textAnchor="middle"
              {...(names.includes('Q2') ? SVG.medianLabel : SVG.axis)}
            >
              {names.join(' ')}
            </text>
          ))}
          <polyline
            points={totals
              .map((total, n) => `${String(center(n))},${String(yRight(atLeastOf[total] ?? 0))}`)
              .join(' ')}
            {...SVG.line}
          />
          {totals.map((total, n) => (
            <circle
              key={total}
              data-testid="at-least-point"
              cx={center(n)}
              cy={yRight(atLeastOf[total] ?? 0)}
              r={hover === n ? 5 : 4}
              {...SVG.point}
            />
          ))}
          <text x={4} y={HEIGHT - 4} {...SVG.axisTitle}>
            Exactly
          </text>
          <text x={LEFT + PLOT_W / 2} y={HEIGHT - 4} textAnchor="middle" {...SVG.axisTitle}>
            Damage dealt
          </text>
          <text x={WIDTH - 4} y={HEIGHT - 4} textAnchor="end" {...SVG.axisTitle}>
            At least
          </text>
        </svg>
        {hover !== null && (
          <div
            role="tooltip"
            className={classes.tip}
            style={{ left: `${String((center(hover) / WIDTH) * 100)}%` }}
          >
            <div>
              <span className={classes.swatchBar} aria-hidden />
              {`${String(totals[hover] ?? 0)}: ${percent(exactly[totals[hover] ?? 0] ?? 0)}`}
            </div>
            <div>
              <span className={classes.swatchLine} aria-hidden />
              {`${String(totals[hover] ?? 0)}+: ${percent(atLeastOf[totals[hover] ?? 0] ?? 0)}`}
            </div>
            <div className={classes.tipQuartiles}>{quartileText}</div>
          </div>
        )}
      </div>
      <Text size="xs" c="dimmed">
        Wounds the target loses, from the exact chances above. Bars: exactly that many (left axis);
        line: at least that many (right axis). Shaded: the middle half of results.
      </Text>
      <VisuallyHidden>
        <table>
          <caption>Damage dealt</caption>
          <thead>
            <tr>
              <th>Damage</th>
              <th>Exactly</th>
              <th>At least</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((total) => (
              <tr key={total}>
                <td>{total}</td>
                <td>{percent(exactly[total] ?? 0)}</td>
                <td>{percent(atLeastOf[total] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </VisuallyHidden>
    </Stack>
  );
}
