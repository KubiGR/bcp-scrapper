"""Kibana dashboard and ES|QL panels for the Logis fetch queue."""

TIME_BUCKET = "BUCKET(@timestamp, 48, ?_tstart, ?_tend)"


def esql(query):
    return {"type": "esql", "query": query}


def panel(title, chart_type, y, height, x=0, width=48, **config):
    return {
        "type": "vis",
        "grid": {"x": x, "y": y, "w": width, "h": height},
        "config": {"type": chart_type, "title": title, **config},
    }


def column(field, label, **config):
    return {"column": field, "label": label, **config}


def dashboard(index, failure_rate_query):
    panels = []
    for i, (title, field) in enumerate([
        ("Fetch failure rate", "failureRate"),
        ("Failed jobs", "failed"),
        ("Finished jobs", "finished"),
    ]):
        metric = column(field, title, type="primary")
        if field == "failureRate":
            metric["format"] = {"type": "percent", "decimals": 1}
        panels.append(panel(
            title, "metric", 0, 8, x=i * 16, width=16,
            data_source=esql(failure_rate_query), metrics=[metric],
        ))

    failed_jobs = f"""FROM {index}
| WHERE logis.jobId IS NOT NULL
| STATS outcome = LAST(logis.status, logis.order),
        failedAt = LAST(@timestamp, logis.order),
        kind = LAST(logis.kind, logis.order),
        attempt = LAST(logis.attempt, logis.order),
        errorCode = LAST(logis.errorCode, logis.order),
        errorMessage = LAST(logis.errorMessage, logis.order)
  BY logis.jobId
| WHERE outcome == "failed"
| SORT failedAt DESC, logis.jobId DESC
| LIMIT 100"""
    job_history = f"""FROM {index}
| WHERE logis.jobId IS NOT NULL
| SORT @timestamp DESC, logis.order DESC
| KEEP @timestamp, logis.jobId, logis.kind, logis.attempt, logis.status,
       logis.errorCode, logis.errorMessage, logis.reason, logis.durationMs
| LIMIT 100"""
    failures_and_retries = f"""FROM {index}
| WHERE logis.status IN ("failed", "retry")
| EVAL series = CONCAT(logis.kind, " / ", logis.status)
| STATS events = COUNT(*) BY time = {TIME_BUCKET}, series
| SORT time"""
    queue_health = f"""FROM {index}
| WHERE logis.workerState IS NOT NULL
| SORT @timestamp DESC, logis.order DESC
| LIMIT 1
| KEEP @timestamp, logis.workerState, logis.reason, logis.until,
       logis.waiting, logis.oldestWaitSeconds"""
    queue_trend = f"""FROM {index}
| WHERE logis.workerState IS NOT NULL
| STATS waiting = LAST(logis.waiting, logis.order),
        oldestWait = LAST(COALESCE(logis.oldestWaitSeconds, 0), logis.order)
  BY time = {TIME_BUCKET}
| SORT time"""
    panels.extend([
        panel(
            "Failed jobs · click a job ID to filter its history", "data_table", 8, 14,
            data_source=esql(failed_jobs),
            rows=[
                column("logis.jobId", "Job ID", click_filter=True, width=100),
                column("failedAt", "Failed at"),
                column("kind", "Job type"),
                column("errorCode", "Error code"),
                column("errorMessage", "Why it failed"),
            ],
            metrics=[column("attempt", "Attempt")],
        ),
        panel(
            "Job history", "data_table", 22, 15,
            data_source=esql(job_history),
            rows=[
                column("logis.jobId", "Job ID", click_filter=True, width=100),
                column("@timestamp", "Time"),
                column("logis.kind", "Job type"),
                column("logis.status", "Outcome"),
                column("logis.errorCode", "Error code"),
                column("logis.errorMessage", "Error"),
                column("logis.reason", "Pause reason"),
            ],
            metrics=[
                column("logis.attempt", "Attempt"),
                column("logis.durationMs", "Duration (ms)"),
            ],
        ),
        panel(
            "Failures and retries by job type", "xy", 37, 16,
            layers=[{
                "type": "bar",
                "data_source": esql(failures_and_retries),
                "x": column("time", "Time"),
                "y": [column("events", "Events")],
                "breakdown_by": column("series", "Job type / outcome"),
                "ignore_global_filters": True,
            }],
        ),
        panel(
            "Queue health · latest sample", "data_table", 53, 7,
            data_source=esql(queue_health),
            ignore_global_filters=True,
            rows=[
                column("@timestamp", "Sample time"),
                column("logis.workerState", "Worker"),
                column("logis.reason", "Pause reason"),
                column("logis.until", "Paused until"),
            ],
            metrics=[
                column("logis.waiting", "Waiting jobs"),
                column("logis.oldestWaitSeconds", "Oldest wait (s)"),
            ],
        ),
        panel(
            "Queue backlog and oldest wait over time", "xy", 60, 16,
            layers=[{
                "type": "line",
                "data_source": esql(queue_trend),
                "x": column("time", "Time"),
                "y": [
                    column("waiting", "Waiting jobs"),
                    column("oldestWait", "Oldest wait (s)", axis="y2"),
                ],
                "ignore_global_filters": True,
            }],
        ),
    ])
    return {
        "title": "Logis fetch queue",
        "description": "Fetch outcomes, job history and worker health in the selected time window.",
        "refresh_interval": {"pause": False, "value": 15000},
        "time_range": {"from": "now-24h", "to": "now"},
        "panels": panels,
    }
