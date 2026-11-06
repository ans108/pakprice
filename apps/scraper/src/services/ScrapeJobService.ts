import { ScrapeRepository } from '../repositories/ScrapeRepository';
import { ScrapeJobStatus, ScrapeErrorCategory } from '@pakprice/shared';
import { logger } from '../scrapers/base/BaseScraper';
import { ScrapeMetrics } from '../types/scraperTypes';
import { scraperConfig } from '../config/scraperConfig';

export class ScrapeJobService {
  private repo: ScrapeRepository;

  constructor(repo?: ScrapeRepository) {
    this.repo = repo || new ScrapeRepository();
  }

  async startJob(
    storeId: string, 
    triggeredBy: 'system' | 'admin' | 'cron' | 'manual', 
    dryRun: boolean = false,
    force: boolean = false,
    jobType: 'discovery' | 'refresh' = 'discovery',
    metadata?: Record<string, any>
  ): Promise<string | null> {
    if (dryRun) {
      logger.info({ storeId, triggeredBy, jobType }, '[DRY RUN] Simulating scrape job start (zero DB writes)');
      return 'dry-run-job-' + Date.now();
    }

    // Fast-path: Check for existing running job
    const runningJob = await this.repo.getRunningJob(storeId);
    if (runningJob) {
      const runningAgeMinutes = Math.floor((Date.now() - new Date(runningJob.started_at).getTime()) / 60000);
      const isStale = runningAgeMinutes >= scraperConfig.staleJobThresholdMinutes;

      if (isStale) {
        logger.error(
          { storeId, jobId: runningJob.id, startedAt: runningJob.started_at, runningAgeMinutes, thresholdMinutes: scraperConfig.staleJobThresholdMinutes, event: 'scheduler_stalled_by_stale_job' },
          'AUTOMATED SCRAPING BLOCKED: Stale running job detected. Operator intervention required (npx tsx scripts/resetScrapeJob.ts).'
        );
      } else {
        logger.warn(
          { storeId, jobId: runningJob.id, startedAt: runningJob.started_at, runningAgeMinutes },
          'An active job is currently running for this store.'
        );
      }

      // If force mode is explicitly specified by an operator, reset the stale job
      if (force && isStale) {
        logger.info({ storeId, jobId: runningJob.id }, 'Operator force mode active: resetting stale job');
        await this.repo.updateJob(runningJob.id, 'failed', runningJob.products_scraped || 0, (runningJob.errors_count || 0) + 1);
        await this.repo.logEvent(runningJob.id, 'warn', 'Job forcefully reset by operator due to stale state');
      } else {
        return null;
      }
    }

    const jobId = await this.repo.createJob(storeId, triggeredBy, jobType, metadata);
    if (jobId) {
      logger.info({ storeId, jobId, jobType }, 'Started scrape job');
    } else {
      logger.warn({ storeId, triggeredBy, jobType }, 'Could not start scrape job: store may already have an active job (DB atomic guard)');
    }
    return jobId;
  }

  async completeJob(
    jobId: string, 
    productsScraped: number, 
    errorsCount: number, 
    metrics?: ScrapeMetrics,
    dryRun: boolean = false,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (dryRun || jobId.startsWith('dry-run-job')) {
      logger.info({ jobId, productsScraped, errorsCount, metrics, metadata }, '[DRY RUN] Job completed simulation (zero DB writes)');
      return;
    }

    await this.repo.updateJob(jobId, 'completed', productsScraped, errorsCount, metadata);
    await this.repo.logEvent(
      jobId, 
      'info', 
      `Job completed. Products: ${productsScraped}, Errors: ${errorsCount}`,
      { ...metrics, ...metadata }
    );
    logger.info({ jobId, productsScraped, errorsCount, metrics, metadata }, 'Completed scrape job');
  }

  async failJob(
    jobId: string, 
    error: Error, 
    productsScraped: number, 
    errorsCount: number, 
    metrics?: ScrapeMetrics,
    errorCategory: ScrapeErrorCategory = 'UNKNOWN',
    dryRun: boolean = false,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (dryRun || jobId.startsWith('dry-run-job')) {
      logger.error({ jobId, error: error.message, errorCategory, metrics, metadata }, '[DRY RUN] Job failed simulation (zero DB writes)');
      return;
    }

    const failureMetadata = {
      ...metrics,
      ...metadata,
      errorCategory,
      error: error.message,
      stack: error.stack,
    };

    await this.repo.updateJob(jobId, 'failed', productsScraped, errorsCount + 1, metadata);
    await this.repo.logEvent(
      jobId, 
      'error', 
      `Job failed [${errorCategory}]: ${error.message}`,
      failureMetadata
    );
    logger.error({ jobId, error: error.message, errorCategory, metadata }, 'Failed scrape job');
  }

  async findStaleJobs(thresholdMinutes?: number) {
    return await this.repo.findStaleJobs(thresholdMinutes);
  }

  async getActiveJobs() {
    return await this.repo.getActiveJobs();
  }

  async logInfo(jobId: string, message: string, metadata?: any): Promise<void> {
    if (jobId.startsWith('dry-run-job')) return;
    await this.repo.logEvent(jobId, 'info', message, metadata);
  }

  async logError(jobId: string, message: string, metadata?: any): Promise<void> {
    if (jobId.startsWith('dry-run-job')) return;
    await this.repo.logEvent(jobId, 'error', message, metadata);
  }
}
