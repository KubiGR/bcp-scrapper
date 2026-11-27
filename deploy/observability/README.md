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

To create or update the stack, copy the Compose and configuration files, the ES|QL query, and
`provision.py` to the host's observability directory. Keep `.env` outside Git with mode 0600. Set
`ELASTIC_PASSWORD`, `KIBANA_PASSWORD`, `KIBANA_SESSION_KEY`, `LOGIS_DASHBOARD_PASSWORD`, and
`LOGIS_WRITER_PASSWORD` there. Start Elasticsearch with `docker compose up -d elasticsearch` and
run `python3 provision.py` on the host. The provisioning script updates the dedicated dashboard.

In Discover, switch to ES|QL and use this query to see what reached Elasticsearch.

```text
FROM logis-fetch-live
| SORT @timestamp DESC, logis.order DESC
| KEEP @timestamp, logis.jobId, logis.attempt, logis.status, logis.durationMs
| LIMIT 25
```

A manual Retry produces a `requeued` event for each changed job. The live panel takes the latest
event for each job before filtering to terminal outcomes. This removes the job from the numerator
and denominator while it is back in the queue. The journal starts the usable history at the
instrumented deployment.
