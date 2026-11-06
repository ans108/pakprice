// apps/scraper/src/workers/schedulerWorker.ts
//
// Increment 6I/6J: Persistent Scheduler Worker Process
//
// PRODUCTION DEPLOYMENT RULES:
// 1. SINGLETON PROCESS: Exactly ONE instance/replica of schedulerWorker must run in production.
//    Horizontal scaling of the scheduler worker is strictly disallowed to prevent duplicate ticks.
// 2. CONCURRENCY:
//    - In-memory runningStores Set prevents concurrent triggers for the same store within this process.
//    - The database partial unique index (uq_scrape_jobs_one_running_store) provides authoritative
//      concurrency protection across separate CLI runs, CI, and any accidental duplicate processes.
// 3. TIMEZONE: Asia/Karachi for all cron definitions.
// 4. STAGGERED SCHEDULES:
//    - PriceOye:  refresh: "10 */4 * * *", discovery: "0 3 * * *"
//    - Telemart:  refresh: "25 */6 * * *", discovery: "30 3 * * *"
//    - Mega.pk:   refresh: "40 */6 * * *", discovery: "0 4 * * *"
//    - Shophive:  refresh: "55 */6 * * *", discovery: "30 4 * * *"
//    - Paklap & Daraz: NULL (explicitly not scheduled)
// 5. STALE JOBS:
//    - Automated cron runs NEVER auto-reset stale running jobs.
//    - An operator must intervene manually using: npx tsx scripts/resetScrapeJob.ts <storeSlug>
// 6. ACTIVATION MODES (6J):
//    - disabled: process alive, no cron tasks registered, safe no-op
//    - observe:  cron tasks registered, triggers logged, zero production mutations
//    - active:   full production scheduled behavior with all 6I safeguards


import { ScraperScheduler } from '../services/ScraperScheduler';
import { scraperConfig } from '../config/scraperConfig';
import { logger } from '../scrapers/base/BaseScraper';

export class SchedulerWorker {
  private scheduler: ScraperScheduler;
  private isShuttingDown = false;

  constructor() {
    this.scheduler = new ScraperScheduler();
  }

  start(): void {
    const activationMode = scraperConfig.schedulerActivationMode;

    logger.info('====================================================');
    logger.info('  PakPrice Scheduler Worker Starting');
    logger.info('  Activation Mode: %s', activationMode);
    logger.info('  Scheduler Enabled: %s', scraperConfig.schedulerEnabled);
    logger.info('  Timezone: %s', scraperConfig.schedulerTimezone);
    logger.info('  Minimum Coverage: %d%%', scraperConfig.minimumCoveragePct);
    logger.info('  Refresh Batch Limit: %d', scraperConfig.refreshUrlLimit);
    logger.info('  Freshness Threshold: %dh', scraperConfig.freshnessThresholdHours);
    logger.info('  Deployment Rule: SINGLETON PROCESS (1 replica max)');
    logger.info('====================================================');

    // Start the scheduler (respects activation mode internally)
    this.scheduler.start(true); // forceEnabled bypasses ENABLE_SCHEDULER for dedicated worker process

    if (activationMode === 'disabled') {
      logger.info(
        { event: 'scheduler_disabled', activationMode },
        'Worker process alive but no cron tasks registered (disabled mode). Set SCHEDULER_ACTIVATION_MODE=observe or active to enable.'
      );
    } else {
      const tasks = this.scheduler.getRegisteredTasks();
      logger.info(
        { tasksCount: tasks.length, tasks, activationMode, event: 'scheduler_started' },
        `Registered ${tasks.length} scheduled tasks in "${activationMode}" mode`
      );
    }

    // Keep Node process alive
    const keepAliveTimer = setInterval(() => {
      logger.debug({
        activationMode: this.scheduler.getActivationMode(),
        runningStores: this.scheduler.getRunningStores(),
        registeredTasks: this.scheduler.getRegisteredTasks().length,
      }, 'Scheduler worker heartbeat active');
    }, 60000);

    const handleShutdown = (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      logger.info(
        { signal, event: 'scheduler_shutdown' },
        'Scheduler worker received termination signal; shutting down cleanly'
      );

      clearInterval(keepAliveTimer);
      this.scheduler.stop();

      setTimeout(() => {
        logger.warn('Forcing scheduler worker exit after grace period');
        process.exit(0);
      }, 5000).unref();

      process.exit(0);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  }

  getScheduler(): ScraperScheduler {
    return this.scheduler;
  }
}

// If run directly via CLI (e.g. tsx src/workers/schedulerWorker.ts)
if (require.main === module) {
  const worker = new SchedulerWorker();
  worker.start();
}
