import {
  CHAIN_MIN_SHARE,
  pairingChain,
  type ChainLeaf,
  type PairingAnalysis,
  type PairingChip,
  type PairingRating,
  type PairingRosterPlayer,
} from '@bcp/shared';
import { Button, Group, NativeSelect, Paper, Stack, Switch, Table, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import classes from './ChainFlow.module.css';
import {
  LINE,
  layoutChain,
  visibleChain,
  type ChainBox,
  type ChainFollow,
  type ChainShown,
} from './chain-layout';
import { ratingName } from './ChipLabel';
import { chipStyle } from './chip-style';
import { bestAgainst, breakEven, nextTip, safest } from './tips';

const army = (p: PairingRosterPlayer | undefined) => p?.faction ?? p?.name ?? '?';
/** A score difference as "+0.8", "−1.2" or "0.0". */
const signed = (x: number) =>
  Math.abs(x) < 0.05 ? '0.0' : `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;
const pct = (x: number) => (x > 0 && x < 0.005 ? '<1%' : `${Math.round(x * 100)}%`);
/** A step's share of the one before it, and of the whole chain. */
const shares = (box: ChainBox) => `${pct(box.share)} here · ${pct(box.reach)} overall`;
/** A line of a box: text, or a game that forms at this step (drawn with its chip). */
type Line = string | { game: [number, number] };
const CHIP_W = 44;
/** The strip for the chip a game can become. */
const ALT_W = 16;
/** The ▲ ▼ that step through a column. */
const ARROW_W = 22;
const ARROW_H = 10;

/** The chain for one pair of round-1 defenders, as a flow diagram; click a final box for its line-up. */
export function ChainFlow({
  analysis,
  ours,
  theirs,
  ratings,
  d,
  e,
  onDefendersChange,
  follow: followProp,
  onFollowChange,
  onClear,
  shown: shownProp,
  onShownChange,
}: {
  analysis: PairingAnalysis;
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  ratings: PairingRating[];
  d: number;
  e: number;
  /** The round-1 defenders chosen in the follow bar (the grid's square follows). */
  onDefendersChange?: (d: number, e: number) => void;
  /** The live pairing, when the page keeps it (the ratings table greys out who's used). */
  follow?: ChainFollow;
  onFollowChange?: (follow: ChainFollow) => void;
  /** Clear was pressed: the page puts the round-1 defenders back to the suggested ones. */
  onClear?: () => void;
  /** Which unlikely choices show, when the page keeps it (so it survives other defenders). */
  shown?: ChainShown;
  onShownChange?: (shown: ChainShown) => void;
}) {
  const options = analysis.attackerOptions(d, e);
  const best = options.reduce((x, y) => (y.share > x.share ? y : x));
  const [sendKey, setSendKey] = useState<string | null>(null);
  const send = options.find((o) => o.pair.join() === sendKey) ?? best;
  // Cheap: the solver already cached every stage the chain walks through.
  // Their unlikely choices are shown by default (real opponents rate the games their own way);
  // ours, which are ours to make, only when asked for: they multiply the chain's size.
  const [ownShown, setOwnShown] = useState<ChainShown>({ ours: false, theirs: true });
  const shown = shownProp ?? ownShown;
  const setShown = onShownChange ?? setOwnShown;
  const full = pairingChain(analysis, d, e, send.pair);
  // The live pairing so far; each choice depends on the ones before it.
  const [ownFollow, setOwnFollow] = useState<ChainFollow>({});
  const follow = followProp ?? ownFollow;
  const setFollow = onFollowChange ?? setOwnFollow;
  const chain = visibleChain(full, shown, follow);
  const ALL = [0, 1, 2, 3, 4];
  const theirSend = full.sends.find((x) => x.theirs.join() === follow.theirSend)?.theirs;
  const followOptions = (players: PairingRosterPlayer[], indexes: readonly number[]) => [
    { value: '', label: 'Any' },
    ...indexes.map((i) => ({ value: String(i), label: army(players[i]) })),
  ];
  // Our team's next decision, with what each option leads to.
  const tip = nextTip(analysis, d, e, send.pair, follow);
  const tipPlayers = tip?.side === 'ours' ? ours : theirs;
  // Their answers to it, and a read on which one they'll make (forgotten when the decision moves on).
  const replyPlayers = tip?.replies.side === 'ours' ? ours : theirs;
  const tipKey = tip
    ? `${tip.step}|${tip.options.map((o) => o.index).join()}|${tip.replies.list.map((r) => r.index).join()}`
    : '';
  const [readState, setReadState] = useState<{ key: string; reply: number } | null>(null);
  const read = readState?.key === tipKey ? readState.reply : null;
  const readBest = tip && read !== null ? bestAgainst(tip, read) : undefined;
  const even = tip ? breakEven(tip) : null;
  const safe = tip ? safest(tip) : undefined;
  // A real mix only when no option guarantees the expected score on its own.
  const mixed =
    !tip?.same && tip?.safe === null && (tip.options[1]?.chance ?? 0) >= CHAIN_MIN_SHARE;
  // With no read: the pick to go with, and when the model mixes, the safest single pick too.
  const top = tip?.options[0];
  const noRead =
    !tip || !top
      ? ''
      : tip.same
        ? 'No read: any of them'
        : mixed
          ? `No read: mix ${tip.options
              .filter((o) => o.chance >= CHAIN_MIN_SHARE)
              .map((o) => `${pct(o.chance)} ${army(tipPlayers[o.index])}`)
              .join(
                ' / ',
              )} (averages ${top.expected.toFixed(1)} whatever they do). For one pick, ${army(tipPlayers[safe?.index ?? -1])} is the safer: never below ${(safe?.worst ?? 0).toFixed(1)}.`
          : `No read: take ${army(tipPlayers[top.index])} → ${top.expected.toFixed(1)}`;
  /** Our row of the defender grid against their likely defender. */
  const defenderExpected = (i: number) =>
    (analysis.defenderGrid[i] ?? []).reduce(
      (sum, v, j) => sum + v * (analysis.theirDefender[j] ?? 0),
      0,
    );
  const pickNumber = (value: string) => (value === '' ? undefined : Number(value));
  const layout = layoutChain(chain);
  // The open line-up is remembered by its place in the chain, so it follows rating changes.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked: ChainLeaf | null = layout.nodes.find((n) => n.id === pickedId)?.leaf ?? null;
  const ratingOf = new Map(ratings.map((r) => [`${r.playerId}|${r.opponentPlayerId}`, r]));
  const rating = ([a, b]: [number, number]): PairingRating | undefined =>
    ratingOf.get(`${ours[a]?.id ?? ''}|${theirs[b]?.id ?? ''}`);
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
    const r = rating(line.game);
    const c: PairingChip | null = r?.chip ?? null;
    const name = `${army(ours[a])} v ${army(theirs[b])}`;
    const bx = box.x + box.w - 8 - CHIP_W;
    // A game that can become another chip: its chip, then the other one in a narrower strip.
    const mainW = r?.alt ? CHIP_W - ALT_W : CHIP_W;
    return (
      <g key={i} role="img" aria-label={`${name}: ${ratingName(c, r?.alt)}`}>
        <text x={box.x + 8} y={y} fill="var(--mantine-color-text)">
          {name}
        </text>
        <rect
          x={bx}
          y={y - 11}
          width={mainW}
          height={14}
          rx={3}
          fill={c ? chipStyle(c).background : 'none'}
          stroke={c ? 'none' : 'var(--mantine-color-dimmed)'}
          strokeDasharray={c ? undefined : '3 2'}
        />
        <text
          x={bx + mainW / 2}
          y={y}
          textAnchor="middle"
          fontWeight={700}
          fill={c ? chipStyle(c).color : 'var(--mantine-color-dimmed)'}
        >
          {c ?? '–'}
        </text>
        {r?.alt && (
          <>
            <rect
              x={bx + mainW + 1}
              y={y - 11}
              width={ALT_W - 1}
              height={14}
              rx={3}
              fill={chipStyle(r.alt).background}
            />
            <text
              x={bx + mainW + ALT_W / 2}
              y={y - 1}
              textAnchor="middle"
              fontSize={8}
              fontWeight={700}
              fill={chipStyle(r.alt).color}
            >
              {r.alt}
            </text>
          </>
        )}
      </g>
    );
  };
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));

  // ▲ ▼ on each box step through its column (one decision's options), top to bottom.
  const svgRef = useRef<SVGSVGElement>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (flashId === null) return;
    const timer = setTimeout(() => {
      setFlashId(null);
    }, 1200);
    return () => {
      clearTimeout(timer);
    };
  }, [flashId]);
  const columns = new Map<number, ChainBox[]>();
  for (const box of layout.nodes) {
    if (box.column === 0) continue;
    columns.set(box.column, [...(columns.get(box.column) ?? []), box]);
  }
  for (const list of columns.values()) list.sort((a, b) => a.y - b.y);
  const jump = (to: ChainBox) => {
    const top = svgRef.current?.getBoundingClientRect().top ?? 0;
    window.scrollTo({
      top: window.scrollY + top + to.y + to.h / 2 - window.innerHeight / 2,
      behavior: 'smooth',
    });
    setFlashId(to.id);
  };
  const arrow = (box: ChainBox, to: ChainBox | undefined, dir: 'up' | 'down') => {
    if (!to) return null;
    // Centred on the box's top edge (▲) or bottom edge (▼), half outside it.
    const x = box.x + box.w / 2 - ARROW_W / 2;
    const y = (dir === 'up' ? box.y : box.y + box.h) - ARROW_H / 2;
    const go = () => {
      jump(to);
    };
    return (
      <g
        key={`${box.id}-${dir}`}
        role="button"
        tabIndex={0}
        className={classes.arrow}
        aria-label={dir === 'up' ? 'Previous in this column' : 'Next in this column'}
        onClick={go}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            go();
          }
        }}
      >
        <rect x={x} y={y} width={ARROW_W} height={ARROW_H} rx={3} />
        <text x={x + ARROW_W / 2} y={y + ARROW_H - 2} textAnchor="middle">
          {dir === 'up' ? '▲' : '▼'}
        </text>
      </g>
    );
  };

  return (
    <Stack gap="sm">
      <Group align="flex-end" gap="lg">
        <Stack gap={6}>
          <Switch
            label="Show their unlikely choices"
            description="Choices the model thinks they won't make (under 2%)"
            checked={shown.theirs}
            onChange={(ev) => {
              setShown({ ...shown, theirs: ev.currentTarget.checked });
            }}
          />
          <Switch
            label="Show our unlikely choices"
            description="Choices the model advises against (under 2%); makes the chain much longer"
            checked={shown.ours}
            onChange={(ev) => {
              setShown({ ...shown, ours: ev.currentTarget.checked });
            }}
          />
        </Stack>
      </Group>
      <Group align="flex-end" gap="sm" wrap="wrap">
        <Text size="sm" fw={600} w="100%">
          Follow the pairing
        </Text>
        <NativeSelect
          label="You defend"
          value={String(d)}
          onChange={(ev) => {
            onDefendersChange?.(Number(ev.currentTarget.value), e);
            setFollow({ ourDefender: true, theirDefender: follow.theirDefender });
          }}
          data={ours.map((p, i) => ({
            value: String(i),
            label: `${army(p)} (expected ${defenderExpected(i).toFixed(1)})`,
          }))}
          w={300}
        />
        <NativeSelect
          label="They defend"
          value={String(e)}
          onChange={(ev) => {
            onDefendersChange?.(d, Number(ev.currentTarget.value));
            setFollow({ ourDefender: follow.ourDefender, theirDefender: true });
          }}
          data={theirs.map((p, i) => ({
            value: String(i),
            label: `${army(p)} (${pct(analysis.theirDefender[i] ?? 0)})`,
          }))}
          w={300}
        />
        <NativeSelect
          label="You send"
          value={send.pair.join()}
          onChange={(ev) => {
            setSendKey(ev.currentTarget.value);
            // What follows our send starts over; the defenders stay chosen.
            setFollow({ ourDefender: follow.ourDefender, theirDefender: follow.theirDefender });
            setPickedId(null);
          }}
          data={options.map((o) => ({
            value: o.pair.join(),
            label: `${o.pair.map((a) => army(ours[a])).join(' + ')} (${o.likely.toFixed(1)}${o === best ? ', best' : ''})`,
          }))}
          w={500}
        />
        <NativeSelect
          label="They send"
          value={follow.theirSend ?? ''}
          onChange={(ev) => {
            const v = ev.currentTarget.value;
            // Their send decides what our defender can take, and so their round-2 defender.
            setFollow({
              ourDefender: follow.ourDefender,
              theirDefender: follow.theirDefender,
              theyTake: follow.theyTake,
              ourR2: follow.ourR2,
              theirSend: v || undefined,
            });
          }}
          data={[
            { value: '', label: 'Any' },
            ...full.sends.map((x) => ({
              value: x.theirs.join(),
              label: `${x.theirs.map((t) => army(theirs[t])).join(' + ')} · ${pct(x.p)} · ${x.value.toFixed(1)} for you (${signed(x.value - full.value)})`,
            })),
          ]}
          w={420}
        />
        <NativeSelect
          label="You take"
          disabled={!theirSend}
          value={follow.weTake === undefined ? '' : String(follow.weTake)}
          onChange={(ev) => {
            setFollow({
              ...follow,
              weTake: pickNumber(ev.currentTarget.value),
              theirR2: undefined,
            });
          }}
          data={followOptions(theirs, theirSend ?? [])}
          w={190}
        />
        <NativeSelect
          label="They take"
          value={follow.theyTake === undefined ? '' : String(follow.theyTake)}
          onChange={(ev) => {
            setFollow({
              ...follow,
              theyTake: pickNumber(ev.currentTarget.value),
              ourR2: undefined,
            });
          }}
          data={followOptions(ours, send.pair)}
          w={190}
        />
        <NativeSelect
          label="Your round-2 defender"
          disabled={follow.theyTake === undefined}
          value={follow.ourR2 === undefined ? '' : String(follow.ourR2)}
          onChange={(ev) => {
            setFollow({ ...follow, ourR2: pickNumber(ev.currentTarget.value) });
          }}
          data={followOptions(
            ours,
            ALL.filter((a) => a !== d && a !== follow.theyTake),
          )}
          w={190}
        />
        <NativeSelect
          label="Their round-2 defender"
          disabled={follow.weTake === undefined}
          value={follow.theirR2 === undefined ? '' : String(follow.theirR2)}
          onChange={(ev) => {
            setFollow({ ...follow, theirR2: pickNumber(ev.currentTarget.value) });
          }}
          data={followOptions(
            theirs,
            ALL.filter((t) => t !== e && t !== follow.weTake),
          )}
          w={190}
        />
        <Button
          variant="default"
          onClick={() => {
            // The whole pairing starts over: our best send, nothing followed, no unlikely
            // choices shown, and (from the page) the suggested defenders.
            setSendKey(null);
            setPickedId(null);
            setFollow({});
            setShown({ ours: false, theirs: false });
            onClear?.();
          }}
        >
          Clear
        </Button>
      </Group>
      {tip && (
        <Paper role="region" aria-label="Tip" withBorder p="xs" radius="sm">
          <Text size="sm" fw={600}>
            Tip · {tip.step}
            {tip.same ? ' · any: they all come to the same' : ''}
            {mixed
              ? ` · the model mixes ${tip.options
                  .filter((o) => o.chance >= CHAIN_MIN_SHARE)
                  .map((o) => `${pct(o.chance)} ${army(tipPlayers[o.index])}`)
                  .join(' / ')}: about equally good, so don't be predictable`
              : ''}
          </Text>
          <Group gap="xl" mt={4}>
            {tip.options.map((o, i) => (
              <Stack key={o.index} gap={0}>
                <Group gap={6}>
                  <Text size="sm" fw={i === 0 ? 700 : 400}>
                    {army(tipPlayers[o.index])}
                  </Text>
                  {i === 0 && !mixed && !tip.same && (
                    <Text size="xs" c="teal">
                      {tip.safe === o.index
                        ? `recommended · guarantees ${o.worst.toFixed(1)}`
                        : 'recommended'}
                    </Text>
                  )}
                </Group>
                <Text size="xs" c="dimmed" className="numeric">
                  expected {o.expected.toFixed(1)} · best {o.best.toFixed(1)} · worst{' '}
                  {o.worst.toFixed(1)}
                </Text>
              </Stack>
            ))}
          </Group>
          <Table withRowBorders={false} fz="xs" mt="xs" w="auto" verticalSpacing={2}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th />
                {tip.replies.list.map((r) => (
                  <Table.Th key={r.index}>
                    If they {tip.replies.verb} {army(replyPlayers[r.index])} ({pct(r.chance)})
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tip.options.map((o) => (
                <Table.Tr key={o.index}>
                  <Table.Th scope="row">{army(tipPlayers[o.index])}</Table.Th>
                  {o.scores.map((v, j) => (
                    <Table.Td
                      key={j}
                      className="numeric"
                      style={{ fontWeight: bestAgainst(tip, j)?.index === o.index ? 700 : 400 }}
                    >
                      {v.toFixed(1)}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {even && (
            <Text size="xs" c="dimmed" mt={4}>
              Take {army(tipPlayers[even.above])} if they {tip.replies.verb}{' '}
              {army(replyPlayers[even.reply])} more than {pct(even.share)} of the time, otherwise{' '}
              {army(tipPlayers[even.below])}. The model thinks{' '}
              {pct(tip.replies.list[0]?.chance ?? 0)}.
            </Text>
          )}
          <Group align="flex-end" gap="sm" mt="xs">
            <NativeSelect
              label="Your read"
              size="xs"
              value={read === null ? '' : String(read)}
              onChange={(ev) => {
                const v = ev.currentTarget.value;
                setReadState(v === '' ? null : { key: tipKey, reply: Number(v) });
              }}
              data={[
                { value: '', label: 'No read' },
                ...tip.replies.list.map((r, j) => ({
                  value: String(j),
                  label: `They ${tip.replies.verb} ${army(replyPlayers[r.index])}`,
                })),
              ]}
              w={280}
            />
            {read === null && (
              <Text size="sm" fw={600}>
                {noRead}
              </Text>
            )}
            {readBest && read !== null && (
              <Text size="sm" fw={600}>
                If they {tip.replies.verb} {army(replyPlayers[tip.replies.list[read]?.index ?? -1])}
                : take {army(tipPlayers[readBest.index])} →{' '}
                {(readBest.scores[read] ?? 0).toFixed(1)}
              </Text>
            )}
          </Group>
        </Paper>
      )}
      <div style={{ overflowX: 'auto' }}>
        <svg
          ref={svgRef}
          role="group"
          aria-label={`Chain: you defend ${army(ours[d])}, they defend ${army(theirs[e])}, you send ${send.pair.map((a) => army(ours[a])).join(' + ')}`}
          width={layout.width}
          height={layout.height + 4}
          viewBox={`0 -2 ${layout.width} ${layout.height + 4}`}
          style={{ font: '11px var(--mantine-font-family)', display: 'block', margin: '0 auto' }}
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
                  stroke={box.id === flashId ? 'var(--mantine-color-text)' : stroke}
                  strokeWidth={box.id === flashId ? 3 : 1}
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
          {[...columns.values()].flatMap((list) =>
            list.flatMap((box, i) => [
              arrow(box, list[i - 1], 'up'),
              arrow(box, list[i + 1], 'down'),
            ]),
          )}
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
