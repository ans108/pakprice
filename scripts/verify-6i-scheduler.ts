/**
 * scripts/verify-6i-scheduler.ts
 *
 * Programmatic verification script for Increment 6I Acceptance Criteria:
 *   1. scheduler initializes
 *   2. production schedules register
 *   3. Paklap does not register
 *   4. Daraz does not register
 *   5. timezone is Asia/Karachi
 *   6. all discovery schedules are unique/staggered
 *   7. all refresh schedules are unique/staggered
 *   8. no duplicate scheduler tasks are registered
 *   9. in-memory per-store mutex works
 *   10. graceful shutdown stops cron tasks
 *   11. migration 009 file exists
 *   12. live scrape_jobs schema has job_type
 *   13. live scrape_jobs schema has metadata
 *   14. default existing rows are valid
 *   15. partial unique running-job index exists
 *   16. concurrent second running-job creation is rejected safely
 *   17. refresh candidate selection does not duplicate rows
 *   18. stale-first deterministic ordering works
 *   19. no production catalog ingestion occurs
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 6J: Set activation mode for verification (default is 'disabled')
process.env.SCHEDULER_ACTIVATION_MODE = 'active';

import { ScraperScheduler } from '../apps/scraper/src/services/ScraperScheduler';
import { ScraperService } from '../apps/scraper/src/services/ScraperService';
import { scraperConfig, storeScheduleConfigs } from '../apps/scraper/src/config/scraperConfig';
import { RefreshUrlRepository } from '../apps/scraper/src/repositories/RefreshUrlRepository';
import { ScrapeRepository } from '../apps/scraper/src/repositories/ScrapeRepository';

dotenv.config({ path: path.resolve(__dirname, '../apps/scraper/.env') });

const supabaseUrl = process.env.SUPABASE_URL || scraperConfig.supabaseUrl;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || scraperConfig.supabaseServiceKey;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration in environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  INCREMENT 6I — SCHEDULER & REFRESH VERIFICATION SUITE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let passed = 0;
  let failed = 0;

  function assert(description: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  [PASS] ${description}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${description}${details ? ` — ${details}` : ''}`);
      failed++;
    }
  }

  // Record baseline product/variant/price counts before verification (Assertion 19)
  const { count: baselineProducts } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: baselineVariants } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  const { count: baselinePrices } = await supabase.from('prices').select('*', { count: 'exact', head: true });

  console.log(`[BASELINE COUNTS] products: ${baselineProducts}, variants: ${baselineVariants}, prices: ${baselinePrices}\n`);

  // ── 1. Scheduler Initialization & Configuration ───────────────────────────
  console.log('--- Checking Scheduler Configuration & Task Registration ---');
  const scheduler = new ScraperScheduler();
  scheduler.start(true); // forceEnabled for testing

  assert('1. Scheduler initializes successfully', scheduler.isActive());

  const tasks = scheduler.getRegisteredTasks();
  const prodTasks = tasks.filter(t => ['priceoye', 'telemart', 'mega-pk', 'shophive'].includes(t.storeKey));
  assert('2. Production schedules register (8 tasks across 4 stores)', prodTasks.length === 8, `Got ${prodTasks.length}`);

  const paklapTasks = tasks.filter(t => t.storeKey === 'paklap');
  assert('3. Paklap does not register any cron tasks', paklapTasks.length === 0, `Got ${paklapTasks.length}`);

  const darazTasks = tasks.filter(t => t.storeKey === 'daraz');
  assert('4. Daraz does not register any cron tasks', darazTasks.length === 0, `Got ${darazTasks.length}`);

  const allKarachi = tasks.every(t => t.timezone === 'Asia/Karachi');
  assert('5. Timezone is Asia/Karachi for all registered tasks', allKarachi);

  const discoverySchedules = tasks.filter(t => t.jobType === 'discovery').map(t => t.schedule);
  const uniqueDiscovery = new Set(discoverySchedules);
  assert('6. All discovery schedules are unique/staggered', uniqueDiscovery.size === 4 && discoverySchedules.length === 4);

  const refreshSchedules = tasks.filter(t => t.jobType === 'refresh').map(t => t.schedule);
  const uniqueRefresh = new Set(refreshSchedules);
  assert('7. All refresh schedules are unique/staggered', uniqueRefresh.size === 4 && refreshSchedules.length === 4);

  const taskKeys = tasks.map(t => `${t.storeKey}:${t.jobType}`);
  const uniqueTaskKeys = new Set(taskKeys);
  assert('8. No duplicate scheduler tasks are registered', uniqueTaskKeys.size === tasks.length);

  // ── 2. In-Memory Mutex & Graceful Shutdown ────────────────────────────────
  console.log('\n--- Checking In-Memory Mutex & Shutdown ---');
  let releaseHold: () => void;
  const holdPromise = new Promise<void>(res => { releaseHold = res; });
  let invocationCount = 0;

  const mockService = {
    runStore: async () => {
      invocationCount++;
      await holdPromise;
      return { storeKey: 'priceoye', success: true, status: 'completed', metrics: {} as any };
    },
    runRefresh: async () => {
      invocationCount++;
      await holdPromise;
      return { storeKey: 'priceoye', success: true, status: 'completed', metrics: {} as any };
    },
  } as unknown as ScraperService;

  const mutexScheduler = new ScraperScheduler(mockService);
  const bgRun = mutexScheduler.runStoreWithMutex('priceoye', 'discovery');
  
  // Second invocation while running
  await mutexScheduler.runStoreWithMutex('priceoye', 'discovery');
  releaseHold!();
  await bgRun;

  assert('9. In-memory per-store mutex skips concurrent execution for same store', invocationCount === 1, `Got ${invocationCount}`);

  scheduler.stop();
  assert('10. Graceful shutdown stops cron tasks cleanly', !scheduler.isActive() && scheduler.getRegisteredTasks().length === 0);

  // ── 3. Migration 009 & Database Schema ────────────────────────────────────
  console.log('\n--- Checking Migration 009 & Live Database Schema ---');
  const migrationPath = path.resolve(__dirname, '../database/migrations/009_scrape_jobs_job_type.sql');
  const migrationExists = fs.existsSync(migrationPath);
  assert('11. Migration 009 SQL file exists', migrationExists);

  if (migrationExists) {
    const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
    assert('11b. Migration 009 defines job_type check constraint', migrationContent.includes("CHECK (job_type IN ('discovery', 'refresh'))"));
    assert('11c. Migration 009 defines uq_scrape_jobs_one_running_store partial unique index', migrationContent.includes('uq_scrape_jobs_one_running_store'));
  }

  // Live schema check on scrape_jobs
  const { data: sampleRow, error: schemaErr } = await supabase
    .from('scrape_jobs')
    .select('id, job_type, metadata, status, store_id')
    .limit(1);

  if (schemaErr) {
    console.warn('\n  [NOTICE] Migration 009 has not yet been applied to the remote Supabase database.');
    console.warn('  Run database/migrations/009_scrape_jobs_job_type.sql in Supabase SQL Editor.');
    console.warn(`  Schema query diagnostic: ${schemaErr.message}\n`);
    assert('12. Live scrape_jobs schema has job_type', false, schemaErr.message);
    assert('13. Live scrape_jobs schema has metadata', false, schemaErr.message);
    assert('14. Default existing rows are valid', false, 'Pending migration execution');
    assert('15. Partial unique running-job index exists', false, 'Pending migration execution');
    assert('16. Concurrent second running-job creation rejected safely', false, 'Pending migration execution');
  } else {
    assert('12. Live scrape_jobs schema has job_type column', true);
    assert('13. Live scrape_jobs schema has metadata column', true);

    const { data: existingRows } = await supabase
      .from('scrape_jobs')
      .select('job_type')
      .limit(10);
    const validJobTypes = (existingRows || []).every(r => r.job_type === 'discovery' || r.job_type === 'refresh');
    assert('14. Default existing rows have valid job_type values', validJobTypes);

    // Concurrency test using live DB unique constraint
    const { data: storeRow } = await supabase.from('stores').select('id').limit(1).single();
    if (storeRow) {
      const testStoreId = storeRow.id;

      // Ensure no dangling running job for this test store
      await supabase.from('scrape_jobs').delete().eq('store_id', testStoreId).eq('status', 'running');

      const scrapeRepo = new ScrapeRepository();
      const firstJobId = await scrapeRepo.createJob(testStoreId, 'system', 'discovery');
      assert('15. Partial unique running-job index allows first running job', firstJobId !== null);

      // Attempt concurrent second running job insertion for same store
      const secondJobId = await scrapeRepo.createJob(testStoreId, 'system', 'discovery');
      assert('16. Concurrent second running-job creation is rejected safely (returns null)', secondJobId === null);

      // Cleanup test running job
      if (firstJobId) {
        await supabase.from('scrape_jobs').delete().eq('id', firstJobId);
      }
    }
  }

  // ── 4. Refresh Candidate Selection & Ordering ─────────────────────────────
  console.log('\n--- Checking Refresh Candidate Selection on Live DB ---');
  const { data: poStore } = await supabase.from('stores').select('id').eq('slug', 'priceoye').single();
  if (poStore) {
    const refreshRepo = new RefreshUrlRepository(supabase);
    const candidates = await refreshRepo.getRefreshCandidates(poStore.id, 50);

    // Verify exactly one candidate per variant (no row multiplication from multiple identifiers)
    const variantIdSet = new Set(candidates.map(c => c.variantId));
    assert('17. Refresh candidate selection does not duplicate rows (1 candidate per variant)', variantIdSet.size === candidates.length, `${variantIdSet.size} unique vs ${candidates.length} total`);

    // Verify deterministic stale-first ordering
    let orderingCorrect = true;
    for (let i = 0; i < candidates.length - 1; i++) {
      const curr = candidates[i].lastScrapedAt;
      const next = candidates[i + 1].lastScrapedAt;
      if (curr !== null && next === null) {
        // null must come before non-null
        orderingCorrect = false;
        break;
      }
      if (curr !== null && next !== null && curr > next) {
        // older date must come before newer date
        orderingCorrect = false;
        break;
      }
    }
    assert('18. Stale-first deterministic ordering works (nulls first, then oldest timestamps)', orderingCorrect);
  } else {
    assert('17. Refresh candidate selection (store found)', false, 'PriceOye store not found');
    assert('18. Stale-first ordering', false, 'PriceOye store not found');
  }

  // ── 5. Production Catalog Integrity ───────────────────────────────────────
  console.log('\n--- Verifying Zero Production Catalog Ingestion ---');
  const { count: afterProducts } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: afterVariants } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  const { count: afterPrices } = await supabase.from('prices').select('*', { count: 'exact', head: true });

  const zeroCatalogWrites = (
    afterProducts === baselineProducts &&
    afterVariants === baselineVariants &&
    afterPrices === baselinePrices
  );

  assert(
    '19. Zero production catalog ingestion occurred during verification',
    zeroCatalogWrites,
    `Products: ${baselineProducts}->${afterProducts}, Variants: ${baselineVariants}->${afterVariants}, Prices: ${baselinePrices}->${afterPrices}`
  );

  console.log('\n═════════════════════════════════════════════════════════════');
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('═════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
