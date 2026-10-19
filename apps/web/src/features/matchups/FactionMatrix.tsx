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
import {
  cellView,
  rowSummary,
  type CellTone,
  type MatrixSettings,
  type RowSummary,
} from './matrix-view';

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
  summarize,
}: {
  faction: string;
  query: ReturnType<DetachmentRowsQuery>;
  columns: string[];
  renderCell: RenderCell;
  summarize: (cells: MatrixCell[], mirror: string | null) => ReactNode;
}) {
  const rows = useQuery(query);
  if (!rows.data) {
    return (
      <Table.Tr>
        <Table.Td colSpan={columns.length + 3} className={classes.detachmentNote}>
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
        {/* A detachment against its own faction is a real match-up: no mirror to leave out. */}
        {summarize(detachmentRow.cells, null)}
      </Table.Tr>
    );
  });
}

/** A row's average match-up and spread, after its cells (blank without enough games). */
function SummaryCells({ summary, points }: { summary: RowSummary; points: boolean }) {
  const show = (value: number | null, asSpread: boolean) => {
    if (value === null) return '–';
    if (points) return value.toFixed(1);
    // A spread is percentage points; an average, a percentage.
    return asSpread ? String(Math.round(value * 100)) : `${String(Math.round(value * 100))}%`;
  };
  return (
    <>
      <Table.Td
        className={`${classes.summary} ${classes.summaryFirst} numeric`}
        aria-label="Average match-up"
      >
        {show(summary.average, false)}
      </Table.Td>
      <Table.Td className={`${classes.summary} numeric`} aria-label="Spread">
        {show(summary.spread, true)}
      </Table.Td>
    </>
  );
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
  const points = settings.metric === 'points' && scale !== null;
  const summarize = (rowCells: MatrixCell[], mirror: string | null) => (
    <SummaryCells summary={rowSummary(rowCells, settings, scale, mirror)} points={points} />
  );
  // Each faction's overall win rate, and its rank by it among all the rows.
  const overall = new Map(
    matrix.factions.map((faction) => [
      faction,
      rowSummary(
        matrix.cells.filter((cell) => cell.row === faction),
        settings,
        scale,
        faction,
      ).overall,
    ]),
  );
  const ranked = [...overall].sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1)).map(([f]) => f);
  const overallLine = (faction: string) => {
    const rate = overall.get(faction);
    if (rate === null || rate === undefined) return null;
    return `${String(Math.round(rate * 100))}% · #${String(ranked.indexOf(faction) + 1)}`;
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
          data-tip={`${who}: ${view.value}${view.value === String(view.games) ? ' games' : ` over ${String(view.games)} games`}, too few: left out of Average and Spread`}
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
              <Table.Th
                className={classes.corner}
                data-testid="matrix-corner"
                // Over every column heading, whose names lean into their neighbours'.
                style={{ zIndex: matrix.columns.length + 3 }}
              />
              {matrix.columns.map((faction, i) => (
                <Table.Th
                  key={faction}
                  className={classes.stickyHeader}
                  title={faction}
                  // Each heading over the next one, so a slanted name isn't hidden under it.
                  style={{ zIndex: matrix.columns.length - i + 2 }}
                >
                  <span className={classes.headerLabel}>{faction}</span>
                </Table.Th>
              ))}
              <Table.Th
                className={`${classes.summaryHeader} ${classes.summaryFirst}`}
                title={`The row's ${metricLabel} averaged over its match-ups with enough games (hatched cells left out)`}
              >
                Average
              </Table.Th>
              <Table.Th
                className={classes.summaryHeader}
                title="Its best match-up minus its worst, among those with enough games"
              >
                Spread
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(settings.factions.length > 0
              ? matrix.factions.filter((faction) => settings.factions.includes(faction))
              : matrix.factions
            ).map((row) => (
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
                    {overallLine(row) !== null && (
                      <span className={`${classes.overall} numeric`}>{overallLine(row)}</span>
                    )}
                  </Table.Th>
                  {matrix.columns.map((col) => renderCell(cells.get(key(row, col)), col, { row }))}
                  {summarize(
                    matrix.cells.filter((cell) => cell.row === row),
                    row,
                  )}
                </Table.Tr>
                {detachments && open.includes(row) && (
                  <DetachmentRows
                    faction={row}
                    query={detachments(row)}
                    columns={matrix.columns}
                    renderCell={renderCell}
                    summarize={summarize}
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
