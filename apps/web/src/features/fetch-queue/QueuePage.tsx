import type { QueueDetails } from '@bcp/shared';
import { Accordion, Button, Card, Group, Stack, Table, Text, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnchorLink } from '../../components/AnchorLink';
import { formatDateTime } from '../../lib/format';
import { failureReason } from './failure-reasons';
import { fetchQueueQuery, queueDetailsQuery, retryFailed } from './fetch-queue-queries';
import { QueueControls } from './QueueControls';

type Job = QueueDetails['next'][number];
type Failure = QueueDetails['failures'][number];

/** "Ada Archer", "Round 4" or "Event load": what a job fetches. */
function whatOf(job: Pick<Job, 'kind' | 'playerName' | 'round'>): string {
  switch (job.kind) {
    case 'list':
      return job.playerName ?? 'A list';
    case 'pairings-round':
      return job.round === null ? 'Pairings' : `Round ${String(job.round)}`;
    case 'event':
      return 'Event load';
  }
}

function EventLink({ job }: { job: Pick<Job, 'eventId' | 'eventName'> }) {
  return (
    <AnchorLink to="/events/$eventId" params={{ eventId: job.eventId }} search={{ tab: 'players' }}>
      {job.eventName}
    </AnchorLink>
  );
}

function FailureGroup({ failure }: { failure: Failure }) {
  const queryClient = useQueryClient();
  const { label, explanation } = failureReason(failure.code);
  const retry = useMutation({
    mutationFn: () => retryFailed(undefined, undefined, failure.code),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fetch-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['event'] }),
      ]),
  });
  return (
    <Accordion.Item value={failure.code}>
      <Group wrap="nowrap" gap="xs" pr="sm">
        <Accordion.Control>
          {label} · <span className="numeric">{failure.count}</span>
        </Accordion.Control>
        {!failure.final && (
          <Button
            size="xs"
            variant="light"
            aria-label={`Retry ${label}`}
            loading={retry.isPending}
            onClick={() => {
              retry.mutate();
            }}
          >
            Retry
          </Button>
        )}
      </Group>
      <Text size="sm" c="dimmed" px="md" pb="xs">
        {explanation}
      </Text>
      {retry.error && (
        <Text size="sm" c="red" px="md" pb="xs">
          {retry.error.message}
        </Text>
      )}
      <Accordion.Panel>
        <Table.ScrollContainer minWidth={560}>
          <Table aria-label={label} striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Event</Table.Th>
                <Table.Th>What</Table.Th>
                <Table.Th>Error</Table.Th>
                <Table.Th>Tries</Table.Th>
                <Table.Th>When</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {failure.jobs.map((job) => (
                <Table.Tr key={job.id}>
                  <Table.Td>
                    <EventLink job={job} />
                  </Table.Td>
                  <Table.Td>{whatOf(job)}</Table.Td>
                  <Table.Td>{job.error ?? '–'}</Table.Td>
                  <Table.Td className="numeric">{job.attempts}</Table.Td>
                  <Table.Td>{job.failedAt ? formatDateTime(job.failedAt) : '–'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {failure.count > failure.jobs.length && (
          <Text size="sm" c="dimmed" mt="xs">
            The latest {failure.jobs.length} of {failure.count}.
          </Text>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
}

/** The fetch queue in full: its totals, failures grouped by reason, and what runs next. */
export function QueuePage() {
  const { data: state } = useQuery(fetchQueueQuery);
  const { data: details, error } = useQuery(queueDetailsQuery);
  return (
    <Stack gap="lg">
      <Title order={1}>Queue</Title>
      {state && (
        <Card withBorder>
          <QueueControls state={state} />
        </Card>
      )}
      {error && <Text c="red">{error.message}</Text>}
      {details && (
        <>
          <Stack gap="xs">
            <Title order={2}>Failures</Title>
            {details.failures.length === 0 ? (
              <Text c="dimmed">Nothing has failed.</Text>
            ) : (
              <Accordion variant="separated" multiple>
                {details.failures.map((failure) => (
                  <FailureGroup key={failure.code} failure={failure} />
                ))}
              </Accordion>
            )}
          </Stack>
          <Stack gap="xs">
            <Title order={2}>Up next</Title>
            {details.next.length === 0 ? (
              <Text c="dimmed">Nothing is waiting.</Text>
            ) : (
              <Table.ScrollContainer minWidth={480}>
                <Table aria-label="Up next" striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>For</Table.Th>
                      <Table.Th>Event</Table.Th>
                      <Table.Th>What</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {details.next.map((job) => (
                      <Table.Tr key={job.id}>
                        <Table.Td>{job.status === 'fetching' ? 'Fetching' : 'Queued'}</Table.Td>
                        <Table.Td>{job.origin === 'user' ? 'You' : 'Background'}</Table.Td>
                        <Table.Td>
                          <EventLink job={job} />
                        </Table.Td>
                        <Table.Td>{whatOf(job)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </>
      )}
    </Stack>
  );
}
