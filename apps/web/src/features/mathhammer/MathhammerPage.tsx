import { Grid, Stack, Text, Title } from '@mantine/core';
import { useDeferredValue, useMemo, useState } from 'react';
import { AttackerPanel } from './AttackerPanel';
import { DefenderPanel } from './DefenderPanel';
import { calculateForm } from './best';
import { defaultForm } from './form-state';
import { ResultPanel, type Outcome } from './ResultPanel';
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
            <ResultPanel outcome={outcome} />
            <DefenderPanel
              defender={form.defender}
              onChange={(defender) => {
                setForm({ ...form, defender });
              }}
            />
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
