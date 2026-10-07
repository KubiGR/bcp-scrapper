import { SegmentedControl, Group, Stack, Text, VisuallyHidden } from '@mantine/core';
import { useState } from 'react';
import classes from './DamageChart.module.css';
import { percent } from './ResultPanel';

const WIDTH = 640;
const HEIGHT = 220;
const LEFT = 40;
const RIGHT = 8;
const TOP = 10;
const BOTTOM = 26;
const PLOT_W = WIDTH - LEFT - RIGHT;
const PLOT_H = HEIGHT - TOP - BOTTOM;
/** Totals less likely than this at the high end are left off. */
const TAIL = 0.0005;

/** The axis step: 5% for small chances, 10% up to 60%, else 20%. */
const stepFor = (max: number) => (max <= 0.2 ? 0.05 : max <= 0.6 ? 0.1 : 0.2);
/** A round top for the axis: the next step. */
const niceTop = (max: number) => {
  const step = stepFor(max);
  return Math.min(1, Math.max(step, Math.ceil(max / step - 1e-9) * step));
};

/**
 * The chance of each total of damage dealt (wounds the target lost), exactly or at least, from the
 * exact calculation. Hovering a bar gives both chances; a hidden table reads them out.
 */
export function DamageChart({ woundsDealt }: { woundsDealt: number[] }) {
  const [mode, setMode] = useState<'exactly' | 'atLeast'>('exactly');
  const [hover, setHover] = useState<number | null>(null);
  let last = woundsDealt.length - 1;
  while (last > 0 && (woundsDealt[last] ?? 0) < TAIL) last -= 1;
  const exactly = woundsDealt.slice(0, last + 1);
  if (exactly.length === 0) return null;
  // At least n: everything from n up (the trimmed tail included).
  const atLeast = exactly.map((_, n) => woundsDealt.slice(n).reduce((sum, p) => sum + p, 0));
  const values = mode === 'exactly' ? exactly : atLeast;
  const top = niceTop(Math.max(...values));
  const slot = PLOT_W / values.length;
  const barW = Math.max(2, Math.min(36, slot - 2));
  const y = (p: number) => TOP + PLOT_H - (p / top) * PLOT_H;
  const step = stepFor(Math.max(...values));
  const ticks = Array.from({ length: Math.round(top / step) }, (_, i) => (i + 1) * step);
  const labelEvery = Math.ceil(values.length / 16);
  const mean = exactly.reduce((sum, p, n) => sum + p * n, 0);

  return (
    <Stack gap={4}>
      <Group justify="space-between" align="center">
        <Text size="sm" fw={600}>
          Damage dealt
        </Text>
        <SegmentedControl
          size="xs"
          aria-label="Chance shown"
          data={[
            { value: 'exactly', label: 'Exactly' },
            { value: 'atLeast', label: 'At least' },
          ]}
          value={mode}
          onChange={(value) => {
            setMode(value === 'atLeast' ? 'atLeast' : 'exactly');
          }}
        />
      </Group>
      <div className={classes.frame}>
        <svg
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          className={classes.chart}
          role="img"
          aria-label={`Damage dealt: ${mean.toFixed(2)} on average, up to ${String(last)}`}
          onMouseLeave={() => {
            setHover(null);
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(t)} y2={y(t)} className={classes.grid} />
              <text x={LEFT - 6} y={y(t) + 4} textAnchor="end" className={classes.axis}>
                {`${String(Math.round(t * 100))}%`}
              </text>
            </g>
          ))}
          <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(0)} y2={y(0)} className={classes.baseline} />
          {values.map((p, n) => {
            const x = LEFT + n * slot + (slot - barW) / 2;
            return (
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
                  x={x}
                  y={y(p)}
                  width={barW}
                  height={Math.max(0, y(0) - y(p))}
                  rx={Math.min(4, barW / 2)}
                  className={hover === n ? classes.barHover : classes.bar}
                />
                {n % labelEvery === 0 && (
                  <text
                    x={LEFT + n * slot + slot / 2}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                    className={classes.axis}
                  >
                    {n}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            role="tooltip"
            className={classes.tip}
            style={{ left: `${String(((LEFT + hover * slot + slot / 2) / WIDTH) * 100)}%` }}
          >
            {`${String(hover)} damage: ${percent(exactly[hover] ?? 0)} exactly, ${percent(atLeast[hover] ?? 0)} at least`}
          </div>
        )}
      </div>
      <Text size="xs" c="dimmed">
        Wounds the target loses, from the exact chances above.
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
