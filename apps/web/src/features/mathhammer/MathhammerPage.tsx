import { Button, Grid, Group, SegmentedControl, Stack, Tabs, Text, Title } from '@mantine/core';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AttackerPanel } from './AttackerPanel';
import { DefenderPanel } from './DefenderPanel';
import { calculateForm } from './best';
import { defaultForm } from './form-state';
import { ResultPanel, type Outcome } from './ResultPanel';
import { ResultSummary } from './ResultSummary';
import classes from './MathhammerPage.module.css';
import { SituationPanel } from './SituationPanel';

/** Whether the element is on screen (always false where the browser can't tell). */
function useInView(ref: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry?.isIntersecting ?? false);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return inView;
}

type Layout = 'columns' | 'steps';
type Step = 'attacker' | 'defender' | 'result';

const LAYOUT = 'mathhammer:layout';
const STEPS: { value: Step; label: string }[] = [
  { value: 'attacker', label: 'Attacker' },
  { value: 'defender', label: 'Defender' },
  { value: 'result', label: 'Result' },
];

function savedLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT) === 'steps' ? 'steps' : 'columns';
  } catch {
    return 'columns';
  }
}

function saveLayout(layout: Layout) {
  try {
    localStorage.setItem(LAYOUT, layout);
  } catch {
    // Not remembered, still switched.
  }
}

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
  const resultRef = useRef<HTMLDivElement>(null);
  const resultInView = useInView(resultRef);
  const [layout, setLayout] = useState(savedLayout);
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
    <div ref={resultRef} className={classes.result} role="region" aria-label="Full result">
      <ResultPanel outcome={outcome} form={settled} />
    </div>
  );
  const stepAt = STEPS.findIndex((s) => s.value === step);
  const back = STEPS[stepAt - 1];
  const next = STEPS[stepAt + 1];
  // While the full result is out of view, its headline numbers stay at the bottom.
  const showSummary = layout === 'steps' ? step !== 'result' : !resultInView;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" gap="sm">
        <Stack gap={4}>
          <Title order={1}>Mathhammer</Title>
          <Text size="sm" c="dimmed">
            Exact chances, worked out from the dice by 11th-edition rules.
          </Text>
        </Stack>
        <SegmentedControl
          size="xs"
          aria-label="Layout"
          value={layout}
          onChange={(value) => {
            const chosen = value === 'steps' ? 'steps' : 'columns';
            setLayout(chosen);
            saveLayout(chosen);
          }}
          data={[
            { value: 'columns', label: 'Side by side' },
            { value: 'steps', label: 'Steps' },
          ]}
        />
      </Group>
      {layout === 'steps' ? (
        // One step at a time: attacker, then defender, then the result.
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
      ) : (
        // Attacker | defender side by side on wide screens, the result under the defender.
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, lg: 7 }}>{attacker}</Grid.Col>
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Stack gap="lg">
              {defender}
              {result}
            </Stack>
          </Grid.Col>
        </Grid>
      )}
      {showSummary && (
        <ResultSummary
          outcome={outcome}
          onShow={() => {
            if (layout === 'steps') {
              setStep('result');
              toTop();
            } else {
              resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
        />
      )}
    </Stack>
  );
}
