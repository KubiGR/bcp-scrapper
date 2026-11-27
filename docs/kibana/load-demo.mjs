import assert from 'node:assert/strict';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

const elasticsearch = 'http://127.0.0.1:19200';
const kibana = 'http://127.0.0.1:15601';
const index = 'logis-fetch-demo';
const dashboardId = 'logis-fetch-queue-learning';
const logFile = process.argv[2];

assert.ok(logFile, 'Usage: node docs/kibana/load-demo.mjs <fixture-logs.ndjson>');
const events = (await readFile(logFile, 'utf8'))
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))
  .filter((log) => log.module === 'fetch-queue' && log.msg === 'Fetch queue job')
  .map(({ time, jobId, attempt, kind, status, durationMs }) => ({
    '@timestamp': new Date(time).toISOString(),
    jobId,
    attempt,
    kind,
    status,
    durationMs,
  }));

assert.deepEqual(
  events.map(({ jobId, attempt, status }) => [jobId, attempt, status]),
  [
    [1, 1, 'retry'],
    [1, 2, 'fetched'],
    [2, 1, 'failed'],
  ],
  'Expected the three events from the fixture worker',
);

async function request(url, method, payload, contentType = 'application/json') {
  const response = await globalThis.fetch(url, {
    method,
    headers: { 'content-type': contentType, 'kbn-xsrf': 'logis-demo' },
    body: contentType === 'application/json' ? JSON.stringify(payload) : payload,
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${url} returned ${response.status}: ${JSON.stringify(result)}`);
  }
  return result;
}

const indexUrl = `${elasticsearch}/${index}`;
const indexStatus = await globalThis.fetch(indexUrl, { method: 'HEAD' });
if (indexStatus.status === 404) {
  await request(indexUrl, 'PUT', {
    settings: { number_of_replicas: 0 },
    mappings: {
      properties: {
        '@timestamp': { type: 'date' },
        jobId: { type: 'long' },
        attempt: { type: 'integer' },
        kind: { type: 'keyword' },
        status: { type: 'keyword' },
        durationMs: { type: 'long' },
      },
    },
  });
} else {
  assert.ok(indexStatus.ok, `Cannot inspect demo index: HTTP ${indexStatus.status}`);
}
const bulk = events
  .flatMap((event) => [{ index: { _id: `${event.jobId}-${event.attempt}` } }, event])
  .map((line) => JSON.stringify(line))
  .join('\n');
const indexed = await request(
  `${indexUrl}/_bulk?refresh=wait_for`,
  'POST',
  `${bulk}\n`,
  'application/x-ndjson',
);
assert.equal(indexed.errors, false, JSON.stringify(indexed.items));

const latest = (await readFile(new URL('./latest-outcomes.esql', import.meta.url), 'utf8')).trim();
const failureRate = (
  await readFile(new URL('./failure-rate.esql', import.meta.url), 'utf8')
).trim();
const query = (query) => request(`${elasticsearch}/_query`, 'POST', { query });

const raw = await query(`FROM ${index} | SORT @timestamp | KEEP jobId, attempt, status`);
assert.deepEqual(raw.values, [
  [1, 1, 'retry'],
  [1, 2, 'fetched'],
  [2, 1, 'failed'],
]);
const outcomes = await query(latest);
assert.deepEqual(outcomes.values, [
  ['fetched', 1],
  ['failed', 2],
]);
const totals = await query(failureRate);
assert.deepEqual(totals.values, [[1, 2, 0.5]]);
console.log('Elasticsearch verified 3 events, 2 finished jobs, 1 failed job, 50% failure rate.');

const metrics = [
  { title: 'Fetch failure rate', column: 'failureRate', format: { type: 'percent', decimals: 0 } },
  { title: 'Failed jobs', column: 'failed' },
  { title: 'Finished jobs', column: 'finished' },
];
await request(`${kibana}/api/dashboards/${dashboardId}`, 'PUT', {
  title: 'Logis fetch queue lab',
  description: 'Two fixture jobs. The rate uses the latest reported outcome for each job.',
  time_range: { from: 'now-7d', to: 'now' },
  panels: metrics.map(({ title, column, format }, i) => ({
    type: 'vis',
    grid: { x: i * 16, y: 0, w: 16, h: 8 },
    config: {
      type: 'metric',
      title,
      data_source: { type: 'esql', query: failureRate },
      metrics: [{ type: 'primary', column, label: title, ...(format && { format }) }],
    },
  })),
});
console.log(`${kibana}/app/dashboards#/view/${dashboardId}`);
