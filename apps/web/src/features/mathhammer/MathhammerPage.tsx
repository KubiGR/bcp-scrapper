import { Grid, Stack, Text, Title } from '@mantine/core';
import { useDeferredValue, useMemo, useState } from 'react';
import { AttackerPanel } from './AttackerPanel';
import { DefenderPanel } from './DefenderPanel';
import { calculateForm } from './best';
import { defaultForm } from './form-state';
import { ResultPanel, type Outcome } from './ResultPanel';
import classes from './MathhammerPage.module.css';
import { SituationPanel } from './SituationPanel';

/** Exact chances for one unit's attacks into one target (11th edition). */
export function MathhammerPage() {
  const [form, setForm] = useState(defaultForm);
  // Typing stays quick while a big calculation catches up.
  const settled = useDeferredValue(form);
  const outcome = useMemo<Outcome>(() => calculateForm(settled), [settled]);

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={1}>Mathhammer</Title>
        <Text size="sm" c="dimmed">
          Exact chances, worked out from the dice by 11th-edition rules.
        </Text>
      </Stack>
      {/* Wide screens: attacker | defender | result, the result kept in view while scrolling. */}
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 5 }}>
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
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <DefenderPanel
            defender={form.defender}
            onChange={(defender) => {
              setForm({ ...form, defender });
            }}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 3 }}>
          <div className={classes.result}>
            <ResultPanel outcome={outcome} form={settled} />
          </div>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
