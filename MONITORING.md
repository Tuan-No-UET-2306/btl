# Monitoring & Observability — LPR System

This document describes the monitoring and observability stack implemented for the License Plate Recognition (LPR) system. It covers the architecture, services, how to access dashboards, the list of exposed metrics, alerting rules, and common troubleshooting steps.

---

## 1. Architecture Overview

```
                      ┌──────────────────┐
                      │   Grafana UI     │  ← http://localhost:3000
                      │  (visualisation) │
                      └────────┬─────────┘
                               │ queries PromQL
                      ┌────────▼─────────┐
                      │   Prometheus     │  ← http://localhost:9090
                      │  (metrics store) │
                      └────────┬─────────┘
                               │ scrapes /metrics
                      ┌────────▼─────────┐
                      │  FastAPI Backend │  exposes /metrics
                      │  + Instrumentator│
                      └──────────────────┘
```

- **FastAPI Backend** instruments itself with `prometheus-fastapi-instrumentator` and a custom middleware that records HTTP request count, latency, error count, active WebSocket connections, CPU usage, and memory usage.
- **Prometheus** scrapes the `/metrics` endpoint every 10–15 seconds and stores the time-series data. It also evaluates alerting rules defined in `deploy/prometheus/alert_rules.yml`.
- **Grafana** visualises the data using a pre-provisioned dashboard (`LPR System Dashboard`) that is loaded automatically on startup.

---

## 2. Services

| Service          | Container Name     | Port  | Purpose                                    |
| ---------------- | ------------------ | ----- | ------------------------------------------ |
| **Prometheus**   | `lpr_prometheus`   | 9090  | Time-series database & alert evaluation    |
| **Grafana**      | `lpr_grafana`      | 3000  | Dashboard visualisation                    |
| **FastAPI**      | `lpr_backend`      | 8000  | Application server (metrics source)        |
| **Nginx**        | `lpr_nginx`        | 8080  | Reverse proxy                              |

### 2.1 Default Credentials

| Service   | Username | Password |
| --------- | -------- | -------- |
| Grafana   | `admin`  | `admin`  |
| Backend   | `admin`  | `admin123` |

> Grafana credentials can be overridden via `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` environment variables.

---

## 3. Dashboard Access

