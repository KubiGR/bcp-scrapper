import type { FactionMatrix as FactionMatrixData, MatrixCell } from '@bcp/shared';
import { Group, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import {
  Fragment,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { CellTip, type CellTipHandle } from './CellTip';
import classes from './FactionMatrix.module.css';
import type { DetachmentRowsQuery } from './matchups-queries';
import { pickLabel, type MatrixPick } from './matrix-pick';
import { cellView, type CellTone, type MatrixSettings } from './matrix-view';

interface FactionMatrixProps {
  matrix: FactionMatrixData;
  scoring: { consistent: boolean; scale: number | null };
  settings: MatrixSettings;
  onCell: (cell: MatrixPick) => void;
  /** When given, a faction's name opens its detachment rows (asked for on opening). */
  detachments?: DetachmentRowsQuery;
}

/** Draws one cell: `row` names the row side, with `detachment` in a detachment row. */
type RenderCell = (
  cell: MatrixCell | undefined,
  col: string,
  side: Pick<MatrixPick, 'row' | 'detachment'>,
) => ReactNode;

/** A faction's detachment rows, under its own row: loading, error, or one row per detachment. */
function DetachmentRows({
  faction,
  query,
  columns,
  renderCell,
}: {
  faction: string;
  query: ReturnType<DetachmentRowsQuery>;
  columns: string[];
  renderCell: RenderCell;
}) {
  const rows = useQuery(query);
  if (!rows.data) {
    return (
      <Table.Tr>
        <Table.Td colSpan={columns.length + 1} className={classes.detachmentNote}>
          <Text size="xs" c="dimmed">
            {rows.error ? `Couldn’t load ${faction}’s detachments.` : 'Loading detachments…'}
          </Text>
        </Table.Td>
      </Table.Tr>
    );
  }
  return rows.data.rows.map((detachmentRow) => {
    const name = detachmentRow.detachment;
    const byCol = new Map(detachmentRow.cells.map((cell) => [cell.col, cell]));
    return (
      <Table.Tr key={name} className={classes.detachmentRow}>
        <Table.Th scope="row" className={classes.stickyRowHeader} title={`${faction} · ${name}`}>
          <span className={classes.detachmentName}>{name}</span>
        </Table.Th>
        {columns.map((col) =>
          renderCell(byCol.get(col), col, { row: faction, detachment: detachmentRow.detachment }),
        )}
      </Table.Tr>
    );
  });
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
export function FactionMatrix({
  matrix,
  scoring,
  settings,
  onCell,
  detachments,
}: FactionMatrixProps) {
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
  // Factions whose detachment rows are open.
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (faction: string) => {
    setOpen((now) =>
      now.includes(faction) ? now.filter((f) => f !== faction) : [...now, faction],
    );
  };

  const renderCell: RenderCell = (cell, col, side) => {
    if (!cell) return <Table.Td key={col} className={classes.cell} />;
    // A detachment row against its own faction is a real result, not a mirror.
    const view = cellView(cell, settings, scale, side.detachment === undefined && side.row === col);
    const who = `${pickLabel(side)} vs ${col}`;
    if (view.tone === 'hidden') {
      return (
        <Table.Td
          key={col}
          className={`${classes.cell} ${toneClass.hidden}`}
          data-tip={`${who}: ${String(view.games)} games, under the minimum`}
        >
          <Text size="sm" c="dimmed" className="numeric">
            {view.text}
          </Text>
        </Table.Td>
      );
    }
    const label =
      view.tone === 'mirror'
        ? `${who}: ${view.text} games`
        : `${who}: ${view.value} ${metricLabel} over ${String(view.games)} games`;
    const style =
      view.tone === 'good' || view.tone === 'bad'
        ? ({ '--strength': view.strength } as CSSProperties)
        : undefined;
    return (
      <Table.Td key={col} className={`${classes.cell} ${toneClass[view.tone]}`} style={style} p={0}>
        <UnstyledButton
          aria-label={label}
          data-tip={label}
          className={classes.cellButton}
          onClick={() => {
            onCell(
              side.detachment === undefined
                ? { row: side.row, col }
                : { row: side.row, col, detachment: side.detachment },
            );
          }}
        >
          <span className="numeric">{view.text}</span>
          {view.tone !== 'mirror' && (
            <span className={`${classes.count} numeric`}>{view.games}</span>
          )}
        </UnstyledButton>
      </Table.Td>
    );
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
              {matrix.columns.map((faction) => (
                <Table.Th key={faction} className={classes.stickyHeader} title={faction}>
                  <span className={classes.headerLabel}>{faction}</span>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {matrix.factions.map((row) => (
              <Fragment key={row}>
                <Table.Tr>
                  <Table.Th scope="row" className={classes.stickyRowHeader} title={row}>
                    {detachments ? (
                      <UnstyledButton
                        className={classes.rowToggle}
                        aria-expanded={open.includes(row)}
                        onClick={() => {
                          toggle(row);
                        }}
                      >
                        <span aria-hidden className={classes.arrow}>
                          {open.includes(row) ? '▾' : '▸'}
                        </span>
                        <span className={classes.truncate}>{row}</span>
                      </UnstyledButton>
                    ) : (
                      <span className={classes.truncate}>{row}</span>
                    )}
                  </Table.Th>
                  {matrix.columns.map((col) => renderCell(cells.get(key(row, col)), col, { row }))}
                </Table.Tr>
                {detachments && open.includes(row) && (
                  <DetachmentRows
                    faction={row}
                    query={detachments(row)}
                    columns={matrix.columns}
                    renderCell={renderCell}
                  />
                )}
              </Fragment>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </Stack>
  );
}
