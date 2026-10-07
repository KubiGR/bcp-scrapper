import type { Calculation, CalculationResult } from '@bcp/shared';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { toBlob } from 'html-to-image';
import { useRef, useState } from 'react';
import { DamageChart, quartiles } from './DamageChart';
import { percent } from './ResultPanel';
import classes from './ShareResult.module.css';
import { defenderSummary, situationLabels, weaponSummary } from './share-summary';

interface ShareProps {
  calculation: Calculation;
  result: CalculationResult;
  attacker: string;
  defender: string;
  phase: 'shooting' | 'fighting';
}

/** The result as one card: matchup, profiles as used, modifiers, numbers and the damage graph. */
function ShareCard({ calculation, result, attacker, defender, phase }: ShareProps) {
  const target = defenderSummary(calculation.defender);
  const situation = situationLabels(calculation.situation);
  const qs = quartiles(result.woundsDealt);
  const numbers: [string, string][] = [
    ['Wounds dealt', result.averages.woundsDealt.toFixed(2)],
    ['Models slain', result.averages.modelsSlain.toFixed(2)],
    ['Wipe', percent(result.wipe)],
    ['Median damage', String(qs[1])],
  ];
  return (
    <Stack gap="sm">
      <div>
        <Text fw={700} size="lg">{`${attacker} → ${defender}`}</Text>
        <Text size="xs" c="dimmed">
          {[phase === 'fighting' ? 'Fighting' : 'Shooting', ...situation].join(' · ')}
        </Text>
      </div>
      <div className={classes.section}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Attacker
        </Text>
        {calculation.weapons.map((weapon, index) => {
          const w = weaponSummary(weapon);
          return (
            <div key={`${weapon.name}-${String(index)}`} className={classes.row}>
              <Text size="sm" fw={600}>
                {w.name}
              </Text>
              <Text size="sm" className="numeric">
                {w.stats}
              </Text>
              {w.tags.length > 0 && (
                <Text size="xs" c="dimmed">
                  {w.tags.join(' · ')}
                </Text>
              )}
            </div>
          );
        })}
        {calculation.flatMortals !== null && (
          <Text size="sm">{`Mortal wounds: ${calculation.flatMortals}`}</Text>
        )}
      </div>
      <div className={classes.section}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Defender
        </Text>
        {target.models.map((line) => (
          <Text key={line} size="sm" className="numeric">
            {line}
          </Text>
        ))}
        {target.tags.length > 0 && (
          <Text size="xs" c="dimmed">
            {target.tags.join(' · ')}
          </Text>
        )}
      </div>
      <Group gap="xl">
        {numbers.map(([label, value]) => (
          <div key={label}>
            <Text size="xs" c="dimmed">
              {label}
            </Text>
            <Text size="lg" fw={700} className="numeric">
              {value}
            </Text>
          </div>
        ))}
      </Group>
      <DamageChart woundsDealt={result.woundsDealt} />
      <Text size="xs" c="dimmed" ta="right">
        BCP Analyzer · Mathhammer · exact chances
      </Text>
    </Stack>
  );
}

const imageOf = (node: HTMLElement) =>
  toBlob(node, {
    pixelRatio: 2,
    backgroundColor: getComputedStyle(node).backgroundColor,
  });

/** "Share": the result as an image card, to copy (and paste anywhere) or download. */
export function ShareResult(props: ShareProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  const run = async (action: (blob: Blob) => Promise<string>) => {
    if (card.current === null) return;
    setBusy(true);
    setStatus(null);
    try {
      const blob = await imageOf(card.current);
      if (blob === null) throw new Error('The image couldn’t be made');
      setStatus({ ok: true, text: await action(blob) });
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="xs"
        variant="light"
        onClick={() => {
          setStatus(null);
          setOpen(true);
        }}
      >
        Share
      </Button>
      <Modal
        opened={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Share result"
        size={760}
      >
        <Stack gap="md">
          <div ref={card} className={classes.card} data-testid="share-card">
            <ShareCard {...props} />
          </div>
          <Group gap="xs">
            <Button
              size="xs"
              loading={busy}
              onClick={() => {
                void run(async (blob) => {
                  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                  return 'Copied: paste it into a chat or post';
                });
              }}
            >
              Copy image
            </Button>
            <Button
              size="xs"
              variant="light"
              loading={busy}
              onClick={() => {
                void run((blob) => {
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'mathhammer.png';
                  link.click();
                  URL.revokeObjectURL(url);
                  return Promise.resolve('Downloaded mathhammer.png');
                });
              }}
            >
              Download PNG
            </Button>
          </Group>
          {status !== null &&
            (status.ok ? (
              <Text size="sm" c="dimmed">
                {status.text}
              </Text>
            ) : (
              <Alert color="red">{`Couldn’t share: ${status.text}. Try Download PNG.`}</Alert>
            ))}
        </Stack>
      </Modal>
    </>
  );
}