1. Start the full stack (see Section 8).
2. Open Grafana: [http://localhost:3000](http://localhost:3000)
3. Log in with `admin` / `admin` (or your custom credentials).
4. Navigate to **Dashboards → LPR System Dashboard**.
5. The dashboard is organised into four row sections:
   - **Backend Performance** – HTTP request rate, latency percentiles (p50/p90/p99)
   - **Error Rate** – Global error rate, 5xx error count
   - **WebSocket Activity** – Active WebSocket connections over time
   - **System Resources** – CPU usage, memory usage (used / total / available)
   - **Alerts (firing)** – A table of currently firing Prometheus alerts

### 3.1 Grafana Data Source

The Prometheus data source is automatically provisioned on Grafana startup via `deploy/grafana/datasources/datasource.yml`. No manual configuration is required.

---

## 4. Metrics List

All metrics are exposed at the **`/metrics`** endpoint on the backend (port 8000).

### 4.1 Custom Application Metrics

| Metric Name                        | Type      | Labels                                          | Description                                        |
| ---------------------------------- | --------- | ----------------------------------------------- | -------------------------------------------------- |
| `http_requests_total`              | Counter   | `method`, `endpoint`, `http_status`             | Total number of HTTP requests                      |
| `http_request_duration_seconds`    | Histogram | `method`, `endpoint`                            | HTTP request latency in seconds (bucketed)         |
| `http_errors_total`                | Counter   | `method`, `endpoint`                            | Total number of HTTP 5xx errors                    |
| `active_websocket_connections`     | Gauge     | (none)                                          | Number of currently active WebSocket connections   |
| `system_cpu_usage_percent`         | Gauge     | (none)                                          | Current CPU usage in percent                       |
| `system_memory_usage_bytes`        | Gauge     | `type` (`used`, `total`, `available`)           | Current memory usage in bytes                      |

### 4.2 Auto-Instrumented Metrics (via `prometheus-fastapi-instrumentator`)

The Instrumentator adds several default metrics (prefixed with `fastapi_`):
- `fastapi_request_duration_seconds` – request duration histogram
- `fastapi_request_size_bytes` – request body size
- `fastapi_response_size_bytes` – response body size
- `fastapi_requests_total` – total requests counter
- `fastapi_responses_total` – total responses counter (per status code)

These are also exposed at `/metrics` and can be used in any Grafana panels.

---

## 5. Logging

Logging is configured as **structured JSON** output to stdout, making it easy to ingest into log aggregators (e.g., Loki, Elasticsearch).

### 5.1 Log Format

Each log line is a JSON object:

```json
{
  "timestamp": "2026-05-25T22:15:30.123456Z",
  "level": "INFO",
  "logger": "src.backend.main",
  "message": "request handled",
  "endpoint": "/api/v1/detections",
  "method": "GET",
  "status_code": 200,
  "client_ip": "192.168.1.100"
}
```

### 5.2 Fields

| Field        | Description                              |
| ------------ | ---------------------------------------- |
| `timestamp`  | ISO 8601 timestamp with microseconds     |
| `level`      | Log level (`INFO`, `WARNING`, `ERROR`)   |
| `logger`     | Python logger name                       |
| `message`    | Human-readable log message               |
| `endpoint`   | HTTP request path (present on HTTP logs) |
| `method`     | HTTP method                              |
| `status_code`| HTTP response status code                |
| `client_ip`  | Client IP address                        |
| `exception`  | Exception traceback (if any)             |

### 5.3 Storage

- Logs are output to **stdout** / **stderr**.
- When running in Docker, Docker's logging driver captures them.
- A dedicated Docker volume `lpr_backend_logs` is defined but not mounted by default. To persist logs on disk, mount it to a directory inside the backend container (e.g., `/var/log/lpr`).

---

## 6. Alerting Rules

Alert rules are defined in `deploy/prometheus/alert_rules.yml`. Prometheus evaluates them every 30 seconds.

| Alert Name            | Condition                                                      | Severity | For       | Description                              |
| --------------------- | -------------------------------------------------------------- | -------- | --------- | ---------------------------------------- |
| `HighErrorRate`       | 5xx error rate > 5% over 5 minutes                             | warning  | 2 minutes | Too many requests failing with 5xx       |
| `HighMemoryUsage`     | memory usage (used / total) > 85%                               | warning  | 3 minutes | System memory is running out             |
| `BackendUnavailable`  | `up{job="lpr-backend"} == 0`                                    | critical | 1 minute  | Backend cannot be reached by Prometheus  |
| `HighCpuUsage`        | CPU usage > 80%                                                 | warning  | 5 minutes | CPU usage sustained above 80%            |

> Prometheus exposes fired alerts at **`http://localhost:9090/alerts`** and Grafana has a panel that queries `ALERTS{alertstate="firing"}`.

---

## 7. Configuration Files

| File                                          | Purpose                                      |
| --------------------------------------------- | -------------------------------------------- |
| `deploy/prometheus/prometheus.yml`            | Prometheus scrape config                     |
| `deploy/prometheus/alert_rules.yml`           | Alerting rules                               |
| `deploy/grafana/datasources/datasource.yml`   | Grafana auto-provision Prometheus data source|
| `deploy/grafana/dashboards/dashboard.yml`     | Grafana dashboard provisioning config        |
| `deploy/grafana/dashboards/lpr_dashboard.json`| Pre-built Grafana dashboard                  |
| `requirement.txt`                             | Python dependencies (prometheus-client, etc.)|
| `docker-compose.prod.yml`                     | Docker Compose with monitoring services      |
| `src/backend/main.py`                         | FastAPI app with metrics & logging           |
| `src/backend/socket/manager.py`               | WebSocket manager (updates Prometheus gauge) |

---

## 8. Starting the Monitoring Stack

### 8.1 Prerequisites

- Docker & Docker Compose
- An `.env` file with `DATABASE_URL` and other required vars (see `.env.example`)

### 8.2 Start All Services

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

This starts:
- `redis`, `minio`, `backend`, `worker`, `frontend`, `nginx`
- `prometheus` (port 9090)
- `grafana` (port 3000)

### 8.3 Verify Prometheus is Scraping

1. Open Prometheus UI: [http://localhost:9090](http://localhost:9090)
2. Go to **Status → Targets**.
3. Verify that the `lpr-backend` target is **UP**.
4. Alternatively, run:
   ```bash
   curl -s http://localhost:9090/api/v1/targets | python -m json.tool | grep -E '"health"|"job"'
   ```

### 8.4 Verify Metrics are Exposed

```bash
curl -s http://localhost:8000/metrics | head -30
```

You should see Prometheus-formatted metrics including:
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{endpoint="/",http_status="200",method="GET"} 1.0
...
```

### 8.5 Access Grafana Dashboard

1. Open [http://localhost:3000](http://localhost:3000)
2. Log in with `admin` / `admin`.
3. Go to **Dashboards → LPR System Dashboard**.
4. The dashboard should be populated with live data.

---

## 9. Troubleshooting

### 9.1 Prometheus shows "DOWN" for lpr-backend

- Is the backend container running? `docker ps | grep lpr_backend`
- Can you reach the metrics endpoint? `curl http://localhost:8000/metrics`
- Check the Prometheus container logs: `docker logs lpr_prometheus`
- The `prometheus.yml` configures both `host.docker.internal:8000` and `backend:8000`. One of them will always be unreachable — this is expected. As long as **one** shows UP, scraping works.

### 9.2 Grafana shows "No data" in panels

- Ensure Prometheus is scraping successfully (see 9.1).
- Verify the data source is configured in Grafana: **Configuration → Data Sources → Prometheus**. The URL should be `http://prometheus:9090`.
- Check the time range in the dashboard (top-right corner). Try "Last 15 minutes" or "Last 1 hour".

### 9.3 Grafana fails to provision the dashboard

- Check Grafana logs: `docker logs lpr_grafana`
- Verify the provisioning files exist:
  ```bash
  docker exec lpr_grafana ls -la /etc/grafana/provisioning/datasources/
  docker exec lpr_grafana ls -la /etc/grafana/provisioning/dashboards/
  ```
- If the dashboard JSON is invalid, Grafana will skip it. Validate the JSON:
  ```bash
  python -m json.tool deploy/grafana/dashboards/lpr_dashboard.json > /dev/null
  ```

### 9.4 Missing `psutil` or `prometheus_client` errors

Ensure the updated `requirement.txt` has been installed:
```bash
pip install -r requirement.txt
```
Or rebuild the Docker image:
```bash
docker compose -f docker-compose.prod.yml build backend
```

### 9.5 WebSocket gauge always shows 0

- The gauge is updated inside `socket/manager.py` via `_update_ws_gauge()`, which imports from `main.py`. If the import fails (e.g., during tests or if the module is loaded out of order), the gauge silently stays at 0.
- Verify by connecting a WebSocket client and checking the metric:
  ```bash
  curl -s http://localhost:8000/metrics | grep active_websocket
  ```

---

## 10. Stopping the Stack

```bash
docker compose -f docker-compose.prod.yml down
```

To also remove persistent volumes (deletes all historical metrics and logs):
```bash
docker compose -f docker-compose.prod.yml down -v
```

---

## 11. Customisation

- **Modify scrape interval**: Edit `scrape_interval` in `deploy/prometheus/prometheus.yml`.
- **Add alert receivers**: Configure `alerting.alertmanagers` in `prometheus.yml` to point to an Alertmanager instance.
- **Extend Grafana**: Install additional plugins via `GF_INSTALL_PLUGINS` environment variable.
- **Increase metric retention**: Change `--storage.tsdb.retention.time` in the Prometheus command (default: 30d).