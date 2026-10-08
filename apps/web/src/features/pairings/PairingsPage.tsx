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
import { Panel } from '../../components/Panel';
import type { ChainFollow } from './chain-layout';
import { ChainFlow } from './ChainFlow';
import { DefenderGrid } from './DefenderGrid';
import { PairingSummary } from './PairingSummary';
import { PasteBox } from './PasteBox';
import { RatingsTable } from './RatingsTable';
import { altPlan, ratePlan, readPlan, writePlan, type SheetPlan } from './sheet-plan';
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
          <Panel title="Paste from your sheet">
            <PasteBox onUse={use} />
          </Panel>
        </Stack>
      </Column>
    );
  }
  return <Planner plan={plan} use={use} />;
}

/** The pasted sheet, its analysis and a live pairing being followed. */
function Planner({ plan, use }: { plan: SheetPlan; use: (next: SheetPlan) => void }) {
  const [pasting, setPasting] = useState(false);
  const { ours, theirs, ratings } = plan;
  const { points, rated } = pointsMatrix(
    ours.map((p) => p.id),
    theirs.map((p) => p.id),
    ratings,
  );
  const key = JSON.stringify(points);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `points` (same numbers, new array each render).
  const analysis = useMemo(() => analysePairing(points), [key]);
  const [square, setSquare] = useState<{ d: number; e: number } | null>(null);
  const selected = square ?? {
    d: analysis.safeDefender.index,
    e: analysis.theirDefender.indexOf(Math.max(...analysis.theirDefender)),
  };
  // The live pairing: kept here so the ratings table can grey out who's used up.
  const [follow, setFollow] = useState<ChainFollow>({});
  const choose = (d: number, e: number) => {
    setSquare({ d, e });
    setFollow({});
  };
  return (
    <Stack gap="lg">
      <Column>
        <Title order={2}>Pairings</Title>
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
                {rated} of 25 rated{rated < 25 ? ' · unrated games count as Y (even)' : ''}
              </Text>
              <Button
                variant="default"
                size="xs"
                onClick={() => {
                  setPasting(true);
                }}
              >
                Paste again
              </Button>
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
          onUse={(next) => {
            use(next);
            setPasting(false);
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
        }}
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
}) {
  return (
    <>
      <Column>
        <Panel title="Summary">
          <PairingSummary analysis={analysis} ours={ours} theirs={theirs} />
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
        />
      </Panel>
    </>
  );
}
