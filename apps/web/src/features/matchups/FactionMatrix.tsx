import type { FactionMatrix as FactionMatrixData, MatrixCell } from '@bcp/shared';
import { Group, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { useRef, type CSSProperties, type SyntheticEvent } from 'react';
import { CellTip, type CellTipHandle } from './CellTip';
import classes from './FactionMatrix.module.css';
import { cellView, type CellTone, type MatrixSettings } from './matrix-view';

interface FactionMatrixProps {
  matrix: FactionMatrixData;
  scoring: { consistent: boolean; scale: number | null };
  settings: MatrixSettings;
  onCell: (cell: { row: string; col: string }) => void;
}

/** The colours in words too, so they never carry meaning alone. */
const LEGEND = [
  { label: 'Row does worse (orange)', swatch: classes.swatchBad ?? '' },
  { label: 'Even (grey)', swatch: classes.swatchEven ?? '' },
  { label: 'Row does better (blue)', swatch: classes.swatchGood ?? '' },
];

const toneClass: Record<CellTone, string> = {
  good: classes.good ?? '',
  bad: classes.bad ?? '',
  even: classes.even ?? '',
  mirror: classes.mirror ?? '',
  hidden: classes.hidden ?? '',
};

const key = (row: string, col: string) => `${row}\u0000${col}`;

/** A faction-vs-faction heatmap: rows and columns are factions, cells show a compact value coloured
 * by how far it sits from even, with the game count in the aria-label and a dimmed second line.
 * The header row, first column, and corner cell stay sticky in a scrolling `div` (not a Mantine
 * ScrollArea viewport, which can break `position: sticky`). */
export function FactionMatrix({ matrix, scoring, settings, onCell }: FactionMatrixProps) {
  const scale = scoring.consistent ? scoring.scale : null;
  const cells = new Map<string, MatrixCell>();
  for (const cell of matrix.cells) cells.set(key(cell.row, cell.col), cell);
  const metricLabel =
    settings.metric === 'points' && scale !== null ? 'average points' : 'win rate';
  const tip = useRef<CellTipHandle>(null);
  // Says which factions the cell under the pointer (or keyboard) is.
  const showTip = (event: SyntheticEvent) => {
    const cell = (event.target as Element).closest('[data-tip]');
    const label = cell?.getAttribute('data-tip');
    if (cell && label) tip.current?.show(label, cell);
    else tip.current?.hide();
  };
  const hideTip = () => {
    tip.current?.hide();
  };

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        Rows: faction · Columns: opponent · Cell: row faction&apos;s result
      </Text>
      <Group component="ul" aria-label="Colour key" gap="md" className={classes.legend}>
        {LEGEND.map((entry) => (
          <Text component="li" size="xs" c="dimmed" key={entry.label}>
            <span className={`${classes.swatch} ${entry.swatch}`} aria-hidden />
            {entry.label}
          </Text>
        ))}
      </Group>
      <div className={classes.scrollArea} onScroll={hideTip}>
        <CellTip ref={tip} />
        <Table
          className={classes.table}
          onMouseOver={showTip}
          onMouseLeave={hideTip}
          onFocus={showTip}
          onBlur={hideTip}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th className={classes.corner} data-testid="matrix-corner" />
              {matrix.factions.map((faction) => (
                <Table.Th key={faction} className={classes.stickyHeader} title={faction}>
                  <span className={classes.headerLabel}>{faction}</span>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {matrix.factions.map((row) => (
              <Table.Tr key={row}>
                <Table.Th scope="row" className={classes.stickyRowHeader} title={row}>
                  <span className={classes.truncate}>{row}</span>
                </Table.Th>
                {matrix.factions.map((col) => {
                  const cell = cells.get(key(row, col));
                  if (!cell) return <Table.Td key={col} className={classes.cell} />;
                  const view = cellView(cell, settings, scale);
                  if (view.tone === 'hidden') {
                    return (
                      <Table.Td
                        key={col}
                        className={`${classes.cell} ${toneClass.hidden}`}
                        data-tip={`${row} vs ${col}: ${String(view.games)} games, under the minimum`}
                      >
                        <Text size="sm" c="dimmed" className="numeric">
                          {view.text}
                        </Text>
                      </Table.Td>
                    );
                  }
                  const label =
                    view.tone === 'mirror'
                      ? `${row} vs ${col}: ${view.text} games`
                      : `${row} vs ${col}: ${view.value} ${metricLabel} over ${view.games} games`;
                  const style =
                    view.tone === 'good' || view.tone === 'bad'
                      ? ({ '--strength': view.strength } as CSSProperties)
                      : undefined;
                  return (
                    <Table.Td
                      key={col}
                      className={`${classes.cell} ${toneClass[view.tone]}`}
                      style={style}
                      p={0}
                    >
                      <UnstyledButton
                        aria-label={label}
                        data-tip={label}
                        className={classes.cellButton}
                        onClick={() => {
                          onCell({ row, col });
                        }}
                      >
                        <span className="numeric">{view.text}</span>
                        {view.tone !== 'mirror' && (
                          <span className={`${classes.count} numeric`}>{view.games}</span>
                        )}
                      </UnstyledButton>
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </Stack>
  );
}
