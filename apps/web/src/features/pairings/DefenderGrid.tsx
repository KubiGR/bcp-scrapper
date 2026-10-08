import type { PairingAnalysis, PairingRosterPlayer } from '@bcp/shared';
import { Table, Tooltip, UnstyledButton } from '@mantine/core';

const army = (p: PairingRosterPlayer | undefined) => p?.faction ?? p?.name ?? '?';
/** Green above 50, orange below, stronger the further from even. */
const tint = (v: number) => {
  const t = Math.max(-1, Math.min(1, (v - 50) / 4));
  const c = t >= 0 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-orange-6)';
  return `color-mix(in srgb, ${c} ${Math.round(Math.abs(t) * 60)}%, transparent)`;
};

/** Each row's summary: plain mean, weighted by their likely defender, the best and worst square. */
const SUMMARIES = [
  {
    key: 'average',
    title: 'Avg',
    help: 'The mean of the row, as if each of their defenders were equally likely.',
  },
  {
    key: 'expected',
    title: 'Expected',
    help: 'Weighted by how likely each of their defenders is: what to expect from this defender.',
  },
  {
    key: 'best',
    title: 'Best',
    help: 'The highest square: the most their defender can give away.',
  },
  { key: 'worst', title: 'Worst', help: 'The lowest square: the most their defender can hurt.' },
] as const;

export function DefenderGrid({
  analysis,
  ours,
  theirs,
  selected,
  onSelect,
}: {
  analysis: PairingAnalysis;
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  selected: { d: number; e: number };
  onSelect: (d: number, e: number) => void;
}) {
  return (
    <Table.ScrollContainer minWidth={420}>
      <Table withRowBorders={false} verticalSpacing={2} fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>You ↓ / them →</Table.Th>
            {theirs.map((t) => (
              <Table.Th key={t.id}>{army(t)}</Table.Th>
            ))}
            {SUMMARIES.map((m, i) => (
              <Table.Th
                key={m.key}
                style={
                  i === 0 ? { borderLeft: '1px solid var(--mantine-color-default-border)' } : {}
                }
              >
                <Tooltip label={m.help} multiline w={240}>
                  <span tabIndex={0}>{m.title}</span>
                </Tooltip>
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {analysis.defenderGrid.map((row, d) => {
            const values = {
              average: row.reduce((sum, v) => sum + v, 0) / row.length,
              expected: row.reduce((sum, v, e) => sum + v * (analysis.theirDefender[e] ?? 0), 0),
              best: Math.max(...row),
              worst: Math.min(...row),
            };
            return (
              <Table.Tr key={ours[d]?.id ?? d}>
                <Table.Th scope="row">{army(ours[d])}</Table.Th>
                {row.map((v, e) => (
                  <Table.Td key={theirs[e]?.id ?? e} p={2}>
                    <UnstyledButton
                      className="numeric"
                      aria-label={`You defend ${army(ours[d])}, they defend ${army(theirs[e])}: ${v.toFixed(1)}`}
                      aria-pressed={selected.d === d && selected.e === e}
                      onClick={() => {
                        onSelect(d, e);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'center',
                        padding: '6px 4px',
                        borderRadius: 4,
                        background: tint(v),
                        outline:
                          selected.d === d && selected.e === e
                            ? '2px solid var(--mantine-color-text)'
                            : undefined,
                      }}
                    >
                      {v.toFixed(1)}
                    </UnstyledButton>
                  </Table.Td>
                ))}
                {SUMMARIES.map((m, i) => (
                  <Table.Td
                    key={m.key}
                    p={2}
                    aria-label={`${army(ours[d])} ${m.key}`}
                    className="numeric"
                    style={{
                      textAlign: 'center',
                      fontSize: 'var(--mantine-font-size-md)',
                      background: tint(values[m.key]),
                      borderLeft:
                        i === 0 ? '1px solid var(--mantine-color-default-border)' : undefined,
                    }}
                  >
                    {values[m.key].toFixed(1)}
                  </Table.Td>
                ))}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
