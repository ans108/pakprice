# PakPrice Scheduler — Staged Production Rollout Plan

**Document Version:** 1.0.0 (Increment 6J)  
**Component:** `apps/scraper` — `schedulerWorker`  
**Companion Document:** [scheduler-runbook.md](./scheduler-runbook.md)

---

## Pre-Requisites & Safety Constraints

Before beginning the rollout, the following invariants must be understood and enforced:

- **Exactly ONE (1) `schedulerWorker` replica** must run in production. Do NOT scale horizontally. The scheduler is a singleton process, completely separate from the API server and web frontend.
- **Timezone:** All schedules operate in `Asia/Karachi` (PKT, UTC+5).
- **Paklap** is **blocked** — never scheduled (Cloudflare challenge).
- **Daraz** is **experimental** — never scheduled (manual-only).
- **Stale jobs are NEVER automatically reset.** An operator must manually investigate and resolve stale jobs via SQL (see runbook Section 4F).
- **`disabled` mode is the emergency shutdown mechanism.** Setting `SCHEDULER_ACTIVATION_MODE=disabled` and restarting the worker immediately ceases all automated scraping.
- **`active` mode requires explicit manual operator approval.** It is never enabled automatically during deployment.
- Default configuration (`ENABLE_SCHEDULER=false`, `SCHEDULER_ACTIVATION_MODE=disabled`) is always safe — no cron tasks are registered, no ingestion occurs.

---

## Environment Variables

| Variable | Allowed Values | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `ENABLE_SCHEDULER` | `true`, `false` | `false` | Master process switch. If `false`, worker boots but registers no tasks. |
| `SCHEDULER_ACTIVATION_MODE` | `disabled`, `observe`, `active` | `disabled` | Activation behavior guard. Invalid values safely fall back to `disabled`. |

---

## Production Store Schedule Matrix

All schedules in `Asia/Karachi` (PKT):

| Store | Eligibility | Discovery Cron (PKT) | Refresh Cron (PKT) |
| :--- | :--- | :--- | :--- |
| `priceoye` | **production** | `0 3 * * *` (03:00) | `10 */4 * * *` (Every 4h at :10) |
| `telemart` | **production** | `30 3 * * *` (03:30) | `25 */6 * * *` (Every 6h at :25) |
| `mega-pk` | **production** | `0 4 * * *` (04:00) | `40 */6 * * *` (Every 6h at :40) |
| `shophive` | **production** | `30 4 * * *` (04:30) | `55 */6 * * *` (Every 6h at :55) |
| `paklap` | **blocked** | *None* | *None* |
| `daraz` | **experimental** | *None* | *None* |

---

## Staged Rollout Procedure (Stages A → G)

Execute the following 7 stages in strict sequence. **Do not skip stages.** Each stage has explicit success criteria that must be verified before proceeding.

---

### Stage A: Deploy in Disabled Mode (Pre-Flight Baseline)

**Objective:** Deploy the scheduler process safely with zero automated ingestion.

1. Set in production environment:
   ```env
   ENABLE_SCHEDULER=true
   SCHEDULER_ACTIVATION_MODE=disabled
   ```
2. Deploy the `schedulerWorker` singleton process (exactly 1 replica).
3. Verify worker boots and logs `scheduler_disabled`. Verify no cron tasks run.
4. Run baseline diagnostics:
   ```bash
   npx tsx scripts/report-scheduler-health.ts
   npx tsx scripts/report-store-freshness.ts
   ```

**Success Criteria:**
- Worker process starts cleanly.
- Logs confirm `Activation Mode: disabled`.
- Health report shows 0 registered cron tasks.
- Freshness report returns current store data without errors.

---

### Stage B: Transition to Observe Mode (Dry-Run Staging)

**Objective:** Register cron schedules in memory without executing any production ingestion.

1. Set in production environment:
   ```env
   SCHEDULER_ACTIVATION_MODE=observe
   ```
2. Restart `schedulerWorker`.
3. Verify worker logs `Starting ScraperScheduler in "observe" mode` and registers 8 cron tasks.

**Success Criteria:**
- Startup banner displays `Activation Mode: observe`.
- Exactly 8 cron tasks registered (4 discovery + 4 refresh for production stores).
- Paklap and Daraz are explicitly logged as skipped.

---

### Stage C: Validate Observe Mode Behavior

**Objective:** Confirm that cron triggers log dry-run events and perform zero database mutations.

