# Logis fetch queue observability

The home server runs this Compose project separately from Logis. Elasticsearch uses the Docker
network, and Kibana is published on the host loopback. Filebeat reads the persistent systemd journal
with the Logis container tag and retains its input cursor in a Docker volume. Filebeat uses the
journal timestamp for the dashboard time window and preserves the worker’s ordering field to
resolve the latest state of a job.

Use the SSH alias for the home server to open the dashboard from a workstation.

```sh
ssh -NT -L 127.0.0.1:15602:127.0.0.1:15601 kubi-server
```

Open [Logis fetch queue](http://127.0.0.1:15602/app/dashboards?auth_provider_hint=ssh#/view/logis-fetch-queue).
The dashboard and Discover use a read-only Kibana account over the SSH tunnel.

In the failed-jobs table, click a job ID to filter the dashboard and inspect its attempts in
**Job history**. Clear the Job ID filter to return to the whole queue. The failed-jobs table and
counters use the latest recorded outcome per job in the selected time range. The failures and
retries chart counts events by job type, including events from jobs that later succeeded.

Logis records a queue health snapshot at startup and every minute. It counts automatic and
manual jobs still waiting, including retries in backoff, and shows the age of the oldest waiting
job. The latest snapshot also shows whether the worker is paused and why. Failure codes, short
error summaries and health snapshots are available from the deployment that added them onward.

To create or update the stack, copy the Compose and configuration files, the ES|QL query, and
both Python files to the host's observability directory. Keep `.env` outside Git with mode 0600. Set
`ELASTIC_PASSWORD`, `KIBANA_PASSWORD`, `KIBANA_SESSION_KEY`, `LOGIS_DASHBOARD_PASSWORD`, and
`LOGIS_WRITER_PASSWORD` there. Start Elasticsearch with `docker compose up -d elasticsearch` and
run `python3 provision.py` on the host. This updates the existing index mapping and dashboard.
After updating `filebeat.yml` in a running stack, run
`docker compose up -d --force-recreate filebeat` so the collector reloads its configuration.
The Filebeat volume preserves its journal cursor.

In Discover, switch to ES|QL and use this query to see what reached Elasticsearch.

```text
FROM logis-fetch-live
| WHERE logis.jobId IS NOT NULL
| SORT @timestamp DESC, logis.order DESC
| KEEP @timestamp, logis.jobId, logis.attempt, logis.status, logis.errorCode, logis.errorMessage
| LIMIT 25
```

A manual Retry produces a `requeued` event for each changed job. The live panel takes the latest
event for each job before filtering to terminal outcomes. This removes the job from the numerator
and denominator while it is back in the queue. The journal starts the usable history at the
instrumented deployment.
