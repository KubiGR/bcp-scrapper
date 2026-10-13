import { Grid, Stack, Text, Title } from '@mantine/core';
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

/** Exact chances for one unit's attacks into one target (11th edition). */
export function MathhammerPage() {
  const [form, setForm] = useState(defaultForm);
  // Typing stays quick while a big calculation catches up.
  const settled = useDeferredValue(form);
  const outcome = useMemo<Outcome>(() => calculateForm(settled), [settled]);
  const resultRef = useRef<HTMLDivElement>(null);
  const resultInView = useInView(resultRef);

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={1}>Mathhammer</Title>
        <Text size="sm" c="dimmed">
          Exact chances, worked out from the dice by 11th-edition rules.
        </Text>
      </Stack>
      {/* Attacker | defender side by side on wide screens, the result under the defender. */}
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Stack gap="lg">
            <AttackerPanel
              form={form}
              best={'best' in outcome ? outcome.best : {}}
              onChange={setForm}
            />
            <SituationPanel
              situation={form.situation}
              onChange={(situation) => {
                setForm({ ...form, situation });
              }}
            />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack gap="lg">
            <DefenderPanel
              defender={form.defender}
              onChange={(defender) => {
                setForm({ ...form, defender });
              }}
            />
            <div ref={resultRef} className={classes.result} role="region" aria-label="Full result">
              <ResultPanel outcome={outcome} form={settled} />
            </div>
          </Stack>
        </Grid.Col>
      </Grid>
      {/* While the full result is out of view, its headline numbers stay at the bottom. */}
      {!resultInView && (
        <ResultSummary
          outcome={outcome}
          onShow={() => {
            resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
      )}
    </Stack>
  );
}
