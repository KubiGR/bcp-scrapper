import { Stack, Text, Title } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { Panel } from '../components/Panel';

export const Route = createFileRoute('/')({ component: TournamentsPage });

function TournamentsPage() {
  return (
    <Stack gap="lg">
      <Title order={1}>Tournaments</Title>
      <Panel title="Systems online">
        <Text>
          The data layer is operational. The tournament finder is the next build phase; until then,
          check the BCP uplink under Settings.
        </Text>
      </Panel>
    </Stack>
  );
}
