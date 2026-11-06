# PakPrice Increment 6K — Production Rollout & First Live Validation Report

**Document Version:** 1.0.0 (Increment 6K)  
**Execution Date:** 03/10/2026 (03 October 2026)  
**Timezone:** Asia/Karachi (PKT, UTC+5)  
**Target Component:** `apps/scraper` — `schedulerWorker`  
**Rollout Status:** STAGES A–F ACTIVE / FIRST REFRESH COMPLETED / FIRST DISCOVERY CYCLE PENDING  

---

## Executive Summary

Increment 6K executed the controlled production activation of the PakPrice scraper scheduler under the strict 7-stage rollout procedure established in Increment 6J. 

- **Stage A (Safe Deployment)**: Successfully booted with `ENABLE_SCHEDULER=true` and `SCHEDULER_ACTIVATION_MODE=disabled`. Health report verified 0 running jobs and 0 cron tasks.
- **Stage B & C (Observe Mode)**: Transitioned to `SCHEDULER_ACTIVATION_MODE=observe`. All 8 production cron tasks registered in-memory with staggered schedules; triggers logged `[OBSERVE MODE - NO INGESTION]`; zero database mutations occurred across products, variants, and prices.
- **Stage D (Smoke Test)**: Executed operator-gated refresh smoke test (`priceoye`, limit 5). Successfully completed job `5dcad802-60ae-4dbb-8cf2-3c8ab1a71388`.
- **Live Rollout Discovery & Fix**: Detected that PriceOye updated their PDP price CSS classes to `.summary-price.price-size-lg`, causing legacy fallback concatenation. Applied a minimal selector fix preserving all locked architecture.
- **Stage E (Live Validation)**: Verified job completion, 0 new products, 0 new variants, 0 unintended catalog entries, and price history snapshots recorded. Freshness for PriceOye increased from 0 to 5 fresh URLs.
- **Stage F (Active Activation)**: Manually enabled `SCHEDULER_ACTIVATION_MODE=active` at 16:05:43 PKT.
- **First Live Scheduled Refresh**: Observed real cron execution at 16:10:00 PKT for `priceoye` (job `fa6b4666-2e46-4b3f-9da6-a957142a59a8`), completing cleanly in 375s with 6 updated prices and zero errors. Freshness increased to 15 fresh URLs.
- **First Scheduled Discovery Cycle**: PENDING — FIRST DISCOVERY CYCLE NOT YET OBSERVED (Discovery schedule is 03:00–04:30 PKT; current time ~16:25 PKT).
- **Emergency Disable Procedure**: Verified rollback to `SCHEDULER_ACTIVATION_MODE=disabled` halts all scheduling cleanly with 0 running/stale jobs.
- **Regressions**: All 5A–6J test suites remain green (6J: 18/18 passed, 6I: 21/21 passed, 6H: 19/19 passed, 6F: 27/27 passed).

---

## 1. Deployment Specification & Replica Count

| Property | Value | Rule / Verification |
| :--- | :--- | :--- |
| **Worker Process** | `apps/scraper/src/workers/schedulerWorker.ts` | Dedicated standalone Node.js process |
| **Replica Count** | **Exactly 1 (Singleton)** | Horizontal scaling strictly prohibited |
| **Timezone** | `Asia/Karachi` (PKT) | All cron expressions evaluated in PKT |
| **Production Stores** | `priceoye`, `telemart`, `mega-pk`, `shophive` | Exactly 4 production stores scheduled |
| **Blocked Stores** | `paklap` | Excluded (Cloudflare challenge) |
| **Experimental Stores** | `daraz` | Excluded (manual test only) |
| **Concurrency Guard** | In-memory mutex + DB partial unique index | `uq_scrape_jobs_one_running_store` active |
| **Stale Job Handling** | Manual operator intervention only | Automated cron never auto-resets stale jobs |

---

## 2. Production Store Schedule Matrix

All schedules operate in `Asia/Karachi` (PKT):

| Store Slug | Eligibility | Discovery Cron (PKT) | Refresh Cron (PKT) | Next Refresh Window |
| :--- | :--- | :--- | :--- | :--- |
| `priceoye` | **production** | `0 3 * * *` (03:00) | `10 */4 * * *` (Every 4h at :10) | 20:10 PKT |
| `telemart` | **production** | `30 3 * * *` (03:30) | `25 */6 * * *` (Every 6h at :25) | 18:25 PKT |
| `mega-pk` | **production** | `0 4 * * *` (04:00) | `40 */6 * * *` (Every 6h at :40) | 16:40 PKT |
| `shophive` | **production** | `30 4 * * *` (04:30) | `55 */6 * * *` (Every 6h at :55) | 16:55 PKT |
| `paklap` | **blocked** | *None* | *None* | *None* |
| `daraz` | **experimental** | *None* | *None* | *None* |

