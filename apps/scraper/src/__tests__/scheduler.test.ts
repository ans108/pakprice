// 6J: Set activation mode for test environment (default is 'disabled')
process.env.SCHEDULER_ACTIVATION_MODE = 'active';

import { ScraperScheduler } from '../services/ScraperScheduler';
import { ScraperService } from '../services/ScraperService';
import { scraperConfig } from '../config/scraperConfig';

console.log('─── Running ScraperScheduler Unit Tests (Increment 6I) ───\n');

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

async function runTests() {
  // Test 1: Scheduler initialization and task registration
  const scheduler = new ScraperScheduler();
  scheduler.start(true); // forceEnabled = true for testing

  assert('Scheduler is active after start', scheduler.isActive());

  const tasks = scheduler.getRegisteredTasks();
  assert('Exactly 8 cron tasks registered (4 stores * 2 job types)', tasks.length === 8, `Got ${tasks.length}`);

  // Test 2: Verify excluded stores (Paklap and Daraz)
  const paklapTasks = tasks.filter(t => t.storeKey === 'paklap');
  const darazTasks = tasks.filter(t => t.storeKey === 'daraz');
  assert('Paklap has 0 registered cron tasks (blocked store)', paklapTasks.length === 0);
  assert('Daraz has 0 registered cron tasks (experimental store)', darazTasks.length === 0);

  // Test 3: Timezone check
  const allKarachi = tasks.every(t => t.timezone === 'Asia/Karachi');
  assert('All tasks registered with timezone Asia/Karachi', allKarachi);

  // Test 4: Verify expected cron expressions for production stores
  const expectedSchedules: Record<string, { discovery: string; refresh: string }> = {
    priceoye: { discovery: '0 3 * * *', refresh: '10 */4 * * *' },
    telemart: { discovery: '30 3 * * *', refresh: '25 */6 * * *' },
    'mega-pk': { discovery: '0 4 * * *', refresh: '40 */6 * * *' },
    shophive: { discovery: '30 4 * * *', refresh: '55 */6 * * *' },
  };

  for (const [storeKey, expected] of Object.entries(expectedSchedules)) {
    const disc = tasks.find(t => t.storeKey === storeKey && t.jobType === 'discovery');
    const ref = tasks.find(t => t.storeKey === storeKey && t.jobType === 'refresh');

    assert(`Store ${storeKey} has discovery schedule ${expected.discovery}`, disc?.schedule === expected.discovery);
    assert(`Store ${storeKey} has refresh schedule ${expected.refresh}`, ref?.schedule === expected.refresh);
  }

  // Test 5: All discovery schedules are unique and staggered
  const discoverySchedules = tasks.filter(t => t.jobType === 'discovery').map(t => t.schedule);
  const uniqueDiscovery = new Set(discoverySchedules);
  assert('All 4 discovery schedules are unique & staggered (no concurrency clash)', uniqueDiscovery.size === 4);

  // Test 6: All refresh schedules are unique and staggered
  const refreshSchedules = tasks.filter(t => t.jobType === 'refresh').map(t => t.schedule);
  const uniqueRefresh = new Set(refreshSchedules);
  assert('All 4 refresh schedules are unique & staggered (no concurrency clash)', uniqueRefresh.size === 4);

  // Test 7: Canonical Mega key check
  const megaPkTasks = tasks.filter(t => t.storeKey === 'mega-pk');
  const megaUnderscoreTasks = tasks.filter(t => t.storeKey === 'mega_pk');
  assert('Canonical key "mega-pk" is used', megaPkTasks.length === 2);
  assert('Duplicate alias "mega_pk" is NOT registered', megaUnderscoreTasks.length === 0);

  // Test 8: Clean shutdown
  scheduler.stop();
  assert('Scheduler is inactive after stop()', !scheduler.isActive());
  assert('Registered tasks array cleared after stop()', scheduler.getRegisteredTasks().length === 0);

  // Test 9: In-memory mutex protection
  let resolvePromise: () => void;
  const slowExecutionPromise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  let runCount = 0;
  const mockService = {
    runStore: async () => {
      runCount++;
      await slowExecutionPromise;
      return { storeKey: 'priceoye', success: true, status: 'completed', metrics: {} as any };
    },
    runRefresh: async () => {
      runCount++;
      await slowExecutionPromise;
      return { storeKey: 'priceoye', success: true, status: 'completed', metrics: {} as any };
    },
  } as unknown as ScraperService;

  const mutexScheduler = new ScraperScheduler(mockService);

  // Launch first run (will hold in progress)
  const firstRun = mutexScheduler.runStoreWithMutex('priceoye', 'discovery');
  assert('Store added to runningStores while active', mutexScheduler.getRunningStores().includes('priceoye'));

  // Launch second concurrent run for same store
  await mutexScheduler.runStoreWithMutex('priceoye', 'discovery');
  assert('Concurrent run skipped due to mutex (runCount remains 1)', runCount === 1);

  // Resolve the slow promise and wait for first run to complete
  resolvePromise!();
  await firstRun;

  assert('Store removed from runningStores after completion', !mutexScheduler.getRunningStores().includes('priceoye'));
  assert('Total executed count is exactly 1', runCount === 1);

  console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Unexpected test error:', err);
  process.exit(1);
});