1. Allow at least one cron schedule window to pass (or observe scheduled trigger times).
2. Confirm logs contain:
   ```
   [OBSERVE MODE - NO INGESTION] Cron task triggered for <store> (<job_type>). Ingestion skipped.
   ```
3. Verify with the 6J verification script that catalog counts remain strictly identical:
   ```bash
   npx tsx scripts/verify-6j-scheduler-production.ts
   ```

**Success Criteria:**
- At least one observe-mode trigger event logged.
- Zero database rows created, updated, or deleted.
- Products, variants, and prices counts unchanged from Stage A baseline.

---

### Stage D: Operator-Gated Single-Store Smoke Test

**Objective:** Execute one controlled, bounded scrape to validate the full ingestion pipeline end-to-end.

Execute a single, controlled refresh scrape for one production store (e.g. `priceoye`) with limited catalog size:
```bash
SMOKE_TEST_ENABLED=true SMOKE_TEST_STORE=priceoye SMOKE_TEST_JOB_TYPE=refresh SMOKE_TEST_LIMIT=5 npx tsx scripts/smoke-test-single-store.ts
```

**Safety guarantees during smoke test:**
- Uses existing job protections (DB partial unique index, in-memory mutex).
- Honors `allowCreate=false` for refresh (no new products created).
- Honors domain/redirect validation (Increment 6I).
- Records a normal `scrape_jobs` row (fully auditable).
- Never bypasses production safety checks.
- Does NOT automatically launch a full catalog scrape.

---

### Stage E: Verify Smoke Test Results

**Objective:** Confirm the smoke test completed cleanly with correct data behavior.

1. Check scheduler health — verify the job completed cleanly with `status = 'completed'` and `errors = 0`:
   ```bash
   npx tsx scripts/report-scheduler-health.ts
   ```
2. Check store freshness — verify refreshed URLs have updated `last_scraped_at`:
   ```bash
   npx tsx scripts/report-store-freshness.ts
   ```
3. Check database immutability on catalog structure:
   - Zero unexpected products created during refresh (`allowCreate=false`).
   - Prices recorded properly in `prices` and price history tracked.
   - Coverage percentage reported accurately.
   - No unintended catalog creation occurred.
   - Alerts compatibility maintained (no false alerts from rejected prices).

**Success Criteria:**
- Smoke test job status = `completed`.
- Error count = 0.
- Refreshed URLs show updated `last_scraped_at` timestamps.
- No new products were created (refresh does not create).
- Price history entries are correctly recorded.

---

### Stage F: Activate Production Scheduler

**Objective:** Enable full automated production scheduling. **Only proceed after Stage E verification succeeds.**

1. Update environment:
   ```env
   SCHEDULER_ACTIVATION_MODE=active
   ```
2. Restart `schedulerWorker`.
3. Confirm worker startup banner displays:
   ```
   Activation Mode: active
   ```

**Success Criteria:**
- Startup banner confirms `active` mode.
- 8 cron tasks registered and actively scheduled.
- First scheduled trigger events begin appearing at their configured PKT times.

---

### Stage G: Post-Activation Observation

**Objective:** Monitor the first full production cycles to confirm stable, correct operation.

1. Monitor the first night's discovery runs (03:00–04:30 PKT) and daytime refresh runs.
2. Run `report-store-freshness.ts` daily to monitor coverage and freshness.
3. Run `report-scheduler-health.ts` weekly to confirm no lingering running or stale jobs.

**Observation checklist:**
- [ ] Discovery jobs for all 4 production stores completed successfully.
- [ ] Refresh jobs produced expected coverage percentages (≥70%).
- [ ] No stale jobs accumulated (all jobs completed within 60-minute threshold).
- [ ] Freshness metrics improving (fresh count increasing, stale count decreasing).
- [ ] No unexpected errors or low-coverage warnings.
- [ ] API endpoints remain responsive and unaffected by scheduler activity.

---

## Emergency Rollback

At any point during or after the rollout, to immediately cease all automated scraping:

1. Update environment:
   ```env
   ENABLE_SCHEDULER=false
   SCHEDULER_ACTIVATION_MODE=disabled
   ```
2. Restart or kill the `schedulerWorker` process.
3. Confirm with diagnostics:
   ```bash
   npx tsx scripts/report-scheduler-health.ts
   ```
   Verify: `Activation Mode: disabled` and `Running Jobs: 0`.

See [scheduler-runbook.md](./scheduler-runbook.md) for detailed operational procedures including stale job resolution, health inspection, and restart procedures.