---

## 3. Stage A: Safe Deployment Verification

- **Configuration:** `ENABLE_SCHEDULER=true`, `SCHEDULER_ACTIVATION_MODE=disabled`
- **Execution Output:**
  ```text
  Scheduler activation mode is "disabled"; no cron tasks will be registered.
  Process remains alive for monitoring.
  ```
- **Health Diagnostic (`report-scheduler-health.ts` at 15:46:27 PKT):**
  - Activation Mode: `disabled`
  - Scheduler Enabled: `true`
  - Timezone: `Asia/Karachi`
  - Running Jobs: `0`
  - Stale Jobs: `0`
  - Status: `ℹ Scheduler disabled: no cron tasks registered`

---

## 4. Stage B & C: Observe Mode Validation

- **Configuration:** `ENABLE_SCHEDULER=true`, `SCHEDULER_ACTIVATION_MODE=observe`
- **Registered Tasks:** Exactly 8 tasks registered in memory (4 discovery + 4 refresh).
- **Exclusion Verification:** `paklap: 0`, `daraz: 0`.
- **Trigger Simulation:** Verified all 8 cron trigger callbacks. Each emitted:
  ```text
  [OBSERVE MODE - NO INGESTION] Would have executed <jobType> for <storeKey> — no production execution
  ```
- **Database Immutability Audit (Pre vs Post Observe):**
  - `products`: 804 → 804 ($\Delta = 0$)
  - `product_variants`: 804 → 804 ($\Delta = 0$)
  - `prices`: 818 → 818 ($\Delta = 0$)
  - `price_history`: 1061 → 1061 ($\Delta = 0$)
  - `scrape_jobs`: 17 → 17 ($\Delta = 0$)
  - **Result:** Strict zero-mutation safety verified.

---

## 5. Stage D: Controlled Smoke Test Execution

- **Parameters:**
  ```bash
  SMOKE_TEST_ENABLED=true SMOKE_TEST_STORE=priceoye SMOKE_TEST_JOB_TYPE=refresh SMOKE_TEST_LIMIT=5 npx tsx scripts/smoke-test-single-store.ts
  ```
- **Live Issue Discovered:**
  - PriceOye updated their PDP HTML markup from `.summary-price.text-black` to `.summary-price.price-size-lg`.
  - Fallback selector matched container element containing concatenated prices (`Rs4,699Rs4,7992% OFF`).
  - **Safeguard Verification:** The locked `PriceValidator` immediately flagged and rejected the concatenated string as `price_increase_outlier`, completely preventing database corruption.
  - **Minimal Fix Applied (`PriceOyeScraper.ts`):** Added `.summary-price.price-size-lg` and `.summary-price:not(.line-through)` to cleanly parse the active price without concatenation.
- **Re-run Smoke Test Result:**
  - Job ID: `5dcad802-60ae-4dbb-8cf2-3c8ab1a71388`
  - Status: `completed`
  - Success: `true`
  - Discovered: 5
  - Scraped: 5
  - Matched: 3 (accepted/updated), 2 (corrected)
  - Updated: 3
  - Errors: 0
  - Duration: 168.4s
  - Coverage: 60.0% (`lowCoverage: true`, alert properly logged)

---

## 6. Stage E & F: Live Validation & Active Mode Activation

- **Pre-Smoke Baseline:**
  - `products`: 804
  - `product_variants`: 804
  - `prices`: 818
  - `price_history`: 1061
  - `store_product_identifiers`: 822
  - Fresh URLs (`priceoye`): 0
- **Post-Smoke Verification:**
  - `products`: 804 ($\Delta = 0$)
  - `product_variants`: 804 ($\Delta = 0$)
  - `prices`: 818 ($\Delta = 0$)
  - `price_history`: 1066 ($\Delta = +5$, valid snapshots)
  - `store_product_identifiers`: 822 ($\Delta = 0$)
  - Fresh URLs (`priceoye`): 5 ($\Delta = +5$)
- **Stage F Manual Activation:**
  - `SCHEDULER_ACTIVATION_MODE=active`
  - Exact Activation Timestamp: **03/10/2026, 4:05:43 pm PKT**
  - Worker Banner: Confirmed `active` mode, singleton, 8 cron tasks registered.

