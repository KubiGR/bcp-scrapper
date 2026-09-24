import type { FactionMatrix as FactionMatrixData, MatrixCell } from '@bcp/shared';
import { Table, Text, UnstyledButton } from '@mantine/core';
import classes from './FactionMatrix.module.css';
import { cellView, type CellTone, type MatrixSettings } from './matrix-view';

interface FactionMatrixProps {
  matrix: FactionMatrixData;
  scoring: { consistent: boolean; scale: number | null };
  settings: MatrixSettings;
  onCell: (cell: { row: string; col: string }) => void;
}

const toneClass: Record<CellTone, string> = {
  good: classes.good ?? '',
  bad: classes.bad ?? '',
  even: classes.even ?? '',
  mirror: classes.mirror ?? '',
  hidden: classes.hidden ?? '',
};

const key = (row: string, col: string) => `${row}\u0000${col}`;

/** A faction-vs-faction heatmap: rows and columns are factions, cells show a value plus its game
 * count so colour is never the only signal. Scrolls horizontally on phones. */
export function FactionMatrix({ matrix, scoring, settings, onCell }: FactionMatrixProps) {
  const scale = scoring.consistent ? scoring.scale : null;
  const cells = new Map<string, MatrixCell>();
  for (const cell of matrix.cells) cells.set(key(cell.row, cell.col), cell);
  const metricLabel =
    settings.metric === 'points' && scale !== null ? 'average points' : 'win rate';

  return (
    <Table.ScrollContainer minWidth={140 + matrix.factions.length * 90}>
      <Table className={classes.table}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            {matrix.factions.map((faction) => (
              <Table.Th key={faction} className={classes.header} title={faction}>
                <span className={classes.truncate}>{faction}</span>
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {matrix.factions.map((row) => (
            <Table.Tr key={row}>
              <Table.Th scope="row" className={classes.header} title={row}>
                <span className={classes.truncate}>{row}</span>
              </Table.Th>
              {matrix.factions.map((col) => {
                const cell = cells.get(key(row, col));
                if (!cell) return <Table.Td key={col} />;
                const view = cellView(cell, settings, scale);
                if (view.tone === 'hidden') {
                  return (
                    <Table.Td key={col} className={toneClass.hidden} title={`${cell.games} games`}>
                      <Text size="sm" c="dimmed" className="numeric">
                        {view.text}
                      </Text>
                    </Table.Td>
                  );
                }
                const label =
                  view.tone === 'mirror'
                    ? `${row} vs ${col}: ${view.text} games`
                    : `${row} vs ${col}: ${view.text} ${metricLabel} over ${cell.games} games`;
                return (
                  <Table.Td key={col} className={toneClass[view.tone]} p={0}>
                    <UnstyledButton
                      aria-label={label}
                      className={classes.cellButton}
                      onClick={() => {
                        onCell({ row, col });
                      }}
                    >
                      <span className="numeric">{view.text}</span>
                    </UnstyledButton>
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
