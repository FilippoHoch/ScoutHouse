# M6 Resilience, Observability & Cost Efficiency Playbook

This playbook expands the high-level roadmap items for Milestone M6 into concrete
implementation and runbook tasks. It focuses on three streams—reliability,
observability, and FinOps—so that the team can deliver the milestone DoD
(dashboard + alerting online, FinOps report shared, and a successful disaster
recovery simulation) while tracking measurable improvements.

## 1. Reliability Engineering

### 1.1 Load testing (k6)

**Scenarios**

| Scenario | Entry point | Target load | Success criteria |
| -------- | ----------- | ----------- | ---------------- |
| Massive import | `POST /api/v1/import/bulk` (CSV 200× records) | 40 req/min sustained for 15 min | p95 < 1s, error rate < 0.5% |
| Quote generation | `POST /api/v1/quotes/generate` (payload medium complexity) | 60 req/min sustained for 20 min | p95 < 900 ms, throughput ≥ baseline |
| Real-time events | Server-sent events `/api/v1/events/stream` while updating timelines | 2k concurrent clients | Handshake < 300 ms, reconnect < 1s |

**Action items**

1. Author k6 scripts under `scripts/k6/` (naming: `scenario_{name}.js`).
2. Run tests from CI nightly on staging replica; store artifacts in
   `s3://scouthouse-observability/k6/YYYY-MM-DD/`.
3. Publish report summary (p50/p95/p99, error rate, throughput) to Grafana via
   Prometheus remote write (`k6_summary_*` metrics) and attach to the "API
   health" dashboard.
4. Gate deployment: if p95 > SLO thresholds twice consecutively, block release
   and open incident ticket (`REL-####`).

### 1.2 Chaos engineering

| Component | Failure mode | Tooling | Frequency | Runbook reference |
| --------- | ------------ | ------- | --------- | ----------------- |
| Redis/RQ queue | Latency injection + crash | `toxiproxy` + `chaosredis` | Monthly | `docs/realtime/rq_recovery.md` |
| External storage (S3) | Throttle + 5xx burst | AWS Fault Injection Simulator / LocalStack | Monthly | `docs/files/s3_failover.md` |
| Geocoding provider | DNS failover to backup API | `chaos-mesh` DNS disruption | Monthly | `docs/integration/geocoding_failover.md` |
| PostgreSQL | Primary crash + promote replica | `pg_ctl promote` via Terraform null_resource | Quarterly | `docs/db/disaster_recovery.md` |

**Execution**

* Maintain calendar entry "Chaos Friday" (first Friday of month) with owner
  rotation.
* Capture hypothesis, blast radius, and mitigation steps in Linear project
  `RES-CHAOS`.
* Record outcome, metrics impact, and follow-up tasks in postmortem template.
  Store logs under `docs/reports/chaos/YYYY-MM.md`.

### 1.3 Disaster recovery automation

1. **Database**
   * Automate point-in-time restore via Terraform module `infra/terraform/modules/postgres/dr`.
   * Validate RPO ≤ 5 minutes by replaying WAL to the latest timestamp.
   * Script failover verification (`scripts/dr/db_restore_check.py`) ensuring
     schema versions align with `alembic heads`.
2. **Attachments / exports**
   * Mirror `attachments/` and `exports/` prefixes using S3 replication to warm
     DR bucket with 24h lag maximum.
   * Nightly job (`scripts/dr/s3_manifest_diff.py`) compares object manifests and
     flags drift > 0.1%.
3. **Failover rehearsal**
   * Quarterly tabletop + technical exercise: promote standby DB, switch app
     env vars (`DATABASE_URL`, `S3_BUCKET`) via Feature Flags, run smoke tests.
   * Document timings (failover start/end, data currency) in
     `docs/reports/dr/YYYY-MM.md` and update DR checklist.

## 2. Observability

### 2.1 Distributed tracing (OpenTelemetry)

* Roll out SDKs:
  * Backend FastAPI: `opentelemetry-sdk`, `opentelemetry-instrumentation-fastapi`,
    `opentelemetry-instrumentation-redis`.
  * Frontend: wrap fetch/Apollo client with `@opentelemetry/api` + custom span
    attributes (`user_role`, `feature_flag`, `structure_id`).
  * Worker processes (RQ): instrument job execution with span links referencing
    originating HTTP request via `request_id` baggage.
* Sampling strategy:
  * Start at 10% head-based, increase to 50% for error spans, and enable tail
    sampling (latency > 1s) using the collector processor chain.
  * Export traces to Tempo via OTLP/gRPC; retention 15 days hot, 90 days cold.
