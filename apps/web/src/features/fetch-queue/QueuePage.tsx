import type { QueueDetails } from '@bcp/shared';
import { Accordion, Badge, Button, Group, Stack, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnchorLink } from '../../components/AnchorLink';
import { Panel } from '../../components/Panel';
import {
  Card,
  CardGroup,
  PageTitle,
  scoreboardClasses,
  SidebarLayout,
} from '../../components/Scoreboard';
import classes from './QueuePage.module.css';
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

const KIND_LABEL: Record<Job['kind'], string> = {
  list: 'List',
  'pairings-round': 'Pairings',
  event: 'Event',
};

/** One job as a compact card: its kind, what and for which event, and a note on the right. */
function JobCard({
  job,
  note,
  noteColor,
}: {
  job: Pick<Job, 'kind' | 'playerName' | 'round' | 'eventId' | 'eventName'>;
  note: string;
  noteColor?: string;
}) {
  return (
    <div role="listitem">
      <Card dense>
        <Badge variant="outline" color="gray" className={classes.kind}>
          {KIND_LABEL[job.kind]}
        </Badge>
        <div className={classes.what}>
          <Text size="sm" fw={600}>
            {whatOf(job)}
          </Text>
          <Text size="xs">
            <EventLink job={job} />
          </Text>
        </div>
        <Text size="xs" c={noteColor ?? 'dimmed'} className={classes.note}>
          {note}
        </Text>
      </Card>
    </div>
  );
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
        <div role="list" aria-label={label} className={scoreboardClasses.group} data-dense>
          {failure.jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              note={[
                job.error ?? 'No error given',
                `${String(job.attempts)} ${job.attempts === 1 ? 'try' : 'tries'}`,
                job.failedAt ? formatDateTime(job.failedAt) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              noteColor="red.3"
            />
          ))}
        </div>
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
  const failed = details?.failures.reduce((sum, failure) => sum + failure.count, 0) ?? 0;
  return (
    <SidebarLayout
      sidebarLabel="Queue controls"
      sidebar={state && <Panel title="Queue">{<QueueControls state={state} />}</Panel>}
    >
      <Stack gap="xl">
        <PageTitle>Queue</PageTitle>
        {error && <Text c="red">{error.message}</Text>}
        {details && (
          <>
            <CardGroup label={String(failed)} description="Failures" ariaLabel="Failures">
              {details.failures.length === 0 ? (
                <Text c="dimmed">Nothing has failed.</Text>
              ) : (
                <Accordion variant="separated" multiple>
                  {details.failures.map((failure) => (
                    <FailureGroup key={failure.code} failure={failure} />
                  ))}
                </Accordion>
              )}
            </CardGroup>
            <CardGroup
              label={String(details.next.length)}
              description="Up next"
              ariaLabel="Up next jobs"
            >
              {details.next.length === 0 ? (
                <Text c="dimmed">Nothing is waiting.</Text>
              ) : (
                <div
                  role="list"
                  aria-label="Up next"
                  className={scoreboardClasses.group}
                  data-dense
                >
                  {details.next.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      note={`${job.status === 'fetching' ? 'Fetching' : 'Queued'} · ${job.origin === 'user' ? 'You' : 'Background'}`}
                      noteColor={job.status === 'fetching' ? 'neon.4' : undefined}
                    />
                  ))}
                </div>
              )}
            </CardGroup>
          </>
        )}
      </Stack>
    </SidebarLayout>
  );
}
