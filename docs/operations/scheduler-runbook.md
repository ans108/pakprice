# PakPrice Scraper Scheduler Operator Runbook

**Document Version:** 1.0.0 (Increment 6J)  
**System Component:** `apps/scraper` — `schedulerWorker`  
**Timezone Standard:** `Asia/Karachi` (PKT, UTC+5)  
**Security & Operational Posture:** Singleton Process, Gated Activation, Explicit Stale-Job Management

---

## 1. Architectural Architecture & Singleton Mandate

### CRITICAL PRODUCTION DEPLOYMENT RULE: ONE REPLICA ONLY
> [!IMPORTANT]
> **Exactly ONE (1) instance/replica of `schedulerWorker` must run in production.**
> - `schedulerWorker` is a standalone, dedicated background process completely separate from the API server (`apps/api`) and Web frontend (`apps/web`).
> - **DO NOT scale horizontally.** Running multiple scheduler replicas causes schedule duplication and unnecessary lock contention.
> - Concurrency protection is strictly enforced at the database level via a Postgres partial unique index on `scrape_jobs (store_id) WHERE status = 'running'` (Migration 009). However, deployment must guarantee a single running instance.

---

## 2. Configuration & Activation Modes

Scheduler activation is governed by two complementary environment variables:

| Variable | Allowed Values | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `ENABLE_SCHEDULER` | `true`, `false` | `false` | Process master switch. If `false`, worker boots but registers no tasks. |
| `SCHEDULER_ACTIVATION_MODE` | `disabled`, `observe`, `active` | `disabled` | Activation behavior guard. |

### Activation Mode Semantics

1. **`disabled` (Default / Safe State):**
   - No cron tasks are registered.
   - Zero background scraping or ingestion can take place.
   - Safe for standard maintenance and API-only deployments.

2. **`observe` (Staged Dry-Run / Verification Mode):**
   - Initializes scheduler and registers production cron tasks in memory.
   - When a cron schedule triggers, **it logs what would have run without executing the scrape**.
   - Emits structured event `scheduler_task_triggered` with `[OBSERVE MODE - NO INGESTION]`.
   - **Performs ZERO database mutations, ZERO network requests to store domains, and ZERO catalog alterations.**

3. **`active` (Full Production Execution):**
   - Initializes schedules and executes production discovery and refresh scraping workflows on time in `Asia/Karachi`.
   - Full concurrency mutex, partial unique index protection, and coverage evaluation are active.

---

## 3. Store Schedules & Eligibility Matrix

All schedules run strictly in `Asia/Karachi` (PKT) time:

| Store Slug | Display Name | Eligibility | Discovery Cron (PKT) | Refresh Cron (PKT) | Minimum Coverage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `priceoye` | PriceOye | **production** | `0 3 * * *` (03:00) | `10 */4 * * *` (Every 4h at :10) | 70% |
| `telemart` | Telemart | **production** | `30 3 * * *` (03:30) | `25 */6 * * *` (Every 6h at :25) | 70% |
| `mega-pk` | Mega.pk | **production** | `0 4 * * *` (04:00) | `40 */6 * * *` (Every 6h at :40) | 70% |
| `shophive` | Shophive | **production** | `30 4 * * *` (04:30) | `55 */6 * * *` (Every 6h at :55) | 70% |
| `paklap` | Paklap | **blocked** | *None (NULL)* | *None (NULL)* | N/A (Cloudflare Challenge) |
| `daraz` | Daraz | **experimental** | *None (NULL)* | *None (NULL)* | N/A (Manual only) |

> [!NOTE]
> `paklap` and `daraz` are explicitly non-scheduled. The scheduler skips them unconditionally during task registration.

---

## 4. Operator Operational Procedures

### A. How to Confirm Scheduler is Running
Inspect container/process logs for the startup banner:
```
============================================================
  PAKPRICE SCHEDULER WORKER
  Environment: production
  PID: 12345
  Instance ID: prod-scheduler-1
  Timezone: Asia/Karachi
  Enabled: true
  Activation Mode: active
============================================================
```
Or check periodic heartbeats:
```json
{
  "event": "scheduler_worker_heartbeat",
  "schedulerActive": true,
  "activationMode": "active",
  "activeTasks": 8,
  "runningStores": []
}
```

### B. How to Inspect Scheduler Health
Run the read-only operational health report:
```bash
npx tsx scripts/report-scheduler-health.ts
```
This inspects configuration, active cron registrations, in-flight jobs, stale jobs (> 60m), last completed jobs, recent failed jobs, and low-coverage runs.

### C. How to Inspect Store Freshness
Run the read-only store freshness report:
```bash
npx tsx scripts/report-store-freshness.ts
```
Outputs total URLs, fresh (<24h), stale (>24h), unobserved, coverage percentage, oldest/newest refresh timestamps, and last successful discovery timestamp.

### D. How to Inspect Failed Jobs
Query via `report-scheduler-health.ts` or directly inspect `scrape_jobs` where `status = 'failed'`:
```sql
SELECT id, store_id, job_type, started_at, completed_at, errors, metadata->>'errorCategory' AS error_category
FROM scrape_jobs
WHERE status = 'failed'
ORDER BY started_at DESC
LIMIT 10;
```

### E. How to Identify Stale Jobs
A stale job is any `scrape_jobs` row in `status = 'running'` that has exceeded the maximum expected job duration (`STALE_JOB_THRESHOLD_MINUTES`, default 60 minutes).
Identify via `report-scheduler-health.ts` or query:
```sql
SELECT id, store_id, job_type, started_at, NOW() - started_at AS duration
FROM scrape_jobs
WHERE status = 'running'
  AND started_at < NOW() - INTERVAL '60 minutes';
```