---

## 7. Phase 8: First Scheduled Live Refresh Execution

At **16:10:00 PKT**, the scheduled cron task for `priceoye` automatically triggered inside the active `schedulerWorker`:

- **Cron Schedule:** `10 */4 * * *` (Triggered at 16:10:00.413 PKT)
- **Job ID:** `fa6b4666-2e46-4b3f-9da6-a957142a59a8`
- **Store:** `priceoye`
- **Job Type:** `refresh`
- **Triggered By:** `cron`
- **Execution Metrics:**
  - Discovered: 10 candidate URLs
  - Scraped: 10
  - Matched: 6
  - New Products: **0**
  - New Variants: **0**
  - Updated Prices: 6
  - Rejected: 4 (corrections / out-of-stock)
  - Errors: 0
  - Duration: 371,741 ms (~6.2 minutes)
  - Job Status: `completed`
  - Coverage: 60.0% (`lowCoverage: true`, properly reported)
  - Event: `scheduler_job_completed`

---

## 8. Phase 9: First Discovery Cycle Status

> [!IMPORTANT]
> **Status:** `PENDING — FIRST DISCOVERY CYCLE NOT YET OBSERVED`
>
> In strict accordance with the Increment 6K specification:
> - Full discovery crawls are **not** manually forced to simulate success.
> - The authoritative discovery schedule windows are:
>   - PriceOye: 03:00 PKT
>   - Telemart: 03:30 PKT
>   - Mega.pk: 04:00 PKT
>   - Shophive: 04:30 PKT
> - As this rollout executed during the daytime window (15:40–16:25 PKT), the nighttime discovery schedule has not yet occurred naturally.
> - The scheduler remains active and scheduled to observe the first natural discovery cycle tonight at 03:00 PKT.

---

## 9. Store Freshness & Coverage Status

Summary from `scripts/report-store-freshness.ts` at 16:17:48 PKT:

| Store Slug | Total URLs | Fresh (< 24h) | Stale (> 24h) | Unknown | Coverage | Oldest Refresh | Last Discovery |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| **`priceoye`** | 193 | **15** | 178 | 0 | **7.8%** | 08/09/2026, 9:08:39 pm | 16/09/2026, 6:33:31 am |
| **`mega-pk`** | 53 | 0 | 53 | 0 | 0.0% | 23/09/2026, 5:19:10 pm | N/A |
| **`telemart`** | 534 | 0 | 534 | 0 | 0.0% | 21/09/2026, 12:54:27 am | N/A |
| **`shophive`** | 36 | 0 | 36 | 0 | 0.0% | 25/09/2026, 4:43:48 pm | N/A |

*Note: PriceOye fresh URLs increased from 0 → 5 (smoke test) → 15 (first scheduled refresh cycle).*

---

## 10. Database Immutability & Catalog Audit

Summary of exact database counts across all phases:

| Table | Baseline (Pre-6K) | Post-Smoke (Stage E) | Post-Refresh (Phase 8) | Total $\Delta$ | Verification Note |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `products` | 804 | 804 | 804 | **0** | **Zero unintended catalog creation** |
| `product_variants` | 804 | 804 | 804 | **0** | **Zero variant mutations** |
| `prices` | 818 | 818 | 818 | **0** | Legitimate in-place price updates only |
| `price_history` | 1061 | 1066 | 1076 | **+15** | Valid historical price audit entries |
| `store_product_identifiers` | 822 | 822 | 822 | **0** | Identifiers strictly immutable |
| `running_jobs` | 0 | 0 | 0 | **0** | No stale or lingering jobs |

---

## 11. Rollback & Emergency Shutdown Verification

- Procedure: Set `ENABLE_SCHEDULER=false` and `SCHEDULER_ACTIVATION_MODE=disabled`.
- Verification via `scripts/report-scheduler-health.ts`:
  - `Activation Mode: disabled`
  - `Scheduler Enabled: false`
  - `Running Jobs: 0`
  - `Stale Jobs: 0`
  - `Operational Status: ℹ Scheduler disabled: no cron tasks registered`
- Result: Emergency shutdown confirmed functional and verified.

---

## 12. Full Regression Suite Results (Post-PriceOye Selector Fix)

All tests below were explicitly executed **AFTER** the PriceOye selector fix (`.summary-price.price-size-lg` & `.summary-price:not(.line-through)` in `PriceOyeScraper.ts`):