* Contextual logging:
  * Enrich log records with `trace_id`, `span_id`, `environment`, `deployment`
    by hooking into `structlog` processors in backend/worker and frontend
    `console.log` wrappers.
  * Ensure masking of PII fields remains intact (`LOG_MASK_FIELDS`).

### 2.2 Metrics & dashboards

**Prometheus metrics extensions**

| Component | Metric | Notes |
| --------- | ------ | ----- |
| Backend | `rq_job_duration_seconds`, `third_party_geocode_latency_seconds`, `s3_upload_failures_total` | Expose via FastAPI instrumentation.
| Frontend | `frontend_csr_time_seconds`, `frontend_error_boundary_total` | Report via StatsD → Prometheus sidecar.
| Workers | `worker_retries_total`, `worker_dead_letter_total` | Pull from RQ stats exporter.
| Infrastructure | `pg_replica_lag_seconds`, `redis_connected_clients`, `s3_cost_estimate_dollars` | Scrape via exporters or FinOps API.

**Grafana dashboards**

1. **Unified API health**: latency histogram, error budget burn-down, queue
   depth, cache hit rate.
2. **Frontend UX**: Core Web Vitals (LCP/FID/CLS), SSE connection duration,
   release overlay (sourced from Git tag).
3. **Async jobs**: job backlog, retry rate, dead letter queue, SLA countdown.
4. **FinOps**: daily spend per environment, cost anomalies, projected month-end
   spend vs budget.

*Alerting*

* Define SLOs: API availability 99.5%, quote latency p95 < 900 ms, SSE uptime
  99.0%.
* Configure multi-channel alerting: PagerDuty (critical), Slack `#on-call` (warn),
  email digest (info).
* Implement alert deduplication with OpsGenie integration to avoid flapping.

## 3. Cost Optimization (FinOps)

### 3.1 Budgeting & forecasting

1. Baseline spend using AWS Cost Explorer exports grouped by tag `env` (dev,
   staging, prod) and service (EC2, RDS, S3, CloudFront).
2. Create budgets with 80%/100%/120% thresholds; route alerts to FinOps Slack
   channel and Jira project `FINOPS`.
3. Integrate budget data into Grafana dashboard (FinOps panel).
4. Monthly review: compare forecast vs actual, capture actions in
   `docs/reports/finops/YYYY-MM.md`.

### 3.2 Workload right-sizing

* Batch workers: enable autoscaling policy (AWS EventBridge Scheduler) to double
  RQ workers 20:00–02:00 UTC only when queue backlog > 100 jobs.
* API: evaluate Graviton-based instances; run load test comparisons and switch
  if ≥15% cost reduction at equal p95.
* Database: monitor CPU/memory; leverage storage auto-scaling with alerts when
  utilization > 70%.

### 3.3 Storage lifecycle & compression

1. Apply S3 lifecycle rules:
   * `attachments/` → transition to S3 Standard-IA after 30 days, Glacier after
     365 days unless `legal_hold=true` tag present.
   * `exports/` → expire after 14 days (default) unless `retention=long` tag.
2. Enable default server-side compression for generated exports (gzip JSON/CSV,
   parquet for large datasets) via background job `compress_exports`.
3. Track savings by comparing `s3_cost_estimate_dollars` metric pre/post rollout.

## 4. Implementation checklist

- [ ] k6 scripts authored, CI pipeline storing artifacts and Prometheus metrics.
- [ ] Chaos experiments executed per calendar with postmortems archived.
- [ ] Automated DR restore validated (DB + attachments) with documented timings.
- [ ] OpenTelemetry instrumentation deployed across backend, frontend, workers.
- [ ] Grafana dashboards + alerting live covering API/frontend/queues/jobs.
- [ ] Budgets + autoscaling policies configured; FinOps report template filled.
- [ ] S3 lifecycle + compression jobs deployed and monitored.

## 5. Metrics & Reporting

* **Availability**: `api_availability` SLI fed by uptime probe. Target ≥ 99.5%
  in staging under synthetic load.
* **Performance**: Track k6 results (`k6_http_req_duration_p95`) and compare to
  900 ms threshold for critical endpoints.
* **Cost**: Monthly cost delta vs baseline (`finops_monthly_delta_percent`).
* **DoD evidence**: attach Grafana screenshots, FinOps report link, and DR
  simulation log to milestone ticket before closing.

## 6. Ownership & cadence

| Stream | Owner | Cadence |
| ------ | ----- | ------- |
| Reliability | Platform Engineering | Weekly stand-up + monthly chaos review |
| Observability | SRE | Bi-weekly dashboard grooming |
| Cost | FinOps + Engineering Managers | Monthly budget review |

Cross-team sync scheduled every sprint review to review KPI trends and adjust
backlog priorities.
