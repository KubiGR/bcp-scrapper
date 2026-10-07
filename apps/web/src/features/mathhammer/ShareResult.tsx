import type { Calculation, CalculationResult } from '@bcp/shared';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { toBlob } from 'html-to-image';
import { useRef, useState } from 'react';
import { Breakdown } from './Breakdown';
import { DamageChart } from './DamageChart';
import type { MathhammerForm } from './form-state';
import { expectedStat, percent } from './ResultPanel';
import classes from './ShareResult.module.css';
import { appliedModifiers, defenderSummary, modLabels, weaponSummary } from './share-summary';

interface ShareProps {
  /** The page's form: names, phase, and what was changed from the datasheets. */
  form: MathhammerForm;
  calculation: Calculation;
  result: CalculationResult;
}

/** The result as one card: matchup, profiles as used, modifiers, numbers and the damage graph. */
function ShareCard({ form, calculation, result }: ShareProps) {
  const attacker = form.source ?? 'Attacker';
  const defender = form.defender.source ?? 'Defender';
  const { phase } = form;
  const target = defenderSummary(calculation.defender);
  const applied = appliedModifiers(form);
  // The unit's own switches are listed once, under Modifiers applied, not on every weapon.
  const unitLabels = new Set(modLabels(form.unit));
  const numbers: [string, { value: string; note?: string }][] = [
    ['Models slain', expectedStat(result.modelsSlain, result.averages.modelsSlain)],
    ['Wounds dealt', expectedStat(result.woundsDealt, result.averages.woundsDealt)],
    ['Wipe', { value: percent(result.wipe) }],
  ];
  return (
    <Stack gap="sm">
      <div>
        <Text fw={700} size="lg">{`${attacker} → ${defender}`}</Text>
        <Text size="xs" c="dimmed">
          {phase === 'fighting' ? 'Fighting' : 'Shooting'}
        </Text>
      </div>
      <div className={classes.section}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          Attacker
        </Text>
        {calculation.weapons.map((weapon, index) => {
          const summary = weaponSummary(weapon);
          const w = { ...summary, tags: summary.tags.filter((tag) => !unitLabels.has(tag)) };
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
      {applied.length > 0 && (
        <div className={classes.section}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            Modifiers applied
          </Text>
          {applied.map((line) => (
            <Text key={line} size="sm">
              {line}
            </Text>
          ))}
        </div>
      )}
      <Group gap="xl" align="flex-start">
        {numbers.map(([label, { value, note }]) => (
          <div key={label}>
            <Text size="xs" c="dimmed">
              {label}
            </Text>
            <Text size="lg" fw={700} className="numeric">
              {value}
            </Text>
            {note !== undefined && (
              <Text size="xs" c="dimmed" className="numeric">
                {note}
              </Text>
            )}
          </div>
        ))}
      </Group>
      <DamageChart woundsDealt={result.woundsDealt} />
      <Breakdown steps={result.breakdown} fit />
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
        size={860}
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
