import cron from 'node-cron';
import { ScraperService } from './ScraperService';
import { scraperConfig, storeScheduleConfigs } from '../config/scraperConfig';
import { logger } from '../scrapers/base/BaseScraper';

export interface ScheduledTaskInfo {
  storeKey: string;
  jobType: 'discovery' | 'refresh';
  schedule: string;
  timezone: string;
  task: cron.ScheduledTask;
}

export class ScraperScheduler {
  private scheduledTasks: ScheduledTaskInfo[] = [];
  private runningStores = new Set<string>();
  private scraperService: ScraperService;
  private activationMode: 'disabled' | 'observe' | 'active' = 'disabled';

  constructor(scraperService?: ScraperService) {
    this.scraperService = scraperService || new ScraperService();
  }

  /**
   * Initializes and registers all store cron tasks according to storeScheduleConfigs.
   * Paklap (blocked) and Daraz (experimental) are explicitly excluded.
   *
   * 6J Activation Mode behavior:
   *   disabled → logs startup, registers NO cron tasks, safe no-op
   *   observe  → registers cron tasks, but callbacks only log (zero production mutations)
   *   active   → registers cron tasks with full production execution
   *
   * Singleton process requirement: Exactly ONE scheduler worker should run in production.
   */
  start(forceEnabled = false): void {
    const activationMode = scraperConfig.schedulerActivationMode;

    if (!scraperConfig.schedulerEnabled && !forceEnabled) {
      logger.info(
        { event: 'scheduler_disabled' },
        'Scheduler is disabled in configuration (ENABLE_SCHEDULER !== true)'
      );
      return;
    }

    if (activationMode === 'disabled') {
      logger.info(
        { event: 'scheduler_disabled', activationMode },
        'Scheduler activation mode is "disabled"; no cron tasks will be registered. Process remains alive for monitoring.'
      );
      this.activationMode = 'disabled';
      return;
    }

    // Stop any existing tasks before re-registering
    this.stop();
    this.activationMode = activationMode;

    logger.info(
      { timezone: scraperConfig.schedulerTimezone, activationMode, event: 'scheduler_started' },
      `Starting ScraperScheduler in "${activationMode}" mode: registering production store schedules`
    );

    for (const [storeKey, cfg] of Object.entries(storeScheduleConfigs)) {
      // Rule: Paklap and Daraz MUST NOT register cron tasks
      if (cfg.eligibility !== 'production') {
        logger.info(
          { storeKey, eligibility: cfg.eligibility },
          `Skipping scheduler registration for non-production store: ${storeKey}`
        );
        continue;
      }

      // 1. Discovery Cron Schedule
      if (cfg.discoverySchedule) {
        try {
          const task = cron.schedule(
            cfg.discoverySchedule,
            async () => {
              logger.info(
                { storeKey, jobType: 'discovery', event: 'scheduler_task_triggered', activationMode: this.activationMode },
                `Cron triggered discovery for ${storeKey}`
              );

              if (this.activationMode === 'observe') {
                logger.info(
                  { storeKey, jobType: 'discovery', activationMode: 'observe' },
                  `[OBSERVE MODE - NO INGESTION] Would have executed discovery for ${storeKey} — no production execution`
                );
                return;
              }

              await this.runStoreWithMutex(storeKey, 'discovery');
            },
            {
              timezone: scraperConfig.schedulerTimezone,
            }
          );

          this.scheduledTasks.push({
            storeKey,
            jobType: 'discovery',
            schedule: cfg.discoverySchedule,
            timezone: scraperConfig.schedulerTimezone,
            task,
          });

          logger.info(
            { storeKey, jobType: 'discovery', schedule: cfg.discoverySchedule, event: 'scheduler_task_registered' },
            `Registered discovery cron task for ${storeKey}`
          );
        } catch (err: any) {
          logger.error(
            { storeKey, schedule: cfg.discoverySchedule, error: err.message },
            `Failed to schedule discovery cron task for ${storeKey}`
          );
        }
      }

      // 2. Refresh Cron Schedule
      if (cfg.refreshSchedule) {
        try {
          const task = cron.schedule(
            cfg.refreshSchedule,
            async () => {
              logger.info(
                { storeKey, jobType: 'refresh', event: 'scheduler_task_triggered', activationMode: this.activationMode },
                `Cron triggered refresh for ${storeKey}`
              );

              if (this.activationMode === 'observe') {
                logger.info(
                  { storeKey, jobType: 'refresh', activationMode: 'observe' },
                  `[OBSERVE MODE - NO INGESTION] Would have executed refresh for ${storeKey} — no production execution`
                );
                return;
              }

              await this.runStoreWithMutex(storeKey, 'refresh');
            },
            {
              timezone: scraperConfig.schedulerTimezone,
            }
          );

          this.scheduledTasks.push({
            storeKey,
            jobType: 'refresh',
            schedule: cfg.refreshSchedule,
            timezone: scraperConfig.schedulerTimezone,
            task,
          });

          logger.info(
            { storeKey, jobType: 'refresh', schedule: cfg.refreshSchedule, event: 'scheduler_task_registered' },
            `Registered refresh cron task for ${storeKey}`
          );
        } catch (err: any) {
          logger.error(
            { storeKey, schedule: cfg.refreshSchedule, error: err.message },
            `Failed to schedule refresh cron task for ${storeKey}`
          );
        }
      }
    }

    logger.info(
      { totalTasks: this.scheduledTasks.length, activationMode, event: 'scheduler_started' },
      `ScraperScheduler initialized in "${activationMode}" mode with ${this.scheduledTasks.length} cron tasks`
    );
  }

