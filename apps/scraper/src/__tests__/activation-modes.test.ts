/**
 * Activation Mode Tests (Increment 6J)
 *
 * Tests the SCHEDULER_ACTIVATION_MODE configuration and its effect on scheduler behavior.
 */

import { ScraperScheduler } from '../services/ScraperScheduler';
import { ScraperService } from '../services/ScraperService';
import { scraperConfig } from '../config/scraperConfig';

console.log('─── Running Activation Mode Tests (Increment 6J) ───\n');

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
  // Save original env
  const originalMode = process.env.SCHEDULER_ACTIVATION_MODE;

  // ── Mode Parsing Tests ───────────────────────────────────────────

  // Test 1: Default is disabled
  delete process.env.SCHEDULER_ACTIVATION_MODE;
  assert(
    'Default activation mode is "disabled"',
    scraperConfig.schedulerActivationMode === 'disabled'
  );

  // Test 2: Valid modes recognized
  process.env.SCHEDULER_ACTIVATION_MODE = 'observe';
  assert(
    '"observe" mode recognized',
    scraperConfig.schedulerActivationMode === 'observe'
  );

  process.env.SCHEDULER_ACTIVATION_MODE = 'active';
  assert(
    '"active" mode recognized',
    scraperConfig.schedulerActivationMode === 'active'
  );

  process.env.SCHEDULER_ACTIVATION_MODE = 'disabled';
  assert(
    '"disabled" mode recognized',
    scraperConfig.schedulerActivationMode === 'disabled'
  );

  // Test 3: Invalid mode defaults to disabled
  process.env.SCHEDULER_ACTIVATION_MODE = 'invalid_value';
  assert(
    'Invalid mode "invalid_value" defaults to "disabled"',
    scraperConfig.schedulerActivationMode === 'disabled'
  );

  process.env.SCHEDULER_ACTIVATION_MODE = '';
  assert(
    'Empty string defaults to "disabled"',
    scraperConfig.schedulerActivationMode === 'disabled'
  );

  // Test 4: Case insensitive
  process.env.SCHEDULER_ACTIVATION_MODE = 'OBSERVE';
  assert(
    'Case insensitive: "OBSERVE" → "observe"',
    scraperConfig.schedulerActivationMode === 'observe'
  );

  process.env.SCHEDULER_ACTIVATION_MODE = 'Active';
  assert(
    'Case insensitive: "Active" → "active"',
    scraperConfig.schedulerActivationMode === 'active'
  );

  process.env.SCHEDULER_ACTIVATION_MODE = ' active ';
  assert(
    'Whitespace trimmed: " active " → "active"',
    scraperConfig.schedulerActivationMode === 'active'
  );

  // ── Scheduler Behavior Tests ─────────────────────────────────────

  // Test 5: Disabled mode prevents task registration
  process.env.SCHEDULER_ACTIVATION_MODE = 'disabled';
  const disabledScheduler = new ScraperScheduler();
  disabledScheduler.start(true); // forceEnabled
  assert(
    'Disabled mode: scheduler is NOT active (no tasks registered)',
    !disabledScheduler.isActive()
  );
  assert(
    'Disabled mode: getActivationMode() returns "disabled"',
    disabledScheduler.getActivationMode() === 'disabled'
  );
  assert(
    'Disabled mode: 0 registered tasks',
    disabledScheduler.getRegisteredTasks().length === 0
  );
  disabledScheduler.stop();

  // Test 6: Observe mode registers tasks
  process.env.SCHEDULER_ACTIVATION_MODE = 'observe';
  const observeScheduler = new ScraperScheduler();
  observeScheduler.start(true);
  assert(
    'Observe mode: scheduler IS active (tasks registered)',
    observeScheduler.isActive()
  );
  assert(
    'Observe mode: 8 tasks registered (4 stores × 2 job types)',
    observeScheduler.getRegisteredTasks().length === 8,
    `Got ${observeScheduler.getRegisteredTasks().length}`
  );
  assert(
    'Observe mode: getActivationMode() returns "observe"',
    observeScheduler.getActivationMode() === 'observe'
  );
  observeScheduler.stop();

  // Test 7: Active mode registers tasks
  process.env.SCHEDULER_ACTIVATION_MODE = 'active';
  const activeScheduler = new ScraperScheduler();
  activeScheduler.start(true);
  assert(
    'Active mode: scheduler IS active (tasks registered)',
    activeScheduler.isActive()
  );
  assert(
    'Active mode: 8 tasks registered',
    activeScheduler.getRegisteredTasks().length === 8,
    `Got ${activeScheduler.getRegisteredTasks().length}`
  );
  assert(
    'Active mode: getActivationMode() returns "active"',
    activeScheduler.getActivationMode() === 'active'
  );
  activeScheduler.stop();

  // Test 8: Paklap and Daraz excluded in all modes
  process.env.SCHEDULER_ACTIVATION_MODE = 'active';
  const exclusionScheduler = new ScraperScheduler();
  exclusionScheduler.start(true);
  const allTasks = exclusionScheduler.getRegisteredTasks();
  const paklapTasks = allTasks.filter((t) => t.storeKey === 'paklap');
  const darazTasks = allTasks.filter((t) => t.storeKey === 'daraz');
  assert(
    'Paklap has 0 registered tasks in active mode',
    paklapTasks.length === 0
  );
  assert(
    'Daraz has 0 registered tasks in active mode',
    darazTasks.length === 0
  );
  exclusionScheduler.stop();

  // Test 9: Timezone is Asia/Karachi for all tasks
  process.env.SCHEDULER_ACTIVATION_MODE = 'active';
  const tzScheduler = new ScraperScheduler();
  tzScheduler.start(true);
  const tzTasks = tzScheduler.getRegisteredTasks();
  const allKarachi = tzTasks.every((t) => t.timezone === 'Asia/Karachi');
  assert(
    'All tasks use timezone Asia/Karachi',
    allKarachi
  );
  tzScheduler.stop();

  // Test 10: In-memory mutex still works in active mode
  process.env.SCHEDULER_ACTIVATION_MODE = 'active';
  let resolvePromise: () => void;
  const slowPromise = new Promise<void>((res) => {
    resolvePromise = res;
  });
  let runCount = 0;

  const mutexMockService = {
    runStore: async () => {
      runCount++;
      await slowPromise;
      return { storeKey: 'priceoye', success: true, status: 'completed', metrics: {} as any };
    },
    runRefresh: async () => {
      runCount++;
      await slowPromise;
      return { storeKey: 'priceoye', success: true, status: 'completed', metrics: {} as any };
    },
  } as unknown as ScraperService;

  const mutexScheduler = new ScraperScheduler(mutexMockService);
  mutexScheduler.start(true);

  const firstRun = mutexScheduler.runStoreWithMutex('priceoye', 'discovery');
  assert(
    'Mutex: store in runningStores while active',
    mutexScheduler.getRunningStores().includes('priceoye')
  );

  await mutexScheduler.runStoreWithMutex('priceoye', 'discovery');
  assert('Mutex: concurrent run skipped (runCount === 1)', runCount === 1);

  resolvePromise!();
  await firstRun;
  assert(
    'Mutex: store removed from runningStores after completion',
    !mutexScheduler.getRunningStores().includes('priceoye')
  );
  assert(
    'Mutex: total execution count is exactly 1',
    runCount === 1
  );
  mutexScheduler.stop();

  // Test 11: Clean shutdown
  process.env.SCHEDULER_ACTIVATION_MODE = 'active';
  const shutdownScheduler = new ScraperScheduler();
  shutdownScheduler.start(true);
  assert('Pre-shutdown: scheduler is active', shutdownScheduler.isActive());
  shutdownScheduler.stop();
  assert(
    'Post-shutdown: scheduler is inactive',
    !shutdownScheduler.isActive()
  );
  assert(
    'Post-shutdown: registered tasks cleared',
    shutdownScheduler.getRegisteredTasks().length === 0
  );

  // Restore original env
  if (originalMode !== undefined) {
    process.env.SCHEDULER_ACTIVATION_MODE = originalMode;
  } else {
    delete process.env.SCHEDULER_ACTIVATION_MODE;
  }

  console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Unexpected test error:', err);
  process.exit(1);
});