### F. How to Manually Reset a Stale Job
> [!CAUTION]
> **NO AUTOMATIC STALE-JOB RESET EXISTS.**
> Stale jobs are never reset automatically by the scheduler. An operator must investigate the hung worker, ensure it is terminated, and manually resolve the job row.

To manually mark a hung job as failed:
```sql
UPDATE scrape_jobs
SET status = 'failed',
    completed_at = NOW(),
    errors = errors || '["Job marked failed manually by operator after worker timeout"]'::jsonb,
    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{manualReset}', 'true'::jsonb)
WHERE id = '<STALE_JOB_UUID>'
  AND status = 'running';
```

### G. How to Safely Restart schedulerWorker
1. Send `SIGTERM` or `SIGINT` to the process:
   ```bash
   kill -TERM <PID>
   ```
2. The worker will trigger `scheduler_shutdown`, cancel in-flight cron registrations cleanly, wait for running store mutex locks, and exit with code 0.
3. Start the worker again:
   ```bash
   node apps/scraper/dist/workers/schedulerWorker.js
   ```

### H. Emergency Shutdown Procedure / Rollback
To immediately cease all automated scraping:
1. Update environment:
   ```env
   ENABLE_SCHEDULER=false
   SCHEDULER_ACTIVATION_MODE=disabled
   ```
2. Restart or kill the `schedulerWorker` process.
3. Confirm with `npx tsx scripts/report-scheduler-health.ts` that `Activation Mode: disabled` and `Running Jobs: 0`.

---

## 5. Failure Safety Guarantees & Low-Coverage Semantics

### What Low Coverage Means
- When a refresh job observes fewer valid product prices than `MINIMUM_COVERAGE_PCT` (default: 70%):
  - The job completes with `status = 'completed'` and `metadata.lowCoverage = true`.
  - A structured warning is logged: `[COVERAGE WARNING] Store <store> refresh coverage <X>% below minimum threshold 70%`.
  - **NO DELETION:** Prices and products are NEVER deleted.
  - **NO IN_STOCK FORGERY:** Missing/unobserved products are NOT marked `in_stock = false` or out of stock.
  - **NO LAST_SCRAPED_AT UPDATES:** Unobserved products do NOT receive an updated `last_scraped_at` timestamp.
  - Preserves 5C freshness semantics where `last_scraped_at` reflects true observation.

### Scraper Invariants
- `refresh` jobs run with `allowCreate = false` (never insert new products during refresh).
- `discovery` jobs run with `allowCreate = true` (only discovery creates catalog entities).
- Domain and redirect validation rules (Increment 6I) are strictly enforced.

---

## 6. Staged First Production Rollout Plan

To safely roll out the scheduler to production, execute the following 7 stages in strict sequence:

### Stage A: Deploy in Disabled Mode (Pre-Flight Baseline)
1. Set in production environment:
   ```env
   ENABLE_SCHEDULER=true
   SCHEDULER_ACTIVATION_MODE=disabled
   ```
2. Deploy the `schedulerWorker` singleton process.
3. Verify worker boots and logs `scheduler_disabled`. Verify no cron tasks run.
4. Run:
   ```bash
   npx tsx scripts/report-scheduler-health.ts
   npx tsx scripts/report-store-freshness.ts
   ```

### Stage B: Transition to Observe Mode (Dry-Run Staging)
1. Set in production environment:
   ```env
   SCHEDULER_ACTIVATION_MODE=observe
   ```
2. Restart `schedulerWorker`.
3. Verify worker logs `Starting ScraperScheduler in "observe" mode` and registers 8 cron tasks.

### Stage C: Validate Observe Mode Behavior
1. Allow at least one cron schedule window to pass (or observe scheduled trigger times).
2. Confirm logs contain:
   `[OBSERVE MODE - NO INGESTION] Cron task triggered for <store> (<job_type>). Ingestion skipped.`
3. Verify with `scripts/verify-6j-scheduler-production.ts` that catalog counts remain strictly identical.

### Stage D: Operator-Gated Single-Store Smoke Test
Execute a single, controlled refresh scrape for one production store (e.g. `priceoye`) with limited catalog size:
```bash
SMOKE_TEST_ENABLED=true SMOKE_TEST_STORE=priceoye SMOKE_TEST_JOB_TYPE=refresh SMOKE_TEST_LIMIT=5 npx tsx scripts/smoke-test-single-store.ts
```

### Stage E: Verify Smoke Test Results
1. Check `report-scheduler-health.ts` — verify the job completed cleanly with `status = 'completed'` and `errors = 0`.
2. Check `report-store-freshness.ts` — verify refreshed URLs have updated `last_scraped_at`.
3. Check database immutability on catalog structure:
   - Zero unexpected products created during refresh (`allowCreate=false`).
   - Prices recorded properly in `prices` and price history tracked.

### Stage F: Activate Production Scheduler
Only after Stage E verification succeeds:
1. Update environment:
   ```env
   SCHEDULER_ACTIVATION_MODE=active
   ```
2. Restart `schedulerWorker`.
3. Confirm worker startup banner displays:
   `Activation Mode: active`

### Stage G: Post-Activation Observation
1. Monitor the first night's discovery runs (03:00–04:30 PKT) and daytime refresh runs.
2. Run `report-store-freshness.ts` daily to monitor coverage and freshness.
3. Run `report-scheduler-health.ts` weekly to confirm no lingering running or stale jobs.