  /**
   * Concurrency-guarded execution wrapper using in-memory Set.
   * Catches errors gracefully and always cleans up in finally block.
   */
  async runStoreWithMutex(storeKey: string, jobType: 'discovery' | 'refresh'): Promise<void> {
    if (this.runningStores.has(storeKey)) {
      logger.warn(
        { storeKey, jobType, event: 'scheduler_job_skipped' },
        `[SCHEDULER MUTEX] Store execution skipped: another job is already running in-memory for ${storeKey}`
      );
      return;
    }

    this.runningStores.add(storeKey);
    const startTime = Date.now();
    logger.info(
      { storeKey, jobType, event: 'scheduler_job_started' },
      `[SCHEDULER] Starting scheduled ${jobType} job for ${storeKey}`
    );

    try {
      if (jobType === 'discovery') {
        await this.scraperService.runStore({
          storeKey,
          triggeredBy: 'cron',
          dryRun: scraperConfig.dryRun,
        });
      } else {
        await this.scraperService.runRefresh({
          storeKey,
          triggeredBy: 'cron',
          dryRun: scraperConfig.dryRun,
          limit: scraperConfig.refreshUrlLimit,
        });
      }

      const durationMs = Date.now() - startTime;
      logger.info(
        { storeKey, jobType, durationMs, event: 'scheduler_job_completed' },
        `[SCHEDULER] Completed ${jobType} job for ${storeKey} in ${durationMs}ms`
      );
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      logger.error(
        { error: error.message, storeKey, jobType, durationMs, event: 'scheduler_job_failed' },
        `[SCHEDULER] Scheduled ${jobType} execution failed unexpectedly for ${storeKey}`
      );
    } finally {
      this.runningStores.delete(storeKey);
      logger.info({ storeKey, jobType }, `[SCHEDULER] Finished ${jobType} job execution cycle for ${storeKey}`);
    }
  }

  /**
   * Cleanly stops all registered cron tasks.
   */
  stop(): void {
    if (this.scheduledTasks.length > 0) {
      for (const t of this.scheduledTasks) {
        t.task.stop();
      }
      logger.info(
        { count: this.scheduledTasks.length, event: 'scheduler_shutdown' },
        'All scraper scheduler tasks stopped cleanly'
      );
      this.scheduledTasks = [];
    }
  }

  isActive(): boolean {
    return this.scheduledTasks.length > 0;
  }

  getActivationMode(): 'disabled' | 'observe' | 'active' {
    return this.activationMode;
  }

  getRegisteredTasks(): Array<{ storeKey: string; jobType: 'discovery' | 'refresh'; schedule: string; timezone: string }> {
    return this.scheduledTasks.map(t => ({
      storeKey: t.storeKey,
      jobType: t.jobType,
      schedule: t.schedule,
      timezone: t.timezone,
    }));
  }

  getRunningStores(): string[] {
    return Array.from(this.runningStores);
  }
}
