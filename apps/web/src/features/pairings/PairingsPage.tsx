import {
  analysePairing,
  pointsMatrix,
  type PairingAnalysis,
  type PairingRating,
  type PairingRosterPlayer,
} from '@bcp/shared';
import { Button, Container, Group, Modal, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { SearchSelect } from '../../components/SearchSelect';
import { Panel } from '../../components/Panel';
import type { ChainFollow, ChainShown } from './chain-layout';
import { ChainFlow } from './ChainFlow';
import { DefenderGrid } from './DefenderGrid';
import { FetchListsButton } from './FetchListsButton';
import { byDisposition } from './disposition-style';
import { withRuledOut } from './ruled-out';
import { PairingSummary } from './PairingSummary';
import { PasteBox } from './PasteBox';
import { RatingsTable } from './RatingsTable';
import {
  altPlan,
  ratePlan,
  readPlan,
  savedPlan,
  savedPlans,
  writePlan,
  type SheetPlan,
} from './sheet-plan';
import { TeamPicker } from './TeamPicker';
import { usedPlayers } from './used-players';

/** The page is full width for the chain; everything else keeps the usual centred column. */
const Column = ({ children }: { children: ReactNode }) => (
  <Container size="xl" px={0} w="100%">
    {children}
  </Container>
);

/**
 * The pairings planner: paste the ratings from the team's sheet and see how the pairing is likely
 * to go. The last sheet (and any chips changed here) is kept in this browser.
 */
export function PairingsPage() {
  const [plan, setPlan] = useState<SheetPlan | null>(readPlan);
  const use = (next: SheetPlan) => {
    setPlan(next);
    writePlan(next);
  };
  if (!plan) {
    return (
      <Column>
        <Stack gap="lg">
          <Title order={2}>Pairings</Title>
          <Panel title="From the tournament">
            <TeamPicker
              onUse={(next) => {
                use(withSavedRatings(next));
              }}
            />
          </Panel>
          <Panel title="Paste from your sheet">
            <PasteBox onUse={use} />
          </Panel>
        </Stack>
      </Column>
    );
  }
  // Each pairing starts fresh: nothing followed, no defender ruled out.
  return <Planner key={keyOf(plan)} plan={plan} use={use} />;
}

const pairingName = (p: SheetPlan) =>
  `${p.source?.eventName ?? 'Event'} · ${p.source?.teamName ?? '?'} v ${p.source?.opponentName ?? '?'}`;
const keyOf = (p: SheetPlan) =>
  p.source ? `${p.source.event}|${p.source.team}|${p.source.opponent}` : '';

/** The pairings of event teams kept in this browser, to reopen one with its ratings. */
function SavedPairings({
  current,
  onOpen,
}: {
  current: SheetPlan;
  onOpen: (plan: SheetPlan) => void;
}) {
  const saved = savedPlans();
  if (saved.length === 0) return null;
  return (
    <SearchSelect
      aria-label="Saved pairings"
      placeholder="Saved pairings"
      size="xs"
      w={{ base: '100%', xs: 300 }}
      value={keyOf(current) || null}
      onChange={(key) => {
        const plan = saved.find((p) => keyOf(p) === key);
        if (plan) onOpen(plan);
      }}
      data={saved.map((p) => ({
        value: keyOf(p),
        label: `${pairingName(p)} · ${String(p.ratings.length)} rated`,
      }))}
    />
  );
}

/** Teams picked again: the ratings given before for this pairing come back. */
function withSavedRatings(plan: SheetPlan): SheetPlan {
  const saved = plan.source ? savedPlan(plan.source) : null;
  if (!saved) return plan;
  const ours = new Set(plan.ours.map((p) => p.id));
  const theirs = new Set(plan.theirs.map((p) => p.id));
  return {
    ...plan,
    ratings: saved.ratings.filter((r) => ours.has(r.playerId) && theirs.has(r.opponentPlayerId)),
  };
}

/** The pasted sheet, its analysis and a live pairing being followed. */
function Planner({ plan, use }: { plan: SheetPlan; use: (next: SheetPlan) => void }) {
  const [pasting, setPasting] = useState(false);
  const [picking, setPicking] = useState(false);
  const { ratings, source } = plan;
  // Grouped by disposition, both sides in the same order (ratings follow the players).
  const ours = byDisposition(plan.ours);
  const theirs = byDisposition(plan.theirs);
  const { points, rated } = pointsMatrix(
    ours.map((p) => p.id),
    theirs.map((p) => p.id),
    ratings,
  );
  const key = JSON.stringify(points);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `points` (same numbers, new array each render).
  const analysis = useMemo(() => analysePairing(points), [key]);
  const [square, setSquare] = useState<{ d: number; e: number } | null>(null);
  // Their defenders ruled out in the grid: the summary and the suggested square follow.
  const [ruledOut, setRuledOut] = useState<ReadonlySet<number>>(new Set());
  const view = withRuledOut(analysis, ruledOut);
  const selected = square ?? {
    d: view.safeDefender.index,
    e: view.theirDefender.indexOf(Math.max(...view.theirDefender)),
  };
  // The live pairing: kept here so the ratings table can grey out who's used up.
  const [follow, setFollow] = useState<ChainFollow>({});
  const [shown, setShown] = useState<ChainShown>({ ours: false, theirs: false });
  const choose = (d: number, e: number) => {
    setSquare({ d, e });
    setFollow({});
  };
  return (
    <Stack gap="lg">
      <Column>
        <Title order={2}>Pairings</Title>
        {source && (
          <Text c="dimmed" size="sm">
            {pairingName(plan)}
          </Text>
        )}
      </Column>
      <Column>
        <Panel title="Rate the games">
          <Stack gap="xs">
            <RatingsTable
              ours={ours}
              theirs={theirs}
              ratings={ratings}
              used={usedPlayers(selected.d, selected.e, follow)}
              onRate={(playerId, opponentPlayerId, chip) => {
                use(ratePlan(plan, playerId, opponentPlayerId, chip));
              }}
              onAlt={(playerId, opponentPlayerId, alt) => {
                use(altPlan(plan, playerId, opponentPlayerId, alt));
              }}
            />
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {rated} of 25 rated{rated < 25 ? ' · unrated games count as Y (even)' : ''} · saved
                in this browser
              </Text>
              <Group gap="xs">
                <SavedPairings current={plan} onOpen={use} />
                <FetchListsButton plan={plan} onRefresh={use} />
                <Button
                  variant="default"
                  size="xs"
                  onClick={() => {
                    setPicking(true);
                  }}
                >
                  Pick teams
                </Button>
                <Button
                  variant="default"
                  size="xs"
                  onClick={() => {
                    setPasting(true);
                  }}
                >
                  {source ? 'Paste from sheet' : 'Paste again'}
                </Button>
              </Group>
            </Group>
          </Stack>
        </Panel>
      </Column>
      <Modal
        opened={pasting}
        onClose={() => {
          setPasting(false);
        }}
        title="Paste from your sheet"
        size="lg"
      >
        <PasteBox
          onto={source ? plan : undefined}
          onUse={(next) => {
            use(next);
            setPasting(false);
          }}
        />
      </Modal>
      <Modal
        opened={picking}
        onClose={() => {
          setPicking(false);
        }}
        title="Pick the teams"
        size="xl"
      >
        <TeamPicker
          onUse={(next) => {
            use(withSavedRatings(next));
            setPicking(false);
          }}
        />
      </Modal>
      <Analysis
        analysis={analysis}
        ours={ours}
        theirs={theirs}
        ratings={ratings}
        selected={selected}
        onSelect={choose}
        follow={follow}
        onFollowChange={setFollow}
        onClear={() => {
          setSquare(null);
          setFollow({});
          setShown({ ours: false, theirs: false });
          setRuledOut(new Set());
        }}
        shown={shown}
        onShownChange={setShown}
        ruledOut={ruledOut}
        onRuledOutChange={setRuledOut}
      />
    </Stack>
  );
}

/** Everything worked out from the ratings: re-solved whenever a chip changes. */
function Analysis({
  analysis,
  ours,
  theirs,
  ratings,
  selected,
  onSelect,
  follow,
  onFollowChange,
  onClear,
  shown,
  onShownChange,
  ruledOut,
  onRuledOutChange,
}: {
  analysis: PairingAnalysis;
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  ratings: PairingRating[];
  selected: { d: number; e: number };
  onSelect: (d: number, e: number) => void;
  follow: ChainFollow;
  onFollowChange: (follow: ChainFollow) => void;
  onClear: () => void;
  shown: ChainShown;
  onShownChange: (shown: ChainShown) => void;
  ruledOut: ReadonlySet<number>;
  onRuledOutChange: (ruledOut: ReadonlySet<number>) => void;
}) {
  return (
    <>
      <Column>
        <Panel title="Summary">
          <PairingSummary analysis={analysis} ours={ours} theirs={theirs} ruledOut={ruledOut} />
        </Panel>
      </Column>
      <Column>
        <Panel title="Round 1 defenders">
          <DefenderGrid
            analysis={analysis}
            ours={ours}
            theirs={theirs}
            selected={selected}
            onSelect={onSelect}
            ruledOut={ruledOut}
            onRuledOutChange={onRuledOutChange}
          />
        </Panel>
      </Column>
      {/* At least the column's width, growing with the diagram up to the screen's. */}
      <Panel
        title="The chain"
        style={{
          width: 'fit-content',
          minWidth: 'min(100%, var(--container-size-xl))',
          maxWidth: '100%',
          marginInline: 'auto',
        }}
      >
        <ChainFlow
          key={`${String(selected.d)}-${String(selected.e)}`}
          analysis={analysis}
          ours={ours}
          theirs={theirs}
          ratings={ratings}
          d={selected.d}
          e={selected.e}
          onDefendersChange={onSelect}
          follow={follow}
          onFollowChange={onFollowChange}
          onClear={onClear}
          shown={shown}
          onShownChange={onShownChange}
        />
      </Panel>
    </>
  );
}
