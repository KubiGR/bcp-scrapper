import { solveMatrixGame, type PairingAnalysis, type PairingRosterPlayer } from '@bcp/shared';
import { Table, Tooltip, UnstyledButton } from '@mantine/core';
import { useState } from 'react';

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
  // Their defenders you're sure they won't pick: left out of every row's numbers.
  const [ruledOut, setRuledOut] = useState<ReadonlySet<number>>(new Set());
  const kept = theirs.map((_, e) => e).filter((e) => !ruledOut.has(e));
  // Their likely defender among the ones left, solved again (not just the old odds renormalised).
  const mix = new Map<number, number>();
  if (ruledOut.size === 0) theirs.forEach((_, e) => mix.set(e, analysis.theirDefender[e] ?? 0));
  else {
    const cols = solveMatrixGame(
      analysis.defenderGrid.map((row) => kept.map((e) => row[e] ?? 0)),
    ).cols;
    kept.forEach((e, j) => mix.set(e, cols[j] ?? 0));
  }
  const toggle = (e: number) => {
    const next = new Set(ruledOut);
    if (next.has(e)) next.delete(e);
    else if (kept.length > 1) next.add(e);
    setRuledOut(next);
  };
  return (
    <Table.ScrollContainer minWidth={420}>
      <Table withRowBorders={false} verticalSpacing={2} fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>You ↓ / them →</Table.Th>
            {theirs.map((t, e) => (
              <Table.Th key={t.id}>
                <Tooltip
                  label={
                    ruledOut.has(e)
                      ? 'Ruled out: click if they might defend with it after all'
                      : 'Click if they won’t defend with it: the numbers leave it out'
                  }
                  multiline
                  w={240}
                >
                  <UnstyledButton
                    aria-pressed={ruledOut.has(e)}
                    aria-label={`${army(t)}${ruledOut.has(e) ? ' (won’t defend)' : ''}`}
                    onClick={() => {
                      toggle(e);
                    }}
                    style={{
                      fontWeight: 600,
                      textDecoration: ruledOut.has(e) ? 'line-through' : undefined,
                      opacity: ruledOut.has(e) ? 0.5 : 1,
                    }}
                  >
                    {army(t)}
                  </UnstyledButton>
                </Tooltip>
              </Table.Th>
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
            const left = kept.map((e) => row[e] ?? 0);
            const values = {
              average: left.reduce((sum, v) => sum + v, 0) / left.length,
              expected: kept.reduce((sum, e) => sum + (row[e] ?? 0) * (mix.get(e) ?? 0), 0),
              best: Math.max(...left),
              worst: Math.min(...left),
            };
            return (
              <Table.Tr key={ours[d]?.id ?? d}>
                <Table.Th scope="row">{army(ours[d])}</Table.Th>
                {row.map((v, e) => (
                  <Table.Td
                    key={theirs[e]?.id ?? e}
                    p={2}
                    style={ruledOut.has(e) ? { opacity: 0.3 } : undefined}
                  >
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
