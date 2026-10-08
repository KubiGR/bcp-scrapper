import {
  pairingChain,
  type ChainLeaf,
  type PairingAnalysis,
  type PairingChip,
  type PairingRating,
  type PairingRosterPlayer,
} from '@bcp/shared';
import { Group, NativeSelect, Stack, Switch, Text } from '@mantine/core';
import { useState } from 'react';
import classes from './ChainFlow.module.css';
import { LINE, layoutChain, likelyOnly, type ChainBox } from './chain-layout';
import { chipStyle } from './chip-style';

const army = (p: PairingRosterPlayer | undefined) => p?.faction ?? p?.name ?? '?';
const pct = (x: number) => (x > 0 && x < 0.005 ? '<1%' : `${Math.round(x * 100)}%`);
/** A step's share of the one before it, and of the whole chain. */
const shares = (box: ChainBox) => `${pct(box.share)} here · ${pct(box.reach)} overall`;
/** A line of a box: text, or a game that forms at this step (drawn with its chip). */
type Line = string | { game: [number, number] };
const CHIP_W = 44;

/** The chain for one pair of round-1 defenders, as a flow diagram; click a final box for its line-up. */
export function ChainFlow({
  analysis,
  ours,
  theirs,
  ratings,
  d,
  e,
}: {
  analysis: PairingAnalysis;
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  ratings: PairingRating[];
  d: number;
  e: number;
}) {
  const options = analysis.attackerOptions(d, e);
  const best = options.reduce((x, y) => (y.share > x.share ? y : x));
  const [sendKey, setSendKey] = useState<string | null>(null);
  const send = options.find((o) => o.pair.join() === sendKey) ?? best;
  // Cheap: the solver already cached every stage the chain walks through.
  const [showUnlikely, setShowUnlikely] = useState(true);
  const full = pairingChain(analysis, d, e, send.pair);
  const chain = showUnlikely ? full : likelyOnly(full);
  const layout = layoutChain(chain);
  // The open line-up is remembered by its place in the chain, so it follows rating changes.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked: ChainLeaf | null = layout.nodes.find((n) => n.id === pickedId)?.leaf ?? null;
  const chipOf = new Map(ratings.map((r) => [`${r.playerId}|${r.opponentPlayerId}`, r.chip]));
  const chip = ([a, b]: [number, number]): PairingChip | null =>
    chipOf.get(`${ours[a]?.id ?? ''}|${theirs[b]?.id ?? ''}`) ?? null;
  const label = (box: ChainBox): Line[] => {
    const s = box.ref.send !== undefined ? chain.sends[box.ref.send] : undefined;
    const p = s && box.ref.pick !== undefined ? s.picks[box.ref.pick] : undefined;
    const r = p && box.ref.r2 !== undefined ? p.round2[box.ref.r2] : undefined;
    if (box.kind === 'root')
      return [`You: ${army(ours[d])}`, `Them: ${army(theirs[e])}`, `→ ${chain.value.toFixed(1)}`];
    if (box.kind === 'pick' && s && p)
      return [
        `They send ${s.theirs.map((t) => army(theirs[t])).join(' + ')} · ${pct(box.share)}`,
        { game: [d, p.weTake] },
        { game: [p.theyTake, e] },
        `Back to the pool: ${army(ours[chain.ours.find((a) => a !== p.theyTake) ?? -1])} (you) · ${army(theirs[s.theirs.find((t) => t !== p.weTake) ?? -1])} (them)`,
        `→ ${box.value.toFixed(1)}`,
      ];
    if (box.kind === 'round2' && r)
      return [
        `R2: you ${army(ours[r.d])}`,
        `them ${army(theirs[r.e])} → ${box.value.toFixed(1)}`,
        `They send ${r.theirs.map((t) => army(theirs[t])).join(' + ')}`,
        `You send ${r.ours.map((a) => army(ours[a])).join(' + ')}`,
        shares(box),
      ];
    const leaf = box.leaf;
    if (leaf && r)
      return [
        { game: [r.d, leaf.weTake] },
        { game: [leaf.theyTake, r.e] },
        { game: leaf.last },
        `Total ${box.value.toFixed(1)} · ${shares(box)}`,
      ];
    return [];
  };
  const drawLine = (box: ChainBox, line: Line, i: number) => {
    const y = box.y + 15 + i * LINE;
    if (typeof line === 'string')
      return (
        <text key={i} x={box.x + 8} y={y} fill="var(--mantine-color-text)">
          {line}
        </text>
      );
    const [a, b] = line.game;
    const c = chip(line.game);
    const name = `${army(ours[a])} v ${army(theirs[b])}`;
    const bx = box.x + box.w - 8 - CHIP_W;
    return (
      <g key={i} role="img" aria-label={`${name}: ${c ?? 'unrated'}`}>
        <text x={box.x + 8} y={y} fill="var(--mantine-color-text)">
          {name}
        </text>
        <rect
          x={bx}
          y={y - 11}
          width={CHIP_W}
          height={14}
          rx={3}
          fill={c ? chipStyle(c).background : 'none'}
          stroke={c ? 'none' : 'var(--mantine-color-dimmed)'}
          strokeDasharray={c ? undefined : '3 2'}
        />
        <text
          x={bx + CHIP_W / 2}
          y={y}
          textAnchor="middle"
          fontWeight={700}
          fill={c ? chipStyle(c).color : 'var(--mantine-color-dimmed)'}
        >
          {c ?? '–'}
        </text>
      </g>
    );
  };
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  return (
    <Stack gap="sm">
      <Group align="flex-end" gap="lg">
        <NativeSelect
          label="You send"
          value={send.pair.join()}
          onChange={(ev) => {
            setSendKey(ev.currentTarget.value);
            setPickedId(null);
          }}
          data={options.map((o) => ({
            value: o.pair.join(),
            label: `${o.pair.map((a) => army(ours[a])).join(' + ')} (${o.likely.toFixed(1)}${o === best ? ', best' : ''})`,
          }))}
          maw={420}
        />
        <Switch
          label="Show their unlikely choices"
          description="Choices the model thinks they won't make (under 2%)"
          checked={showUnlikely}
          onChange={(ev) => {
            setShowUnlikely(ev.currentTarget.checked);
          }}
        />
      </Group>
      <div style={{ overflowX: 'auto' }}>
        <svg
          role="group"
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
              box.id === pickedId
                ? 'var(--mantine-color-default-hover)'
                : 'var(--mantine-color-body)';
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
                {lines.map((line, i) => drawLine(box, line, i))}
              </>
            );
            return leaf ? (
              <g
                key={box.id}
                role="button"
                tabIndex={0}
                className={classes.leaf}
                aria-label={`Final line-up, total ${box.value.toFixed(1)}`}
                aria-pressed={box.id === pickedId}
                onClick={() => {
                  setPickedId(box.id);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    setPickedId(box.id);
                  }
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
        <Stack gap={2} role="region" aria-label="Line-up">
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
