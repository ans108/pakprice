/**
 * scripts/report-scheduler-health.ts
 *
 * READ-ONLY diagnostic script — reports scheduler health and operational status.
 *
 * SAFETY GUARANTEES:
 * - Never resets stale jobs
 * - Never retries jobs
 * - Never triggers scrapes
 * - Never modifies the database
 *
 * Usage: npx tsx scripts/report-scheduler-health.ts
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../apps/scraper/.env') });

import { createClient } from '@supabase/supabase-js';
import { scraperConfig, storeScheduleConfigs } from '../apps/scraper/src/config/scraperConfig';

const supabaseUrl = process.env.SUPABASE_URL || scraperConfig.supabaseUrl;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || scraperConfig.supabaseServiceKey;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function toKarachiTime(iso: string | null): string {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  } catch {
    return iso;
  }
}

async function main() {
  let queryCount = 0;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SCHEDULER HEALTH REPORT');
  console.log(`  Generated: ${toKarachiTime(new Date().toISOString())} PKT`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 1. Configuration
  console.log('--- Configuration ---');
  console.log(`  Activation Mode:     ${scraperConfig.schedulerActivationMode}`);
  console.log(`  Scheduler Enabled:   ${scraperConfig.schedulerEnabled}`);
  console.log(`  Timezone:            ${scraperConfig.schedulerTimezone}`);
  console.log(`  Min Coverage:        ${scraperConfig.minimumCoveragePct}%`);
  console.log(`  Refresh Limit:       ${scraperConfig.refreshUrlLimit}`);
  console.log(`  Freshness Threshold: ${scraperConfig.freshnessThresholdHours}h`);
  console.log(`  Stale Job Threshold: ${scraperConfig.staleJobThresholdMinutes}min`);

  // 2. Production Store Configuration
  console.log('\n--- Production Store Schedules ---');
  for (const [key, cfg] of Object.entries(storeScheduleConfigs)) {
    console.log(
      `  ${key.padEnd(12)} eligibility: ${cfg.eligibility.padEnd(14)} discovery: ${(cfg.discoverySchedule || 'NULL').padEnd(14)} refresh: ${cfg.refreshSchedule || 'NULL'}`
    );
  }

  // 3. Currently Running Jobs
  console.log('\n--- Currently Running Jobs ---');
  const { data: runningJobs } = await supabase
    .from('scrape_jobs')
    .select('id, store_id, started_at, triggered_by, job_type, products_scraped, errors_count')
    .eq('status', 'running');
  queryCount++;

  if (runningJobs && runningJobs.length > 0) {
    for (const job of runningJobs) {
      const ageMinutes = Math.floor(
        (Date.now() - new Date(job.started_at).getTime()) / 60000
      );
      const isStale = ageMinutes >= scraperConfig.staleJobThresholdMinutes;
      console.log(
        `  Job ${job.id.substring(0, 8)}... store_id=${job.store_id.substring(0, 8)} type=${job.job_type || 'discovery'} age=${ageMinutes}min trigger=${job.triggered_by} ${isStale ? '⚠️ STALE' : '✓'}`
      );
    }
  } else {
    console.log('  No running jobs.');
  }

  // 4. Stale Jobs
  console.log(
    '\n--- Stale Jobs (> ' + scraperConfig.staleJobThresholdMinutes + ' min) ---'
  );
  const staleCutoff = new Date(
    Date.now() - scraperConfig.staleJobThresholdMinutes * 60 * 1000
  ).toISOString();
  const { data: staleJobs } = await supabase
    .from('scrape_jobs')
    .select('id, store_id, started_at, triggered_by, job_type')
    .eq('status', 'running')
    .lt('started_at', staleCutoff);
  queryCount++;

  if (staleJobs && staleJobs.length > 0) {
    for (const job of staleJobs) {
      console.log(
        `  ⚠️  Job ${job.id.substring(0, 8)}... store_id=${job.store_id.substring(0, 8)} started=${toKarachiTime(job.started_at)}`
      );
    }
    console.log(
      '  ACTION REQUIRED: Reset stale jobs manually with: npx tsx scripts/resetScrapeJob.ts <storeSlug>'
    );
  } else {
    console.log('  No stale jobs detected.');
  }

  // 5. Last Completed Jobs (per store, per type)
  console.log('\n--- Last Completed Jobs ---');
  const productionStores = ['priceoye', 'telemart', 'mega-pk', 'shophive'];
  const { data: stores } = await supabase
    .from('stores')
    .select('id, slug, name')
    .in('slug', productionStores);
  queryCount++;

  if (stores) {
    for (const store of stores) {
      // Last discovery
      const { data: lastDisc } = await supabase
        .from('scrape_jobs')
        .select('completed_at, products_scraped, errors_count, metadata')
        .eq('store_id', store.id)
        .eq('status', 'completed')
        .eq('job_type', 'discovery')
        .order('completed_at', { ascending: false })
        .limit(1);
      queryCount++;

      // Last refresh
      const { data: lastRef } = await supabase
        .from('scrape_jobs')
        .select('completed_at, products_scraped, errors_count, metadata')
        .eq('store_id', store.id)
        .eq('status', 'completed')
        .eq('job_type', 'refresh')
        .order('completed_at', { ascending: false })
        .limit(1);
      queryCount++;

      const discInfo = lastDisc?.[0]
        ? `${toKarachiTime(lastDisc[0].completed_at)} (${lastDisc[0].products_scraped} products, ${lastDisc[0].errors_count} errors)`
        : 'Never';
      const refInfo = lastRef?.[0]
        ? `${toKarachiTime(lastRef[0].completed_at)} (${lastRef[0].products_scraped} products, ${lastRef[0].errors_count} errors)`
        : 'Never';

      const refMeta = lastRef?.[0]?.metadata as any;
      const coverageInfo = refMeta?.coveragePct !== undefined
        ? ` coverage=${refMeta.coveragePct}%${refMeta.lowCoverage ? ' ⚠️ LOW' : ''}`
        : '';

      console.log(`  ${store.slug.padEnd(12)} discovery: ${discInfo}`);
      console.log(`  ${''.padEnd(12)} refresh:   ${refInfo}${coverageInfo}`);
    }
  }

  // 6. Recent Failed Jobs
  console.log('\n--- Recent Failed Jobs (last 10) ---');
  const { data: failedJobs } = await supabase
    .from('scrape_jobs')
    .select('id, store_id, completed_at, job_type, errors_count, metadata')
    .eq('status', 'failed')
    .order('completed_at', { ascending: false })
    .limit(10);
  queryCount++;

  if (failedJobs && failedJobs.length > 0) {
    for (const job of failedJobs) {
      const meta = job.metadata as any;
      const errorCat = meta?.errorCategory || 'UNKNOWN';
      const coverageInfo =
        meta?.coveragePct !== undefined ? ` coverage=${meta.coveragePct}%` : '';
      console.log(
        `  ${job.id.substring(0, 8)}... store=${job.store_id.substring(0, 8)} type=${job.job_type || '?'} errors=${job.errors_count} cat=${errorCat}${coverageInfo} at=${toKarachiTime(job.completed_at)}`
      );
    }
  } else {
    console.log('  No failed jobs found.');
  }

  // 7. Low-Coverage Jobs
  console.log('\n--- Low Coverage Jobs (recent, metadata.lowCoverage=true) ---');
  const { data: recentCompletedJobs } = await supabase
    .from('scrape_jobs')
    .select('id, store_id, completed_at, job_type, metadata')
    .eq('status', 'completed')
    .not('metadata', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(50);
  queryCount++;

  const lowCoverageJobs = (recentCompletedJobs || []).filter(
    (j: any) => j.metadata?.lowCoverage === true
  );
  if (lowCoverageJobs.length > 0) {
    for (const job of lowCoverageJobs.slice(0, 10)) {
      const meta = job.metadata as any;
      console.log(
        `  ${job.id.substring(0, 8)}... store=${job.store_id.substring(0, 8)} type=${job.job_type} coverage=${meta?.coveragePct}% min=${meta?.minimumCoveragePct}% target=${meta?.targetCount} success=${meta?.successCount} at=${toKarachiTime(job.completed_at)}`
      );
    }
  } else {
    console.log('  No low-coverage jobs found.');
  }

  // 8. Operational Status Summary
  console.log('\n--- Operational Status ---');
  const runningCount = runningJobs?.length ?? 0;
  const staleCount = staleJobs?.length ?? 0;

  if (scraperConfig.schedulerActivationMode === 'active' && runningCount === 0 && staleCount === 0) {
    console.log('  ✓ Scheduler operational: active mode, no running/stale jobs.');
  } else if (scraperConfig.schedulerActivationMode === 'observe') {
    console.log('  ℹ Scheduler in observe mode: monitoring only, no production execution.');
  } else if (scraperConfig.schedulerActivationMode === 'disabled') {
    console.log('  ℹ Scheduler disabled: no cron tasks registered.');
  }
  if (staleCount > 0) {
    console.log(`  ⚠️ ${staleCount} stale job(s) require manual intervention.`);
  }

  console.log(`\nTotal database queries: ${queryCount}`);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  This report is READ-ONLY. No database mutations occurred.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