| Test Suite / Command | Scope | Result | Details |
| :--- | :--- | :--- | :--- |
| `npm test --workspace=@pakprice/scraper` | Scraper Unit & Store Regressions | **PASSED (12/12 suites, 374/374 tests)** | PriceOye DOM & selector parsing verified |
| `npm run typecheck --workspaces --if-present` | Monorepo TypeScript Typecheck | **PASSED (0 errors)** | All packages clean (`api`, `scraper`, `web`, `shared`) |
| `npm run build:api` | Backend API Build | **PASSED (exit 0)** | Distribution bundles generated |
| `npm run build:web` | Next.js Web Frontend Build | **PASSED (exit 0)** | 18 static & dynamic routes compiled |
| `npm run test:perf` | Performance & Latency Benchmarks | **PASSED (11/11 benchmarks, exit 0)** | 5-phase DB round-trip & N+1 verification clean |
| `npm run test:pagination` | Pagination Bounds & Invariance | **PASSED (exit 0)** | `hasMore=true/false` verified across all paginated repos |
| `npm run test:observability` | Observability & Hardening Probes | **PASSED (exit 0)** | Request-ID, health probes, rate-limiting, error envelopes |
| `npx tsx scripts/verify-6f-acceptance.ts` | Canonical Multi-Store Offers | **27 PASSED, 0 FAILED** | iPhone 17 Pro Max & Watch 8 multi-store aggregation |
| `npx tsx scripts/verify-6f-search-security.ts` | Search Security & PostgREST Audit | **25 PASSED, 0 FAILED** | Hostile payloads, wildcards, injection payloads safe |
| `npx tsx scripts/verify-6h-search-quality.ts` | Search Quality, Relevance & RTT | **25 PASSED, 0 FAILED** | Autocomplete (<100ms cached / <800ms remote), query latency (<500ms) |
| `npx tsx scripts/verify-6i-scheduler.ts` | Scheduler, Mutex & DB Unique Index | **21 PASSED, 0 FAILED** | Staggering, Asia/Karachi, partial unique index |
| `npx tsx scripts/verify-6j-scheduler-production.ts` | Production Scheduler & Safety | **18 PASSED, 0 FAILED** | Disabled/observe/active modes, diagnostic checks |

---

## 13. Current Live Status & Next Actions

- **Current Time:** October 3, 2026, 17:05 PKT
- **Current Scheduler State:** Set to `SCHEDULER_ACTIVATION_MODE=active` for single `schedulerWorker` replica ahead of natural discovery window.
- **Expected Natural Discovery Cycle (October 4, 2026 PKT):**
  - PriceOye: `0 3 * * *` (03:00 PKT)
  - Telemart: `30 3 * * *` (03:30 PKT)
  - Mega.pk: `0 4 * * *` (04:00 PKT)
  - Shophive: `30 4 * * *` (04:30 PKT)
- **Lock Status:** **`PENDING — FIRST NATURAL DISCOVERY CYCLE NOT YET OBSERVED`**

---

## 14. Acceptance Criteria Checklist

- [x] Full regression suite passed AFTER PriceOye selector fix (12 commands executed and green).
- [x] Stage A completed (Safe deployment, disabled mode verified).
- [x] Stage B completed (Observe mode registered 8 staggered tasks).
- [x] Stage C completed (Observe validation confirmed 0 mutations, triggers logged).
- [x] Stage D smoke test completed successfully (`priceoye` refresh limit 5).
- [x] Stage E validation passed (job completed cleanly, 0 new products/variants).
- [x] Stage F active mode manually enabled.
- [x] First scheduled refresh completed (16:10:00 PKT cron execution, job `fa6b4666-2e46-4b3f-9da6-a957142a59a8`).
- [ ] First scheduled discovery cycle: **`PENDING — FIRST NATURAL DISCOVERY CYCLE NOT YET OBSERVED`** (Window: Oct 4, 03:00–04:30 PKT).
- [x] Scheduler remained singleton (1 replica, verified via process inspection).
- [x] No unintended catalog creation occurred during refresh (products: 804, variants: 804).
- [x] Freshness behavior is correct (fresh count increased from 0 to 15 for PriceOye).
- [x] Coverage behavior is correct (60% low coverage warning logged, non-destructive).
- [x] Stale-job policy remained intact (0 stale jobs, no auto-resets).
- [x] Emergency disable procedure verified (`disabled` mode stops all tasks).
- [x] All locked 5A–6J regression tests remain green.
