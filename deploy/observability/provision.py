"""Provision a dedicated private Logis Elasticsearch and Kibana stack on its Docker host."""

import base64
import json
import subprocess
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dashboard import dashboard

ROOT = Path(__file__).resolve().parent
ENV = dict(line.split("=", 1) for line in (ROOT / ".env").read_text().splitlines())
INDEX = "logis-fetch-live"
DASHBOARD = "logis-fetch-queue"
KIBANA = "http://127.0.0.1:15601"


def compose(*args):
    return subprocess.check_output(["docker", "compose", *args], cwd=ROOT, text=True).strip()


def request(url, method="GET", data=None, user="elastic", password=None):
    credentials = f"{user}:{password or ENV['ELASTIC_PASSWORD']}".encode()
    headers = {
        "Authorization": "Basic " + base64.b64encode(credentials).decode(),
        "Content-Type": "application/json",
        "kbn-xsrf": "logis",
    }
    body = json.dumps(data).encode() if data is not None else None
    with urlopen(Request(url, body, headers, method=method), timeout=15) as response:
        content = response.read()
        return json.loads(content) if content else None


def wait_ready(url):
    for _ in range(45):
        try:
            return request(url)
        except (HTTPError, URLError, ConnectionError, TimeoutError):
            time.sleep(2)
    raise SystemExit(f"Timed out waiting for {url}")


def elastic_origin():
    container = compose("ps", "-q", "elasticsearch")
    ip = subprocess.check_output(
        ["docker", "inspect", "-f", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", container],
        text=True,
    ).strip()
    return f"http://{ip}:9200"


def provision():
    elastic = elastic_origin()
    wait_ready(elastic + "/")
    request(
        elastic + "/_security/user/kibana_system/_password",
        "POST",
        {"password": ENV["KIBANA_PASSWORD"]},
    )
    mappings = {"properties": {
        "@timestamp": {"type": "date"},
        "logis": {"properties": {
            "jobId": {"type": "long"},
            "attempt": {"type": "integer"},
            "status": {"type": "keyword"},
            "kind": {"type": "keyword"},
            "reason": {"type": "keyword"},
            "until": {"type": "date"},
            "durationMs": {"type": "long"},
            "order": {"type": "long"},
            "errorCode": {"type": "keyword"},
            "errorMessage": {"type": "keyword"},
            "waiting": {"type": "long"},
            "oldestWaitSeconds": {"type": "long"},
            "workerState": {"type": "keyword"},
        }},
    }}
    try:
        request(f"{elastic}/{INDEX}")
    except HTTPError as error:
        if error.code != 404:
            raise
        request(f"{elastic}/{INDEX}", "PUT", {
            "settings": {"number_of_replicas": 0},
            "mappings": mappings,
        })
    else:
        request(f"{elastic}/{INDEX}/_mapping", "PUT", mappings)

    request(elastic + "/_security/role/logis_writer", "PUT", {
        "cluster": ["monitor"],
        "indices": [{"names": [INDEX], "privileges": ["create_doc"]}],
    })
    request(elastic + "/_security/user/logis_writer", "PUT", {
        "password": ENV["LOGIS_WRITER_PASSWORD"],
        "roles": ["logis_writer"],
    })

    compose("up", "-d", "kibana")
    wait_ready(KIBANA + "/api/status")
    request(KIBANA + "/api/security/role/logis_dashboard", "PUT", {
        "elasticsearch": {"cluster": [], "indices": [
            {"names": [INDEX], "privileges": ["read", "view_index_metadata"]},
        ]},
        "kibana": [{"spaces": ["default"], "base": [], "feature": {
            "dashboard": ["read"],
            "discover": ["read"],
        }}],
    })
    request(elastic + "/_security/user/logis_dashboard", "PUT", {
        "password": ENV["LOGIS_DASHBOARD_PASSWORD"],
        "roles": ["logis_dashboard"],
    })
    query = (ROOT / "failure-rate.esql").read_text().strip()
    request(f"{KIBANA}/api/dashboards/{DASHBOARD}", "PUT", dashboard(INDEX, query))
    compose("up", "-d", "filebeat")
    print("Provisioned the Logis dashboard and started Filebeat.")


if __name__ == "__main__":
    provision()
