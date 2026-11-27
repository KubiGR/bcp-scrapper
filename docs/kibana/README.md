# Logis fetch queue lab

This local lab runs two jobs through the real Logis fetch worker with tournament fixtures and
in-memory Postgres. The first job retries and then succeeds. The second requests a missing list
and fails. Elasticsearch stores the three worker events. Kibana displays the final failure rate.

## Run the lab

Start Elasticsearch and Kibana 9.5.7 on loopback ports 19200 and 15601 respectively. The script
uses a dedicated local fixture cluster with no credentials. From the Logis repository root, run
the following after installing workspace dependencies.

```sh
pnpm --filter @bcp/api exec node --import tsx src/fetch-queue/emit-demo-logs.ts > /tmp/logis-fetch-demo.ndjson
node docs/kibana/load-demo.mjs /tmp/logis-fetch-demo.ndjson
```

The loader keeps the queue event fields it needs, converts Pino's timestamp to `@timestamp`, and
indexes the fixture events. Rerunning replaces the three fixture documents and updates the lab
dashboard. Open [Logis fetch queue lab](http://127.0.0.1:15601/app/dashboards#/view/logis-fetch-queue-learning).
Set the time picker to include the fixture run.

## Verify 50%

1. In Discover, switch to ES|QL and run the query below. Job 1 has two events, followed by the
   single failure event for job 2.
2. Run [latest-outcomes.esql](latest-outcomes.esql). Look for one `fetched` and one `failed`.
3. Run [failure-rate.esql](failure-rate.esql). The result is one failed job and two finished jobs.
   Elasticsearch returns the fraction `0.5`. Kibana formats it as `50%`.

```text
FROM logis-fetch-demo
| SORT @timestamp
| KEEP jobId, attempt, status
```

The query uses the latest _observed_ event for each job in the selected window. A job with only a
`retry` or `paused` event is excluded. A window with zero finished jobs has an undefined rate.
A job that an operator has just requeued can still appear failed until its next attempt emits an
event. Use Postgres for the current queue state.
