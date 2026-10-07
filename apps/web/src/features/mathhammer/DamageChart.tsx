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
  const atLeast = exactly.map((_, n) => woundsDealt.slice(n).reduce((sum, p) => sum + p, 0));
  const step = STEPS.find((s) => s * LINES >= Math.max(...exactly) - 1e-9) ?? 0.2;
  const top = step * LINES;
  const slot = PLOT_W / exactly.length;
  const barW = Math.max(2, Math.min(40, slot - 4));
  const center = (n: number) => LEFT + n * slot + slot / 2;
  const yLeft = (p: number) => TOP + PLOT_H - (Math.min(p, top) / top) * PLOT_H;
  const yRight = (p: number) => TOP + PLOT_H - p * PLOT_H;
  const lines = Array.from({ length: LINES }, (_, i) => i + 1);
  const qs = quartiles(woundsDealt.slice(0, last + 1));
  const labels = new Map<number, string[]>();
  qs.forEach((total, i) => labels.set(total, [...(labels.get(total) ?? []), `Q${String(i + 1)}`]));
  const labelEvery = Math.ceil(exactly.length / 16);
  const mean = exactly.reduce((sum, p, n) => sum + p * n, 0);
  const quartileText = `Q1: ${String(qs[0])} · Q2: ${String(qs[1])} · Q3: ${String(qs[2])}`;

  return (
    <Stack gap={4}>
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
            x={LEFT + qs[0] * slot}
            y={TOP}
            width={(qs[2] - qs[0] + 1) * slot}
            height={PLOT_H}
            className={classes.middle}
          />
          {lines.map((i) => {
            const y = TOP + PLOT_H - (i / LINES) * PLOT_H;
            return (
              <g key={i}>
                <line x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} className={classes.grid} />
                <text
                  data-axis="left"
                  x={LEFT - 6}
                  y={y + 4}
                  textAnchor="end"
                  className={classes.axis}
                >
                  {`${String(Math.round(step * i * 100))}%`}
                </text>
                <text data-axis="right" x={WIDTH - RIGHT + 6} y={y + 4} className={classes.axis}>
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
            className={classes.baseline}
          />
          {exactly.map((p, n) => (
            <g
              key={n}
              onMouseEnter={() => {
                setHover(n);
              }}
            >
              {/* The whole column answers the pointer, not just the bar. */}
              <rect x={LEFT + n * slot} y={TOP} width={slot} height={PLOT_H} fill="transparent" />
              <rect
                data-testid="damage-bar"
                x={center(n) - barW / 2}
                y={yLeft(p)}
                width={barW}
                height={Math.max(0, TOP + PLOT_H - yLeft(p))}
                rx={Math.min(4, barW / 2)}
                className={hover === n ? classes.barHover : classes.bar}
              />
              {n % labelEvery === 0 && (
                <text
                  x={center(n)}
                  y={TOP + PLOT_H + 16}
                  textAnchor="middle"
                  className={classes.axis}
                >
                  {n}
                </text>
              )}
            </g>
          ))}
          {qs.map((total, i) => (
            <line
              key={i}
              data-testid={`quartile-Q${String(i + 1)}`}
              data-total={total}
              x1={center(total)}
              x2={center(total)}
              y1={TOP}
              y2={TOP + PLOT_H}
              className={i === 1 ? classes.median : classes.quartile}
            />
          ))}
          {[...labels].map(([total, names]) => (
            <text
              key={total}
              x={center(total)}
              y={TOP - 8}
              textAnchor="middle"
              className={names.includes('Q2') ? classes.medianLabel : classes.axis}
            >
              {names.join(' ')}
            </text>
          ))}
          <polyline
            points={atLeast.map((p, n) => `${String(center(n))},${String(yRight(p))}`).join(' ')}
            className={classes.line}
          />
          {atLeast.map((p, n) => (
            <circle
              key={n}
              data-testid="at-least-point"
              cx={center(n)}
              cy={yRight(p)}
              r={hover === n ? 5 : 4}
              className={classes.point}
            />
          ))}
          <text x={LEFT - 6} y={HEIGHT - 4} textAnchor="end" className={classes.axisTitle}>
            Exactly
          </text>
          <text
            x={LEFT + PLOT_W / 2}
            y={HEIGHT - 4}
            textAnchor="middle"
            className={classes.axisTitle}
          >
            Damage dealt
          </text>
          <text x={WIDTH - RIGHT + 6} y={HEIGHT - 4} className={classes.axisTitle}>
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
              {`${String(hover)}: ${percent(exactly[hover] ?? 0)}`}
            </div>
            <div>
              <span className={classes.swatchLine} aria-hidden />
              {`${String(hover)}+: ${percent(atLeast[hover] ?? 0)}`}
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
            {exactly.map((p, n) => (
              <tr key={n}>
                <td>{n}</td>
                <td>{percent(p)}</td>
                <td>{percent(atLeast[n] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </VisuallyHidden>
    </Stack>
  );
}
