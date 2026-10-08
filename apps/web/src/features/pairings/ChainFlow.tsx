import {
  pairingChain,
  type ChainLeaf,
  type PairingAnalysis,
  type PairingRosterPlayer,
} from '@bcp/shared';
import { NativeSelect, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { layoutChain, type ChainBox } from './chain-layout';

const army = (p: PairingRosterPlayer | undefined) => p?.faction ?? p?.name ?? '?';
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The chain for one pair of round-1 defenders, as a flow diagram; click a final box for its line-up. */
export function ChainFlow({
  analysis,
  ours,
  theirs,
  d,
  e,
}: {
  analysis: PairingAnalysis;
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  d: number;
  e: number;
}) {
  const options = analysis.attackerOptions(d, e);
  const best = options.reduce((x, y) => (y.share > x.share ? y : x));
  const [sendKey, setSendKey] = useState<string | null>(null);
  const send = options.find((o) => o.pair.join() === sendKey) ?? best;
  // Cheap: the solver already cached every stage the chain walks through.
  const chain = pairingChain(analysis, d, e, send.pair);
  const layout = layoutChain(chain);
  const [picked, setPicked] = useState<ChainLeaf | null>(null);
  const label = (box: ChainBox): string[] => {
    const s = box.ref.send !== undefined ? chain.sends[box.ref.send] : undefined;
    const p = s && box.ref.pick !== undefined ? s.picks[box.ref.pick] : undefined;
    const r = p && box.ref.r2 !== undefined ? p.round2[box.ref.r2] : undefined;
    if (box.kind === 'root')
      return [`You: ${army(ours[d])}`, `Them: ${army(theirs[e])}`, `→ ${chain.value.toFixed(1)}`];
    if (box.kind === 'pick' && s && p)
      return [
        `They send ${s.theirs.map((t) => army(theirs[t])).join(' + ')} · ${pct(box.share)}`,
        `${army(ours[d])} v ${army(theirs[p.weTake])}`,
        `${army(ours[p.theyTake])} v ${army(theirs[e])} → ${box.value.toFixed(1)}`,
      ];
    if (box.kind === 'round2' && r)
      return [
        `R2 · ${pct(r.p)}: you ${army(ours[r.d])}`,
        `them ${army(theirs[r.e])} → ${box.value.toFixed(1)}`,
      ];
    return [`${box.leaf ? `Total ${box.value.toFixed(1)}` : ''} · ${pct(box.share)}`];
  };
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  return (
    <Stack gap="sm">
      <NativeSelect
        label="You send"
        value={send.pair.join()}
        onChange={(ev) => {
          setSendKey(ev.currentTarget.value);
          setPicked(null);
        }}
        data={options.map((o) => ({
          value: o.pair.join(),
          label: `${o.pair.map((a) => army(ours[a])).join(' + ')} (${o.likely.toFixed(1)}${o === best ? ', best' : ''})`,
        }))}
        maw={420}
      />
      <div style={{ overflowX: 'auto' }}>
        <svg
          role="img"
          aria-label={`Chain: you defend ${army(ours[d])}, they defend ${army(theirs[e])}, you send ${send.pair.map((a) => army(ours[a])).join(' + ')}`}
          width={layout.width}
          height={layout.height + 4}
          viewBox={`0 -2 ${layout.width} ${layout.height + 4}`}
          style={{ font: '11px var(--mantine-font-family)' }}
        >
          {layout.edges.map((edge) => {
            const a = byId.get(edge.from);
            const b = byId.get(edge.to);
            if (!a || !b) return null;
            const x1 = a.x + a.w,
              y1 = a.y + a.h / 2,
              x2 = b.x,
              y2 = b.y + b.h / 2,
              mid = (x1 + x2) / 2;
            return (
              <path
                key={edge.to}
                d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
                fill="none"
                stroke="var(--mantine-color-teal-6)"
                strokeOpacity={0.55}
                strokeWidth={edge.width}
              />
            );
          })}
          {layout.nodes.map((box) => {
            const leaf = box.leaf;
            const lines = label(box);
            const fill =
              leaf && picked === leaf ? 'var(--mantine-color-dark-5)' : 'var(--mantine-color-body)';
            const stroke =
              box.value >= 50 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-orange-6)';
            const content = (
              <>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  rx={6}
                  fill={fill}
                  stroke={stroke}
                />
                {lines.map((line, i) => (
                  <text
                    key={i}
                    x={box.x + 8}
                    y={box.y + 15 + i * 14}
                    fill="var(--mantine-color-text)"
                  >
                    {line}
                  </text>
                ))}
              </>
            );
            return leaf ? (
              <g
                key={box.id}
                role="button"
                tabIndex={0}
                aria-label={`Final line-up, total ${box.value.toFixed(1)}`}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setPicked(leaf);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') setPicked(leaf);
                }}
              >
                {content}
              </g>
            ) : (
              <g key={box.id}>{content}</g>
            );
          })}
        </svg>
      </div>
      {picked && (
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            Line-up · Total {picked.total.toFixed(1)}
          </Text>
          {picked.games.map(([a, b]) => {
            const v = analysis.game.pt(a, b);
            return (
              <Text key={`${a}-${b}`} size="sm">
                {army(ours[a])} v {army(theirs[b])} <span className="numeric">{v}</span>
              </Text>
            );
          })}
        </Stack>
      )}
      {chain.other > 0.005 && (
        <Text size="xs" c="dimmed">
          Other lines: {pct(chain.other)}
        </Text>
      )}
    </Stack>
  );
}
