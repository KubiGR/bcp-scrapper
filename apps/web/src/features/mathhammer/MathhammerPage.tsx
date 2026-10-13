import { Button, Group, Stack, Tabs, Title } from '@mantine/core';
import { useDeferredValue, useMemo, useState } from 'react';
import { AttackerPanel } from './AttackerPanel';
import { DefenderPanel } from './DefenderPanel';
import { calculateForm } from './best';
import { defaultForm } from './form-state';
import { ResultPanel, type Outcome } from './ResultPanel';
import { ResultSummary } from './ResultSummary';
import classes from './MathhammerPage.module.css';
import { SituationPanel } from './SituationPanel';

type Step = 'attacker' | 'defender' | 'result';

const STEPS: { value: Step; label: string }[] = [
  { value: 'attacker', label: 'Attacker' },
  { value: 'defender', label: 'Defender' },
  { value: 'result', label: 'Result' },
];

/** Back to the top of the page, for a step that's just opened. */
function toTop() {
  if (window.scrollY > 0) window.scrollTo({ top: 0 });
}

/** Exact chances for one unit's attacks into one target (11th edition). */
export function MathhammerPage() {
  const [form, setForm] = useState(defaultForm);
  // Typing stays quick while a big calculation catches up.
  const settled = useDeferredValue(form);
  const outcome = useMemo<Outcome>(() => calculateForm(settled), [settled]);
  const [step, setStep] = useState<Step>('attacker');

  const attacker = (
    <Stack gap="lg">
      <AttackerPanel form={form} best={'best' in outcome ? outcome.best : {}} onChange={setForm} />
      <SituationPanel
        situation={form.situation}
        onChange={(situation) => {
          setForm({ ...form, situation });
        }}
      />
    </Stack>
  );
  const defender = (
    <DefenderPanel
      defender={form.defender}
      onChange={(defender) => {
        setForm({ ...form, defender });
      }}
    />
  );
  const result = (
    <div role="region" aria-label="Full result">
      <ResultPanel outcome={outcome} form={settled} />
    </div>
  );
  const stepAt = STEPS.findIndex((s) => s.value === step);
  const back = STEPS[stepAt - 1];
  const next = STEPS[stepAt + 1];

  return (
    <Stack gap="lg">
      <Title order={1}>Mathhammer</Title>
      {/* One step at a time: attacker, then defender, then the result. */}
      <Tabs
        value={step}
        keepMounted={false}
        onChange={(value) => {
          const chosen = STEPS.find((s) => s.value === value);
          if (chosen) setStep(chosen.value);
        }}
      >
        <Tabs.List grow mb="lg">
          {STEPS.map((s, i) => (
            <Tabs.Tab key={s.value} value={s.value}>
              {`${String(i + 1)}. ${s.label}`}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="attacker">{attacker}</Tabs.Panel>
        <Tabs.Panel value="defender">{defender}</Tabs.Panel>
        <Tabs.Panel value="result">{result}</Tabs.Panel>
        <Group justify="space-between" mt="lg" className={classes.stepNav}>
          {back ? (
            <Button
              variant="default"
              onClick={() => {
                setStep(back.value);
              }}
            >
              {`Back: ${back.label}`}
            </Button>
          ) : (
            <span />
          )}
          {next && (
            <Button
              onClick={() => {
                setStep(next.value);
                toTop();
              }}
            >
              {`Next: ${next.label}`}
            </Button>
          )}
        </Group>
      </Tabs>
      {/* Away from the result, its headline numbers stay at the bottom. */}
      {step !== 'result' && (
        <ResultSummary
          outcome={outcome}
          onShow={() => {
            setStep('result');
            toTop();
          }}
        />
      )}
    </Stack>
  );
}
