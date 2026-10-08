import type { PairingAnalysis, PairingRosterPlayer } from '@bcp/shared';
import { Table, UnstyledButton } from '@mantine/core';

const army = (p: PairingRosterPlayer | undefined) => p?.faction ?? p?.name ?? '?';
/** Green above 50, orange below, stronger the further from even. */
const tint = (v: number) => {
  const t = Math.max(-1, Math.min(1, (v - 50) / 4));
  const c = t >= 0 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-orange-6)';
  return `color-mix(in srgb, ${c} ${Math.round(Math.abs(t) * 60)}%, transparent)`;
};

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
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {analysis.defenderGrid.map((row, d) => (
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
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
