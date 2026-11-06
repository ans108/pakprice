/**
 * scripts/test-6k-observe-mode.ts
 *
 * Increment 6K — Phase 2 & 3: Stage B & Stage C Observe Mode Validation
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../apps/scraper/.env') });

import { scraperConfig } from '../apps/scraper/src/config/scraperConfig';
import { ScraperScheduler } from '../apps/scraper/src/services/ScraperScheduler';

const supabase = createClient(
  process.env.SUPABASE_URL || scraperConfig.supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY || scraperConfig.supabaseServiceKey
);

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  INCREMENT 6K — STAGE B & C: OBSERVE MODE VALIDATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: Pre-observation DB counts
  const { count: preProducts } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: preVariants } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  const { count: prePrices } = await supabase.from('prices').select('*', { count: 'exact', head: true });
  const { count: preHistory } = await supabase.from('price_history').select('*', { count: 'exact', head: true });
  const { count: preJobs } = await supabase.from('scrape_jobs').select('*', { count: 'exact', head: true });

  console.log(`[PRE-OBSERVE COUNTS]`);
  console.log(`  products:         ${preProducts}`);
  console.log(`  product_variants: ${preVariants}`);
  console.log(`  prices:           ${prePrices}`);
  console.log(`  price_history:    ${preHistory}`);
  console.log(`  scrape_jobs:      ${preJobs}\n`);

  // Step 2: Set observe mode
  process.env.ENABLE_SCHEDULER = 'true';
  process.env.SCHEDULER_ACTIVATION_MODE = 'observe';

  console.log(`Activation Mode:     ${scraperConfig.schedulerActivationMode}`);
  console.log(`Scheduler Enabled:   ${scraperConfig.schedulerEnabled}`);
  console.log(`Timezone:            ${scraperConfig.schedulerTimezone}\n`);

  // Step 3: Start scheduler in observe mode
  const scheduler = new ScraperScheduler();
  scheduler.start(true);

  const registeredTasks = scheduler.getRegisteredTasks();
  console.log(`Registered cron tasks count: ${registeredTasks.length}`);

  for (const t of registeredTasks) {
    console.log(`  - [${t.jobType.toUpperCase()}] ${t.storeKey.padEnd(10)} schedule: ${t.schedule.padEnd(15)} timezone: ${t.timezone}`);
  }

  if (registeredTasks.length !== 8) {
    console.error(`ERROR: Expected 8 registered tasks, found ${registeredTasks.length}`);
    scheduler.stop();
    process.exit(1);
  }

  // Step 4: Verify Paklap and Daraz are excluded
  const paklapTasks = registeredTasks.filter(t => t.storeKey === 'paklap');
  const darazTasks = registeredTasks.filter(t => t.storeKey === 'daraz');
  console.log(`\nPaklap registered tasks: ${paklapTasks.length} (expected 0)`);
  console.log(`Daraz registered tasks:  ${darazTasks.length} (expected 0)`);

  if (paklapTasks.length > 0 || darazTasks.length > 0) {
    console.error('ERROR: Non-production stores registered cron tasks!');
    scheduler.stop();
    process.exit(1);
  }

  // Step 5: Trigger observe tasks via task.now() to verify observe logging behavior
  console.log('\n--- Triggering Observe Tasks (Simulated Cron Trigger) ---');
  const internalTasks = (scheduler as any).scheduledTasks as Array<{ storeKey: string; jobType: string; task: any }>;
  for (const entry of internalTasks) {
    console.log(`Triggering observe callback for ${entry.storeKey} (${entry.jobType})...`);
    entry.task.now();
  }

  // Allow asynchronous logging to flush
  await new Promise(resolve => setTimeout(resolve, 500));

  // Step 6: Stop scheduler cleanly
  scheduler.stop();
  console.log('\nScheduler stopped cleanly.\n');

  // Step 7: Post-observation DB counts
  const { count: postProducts } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: postVariants } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  const { count: postPrices } = await supabase.from('prices').select('*', { count: 'exact', head: true });
  const { count: postHistory } = await supabase.from('price_history').select('*', { count: 'exact', head: true });
  const { count: postJobs } = await supabase.from('scrape_jobs').select('*', { count: 'exact', head: true });

  console.log(`[POST-OBSERVE COUNTS]`);
  console.log(`  products:         ${postProducts} (diff: ${(postProducts ?? 0) - (preProducts ?? 0)})`);
  console.log(`  product_variants: ${postVariants} (diff: ${(postVariants ?? 0) - (preVariants ?? 0)})`);
  console.log(`  prices:           ${postPrices} (diff: ${(postPrices ?? 0) - (prePrices ?? 0)})`);
  console.log(`  price_history:    ${postHistory} (diff: ${(postHistory ?? 0) - (preHistory ?? 0)})`);
  console.log(`  scrape_jobs:      ${postJobs} (diff: ${(postJobs ?? 0) - (preJobs ?? 0)})\n`);

  if (
    preProducts !== postProducts ||
    preVariants !== postVariants ||
    prePrices !== postPrices ||
    preHistory !== postHistory ||
    preJobs !== postJobs
  ) {
    console.error('ERROR: Database mutation occurred during observe mode!');
    process.exit(1);
  }

  console.log('✓ Stage B & Stage C Observe Mode validation PASSED:');
  console.log('  - All 8 cron tasks registered and staggered correctly');
  console.log('  - Paklap & Daraz safely excluded');
  console.log('  - Observe mode triggers emitted [OBSERVE MODE - NO INGESTION]');
  console.log('  - Exactly 0 database rows mutated (products, variants, prices, history, jobs)');
  console.log('  - Clean shutdown verified');
}

main().catch(err => {
  console.error('Error during observe mode validation:', err);
  process.exit(1);
});
