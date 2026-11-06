/**
 * scripts/test-6k-active-mode.ts
 *
 * Increment 6K — Phase 7: Stage F Manual Active Activation Validation
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../apps/scraper/.env') });

import { scraperConfig } from '../apps/scraper/src/config/scraperConfig';
import { SchedulerWorker } from '../apps/scraper/src/workers/schedulerWorker';

const supabase = createClient(
  process.env.SUPABASE_URL || scraperConfig.supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY || scraperConfig.supabaseServiceKey
);

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  INCREMENT 6K — STAGE F: ACTIVE ACTIVATION VALIDATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: Pre-flight check on running / stale jobs
  const { data: runningJobs } = await supabase
    .from('scrape_jobs')
    .select('id, store_id, started_at, triggered_by, job_type')
    .eq('status', 'running');

  if (runningJobs && runningJobs.length > 0) {
    console.error(`ERROR: ${runningJobs.length} running job(s) present before activation!`);
    process.exit(1);
  }
  console.log('Pre-flight: 0 running jobs in database.');

  // Step 2: Set active mode
  process.env.ENABLE_SCHEDULER = 'true';
  process.env.SCHEDULER_ACTIVATION_MODE = 'active';

  const activationTimestamp = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  console.log(`\nActivation Timestamp: ${activationTimestamp} (Asia/Karachi)`);
  console.log(`Scheduler Enabled:    ${scraperConfig.schedulerEnabled}`);
  console.log(`Activation Mode:      ${scraperConfig.schedulerActivationMode}`);
  console.log(`Timezone:             ${scraperConfig.schedulerTimezone}\n`);

  // Step 3: Instantiate and boot SchedulerWorker
  const worker = new SchedulerWorker();
  const scheduler = worker.getScheduler();
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

  // Check exclusion of non-production stores
  const paklapTasks = registeredTasks.filter(t => t.storeKey === 'paklap');
  const darazTasks = registeredTasks.filter(t => t.storeKey === 'daraz');
  if (paklapTasks.length > 0 || darazTasks.length > 0) {
    console.error('ERROR: Paklap or Daraz scheduled!');
    scheduler.stop();
    process.exit(1);
  }

  console.log('\nPaklap scheduled: 0 (blocked)');
  console.log('Daraz scheduled:  0 (experimental)');

  // Clean shutdown
  scheduler.stop();
  console.log('\nScheduler stopped cleanly.');

  console.log('\n✓ Stage F Active Activation validation PASSED cleanly.');
}

main().catch(err => {
  console.error('Error during active activation validation:', err);
  process.exit(1);
});
