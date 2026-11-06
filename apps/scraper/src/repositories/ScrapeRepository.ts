import { createClient } from '@supabase/supabase-js';
import { scraperConfig } from '../config/scraperConfig';
import { ScrapeJobStatus } from '@pakprice/shared';

const supabase = createClient(scraperConfig.supabaseUrl, scraperConfig.supabaseServiceKey);

export class ScrapeRepository {
  async createJob(
    storeId: string | null,
    triggeredBy: 'system' | 'admin' | 'cron' | 'manual',
    jobType: 'discovery' | 'refresh' = 'discovery',
    metadata?: Record<string, any>
  ): Promise<string | null> {
    const insertPayload: any = {
      store_id: storeId,
      status: 'running',
      started_at: new Date().toISOString(),
      triggered_by: triggeredBy,
      job_type: jobType,
    };
    if (metadata !== undefined) {
      insertPayload.metadata = metadata;
    }

    const { data, error } = await supabase
      .from('scrape_jobs')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      // Catch PostgreSQL unique constraint violation for uq_scrape_jobs_one_running_store
      if (
        error.code === '23505' ||
        error.message?.includes('uq_scrape_jobs_one_running_store') ||
        error.details?.includes('uq_scrape_jobs_one_running_store')
      ) {
        console.warn(
          `[CONCURRENCY GUARD] Scrape job rejected by DB-atomic unique index: another job is already running for store ${storeId}`
        );
        return null;
      }

      console.error('Failed to create scrape job:', error);
      return null;
    }
    return data?.id || null;
  }

  async updateJob(
    jobId: string,
    status: ScrapeJobStatus,
    productsScraped: number,
    errorsCount: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const updatePayload: any = { status, products_scraped: productsScraped, errors_count: errorsCount };
    if (status === 'completed' || status === 'failed') {
      updatePayload.completed_at = new Date().toISOString();
    }
    if (metadata !== undefined) {
      updatePayload.metadata = metadata;
    }
    await supabase.from('scrape_jobs').update(updatePayload).eq('id', jobId);
  }

  async logEvent(jobId: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, metadata?: Record<string, any>): Promise<void> {
    await supabase.from('scrape_logs').insert({
      job_id: jobId,
      level,
      message,
      metadata: metadata || null,
    });
  }

  async getRunningJob(storeId: string): Promise<any | null> {
    const { data } = await supabase
      .from('scrape_jobs')
      .select('*')
      .eq('store_id', storeId)
      .eq('status', 'running')
      .maybeSingle();
    
    return data || null;
  }

  /**
   * Diagnostic capability: Finds running jobs that exceed the stale threshold without mutating them.
   * Safe for operator inspection and diagnostic reporting.
   */
  async findStaleJobs(thresholdMinutes = scraperConfig.staleJobThresholdMinutes): Promise<any[]> {
    const cutoffTime = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('scrape_jobs')
      .select('id, store_id, status, started_at, triggered_by, products_scraped, errors_count')
      .eq('status', 'running')
      .lt('started_at', cutoffTime);

    if (error) {
      console.error('Failed to query stale jobs:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Diagnostic capability: Returns all currently active/running scraper jobs.
   */
  async getActiveJobs(): Promise<any[]> {
    const { data, error } = await supabase
      .from('scrape_jobs')
      .select('id, store_id, status, started_at, triggered_by, products_scraped, errors_count')
      .eq('status', 'running');

    if (error) {
      console.error('Failed to query active jobs:', error);
      return [];
    }
    return data || [];
  }

  /**
   * Resets stale jobs for a store only when explicit recovery is requested.
   * Uses configurable threshold.
   */
  async resetStaleJobs(storeId: string, thresholdMinutes = scraperConfig.staleJobThresholdMinutes): Promise<number> {
    const cutoffTime = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('scrape_jobs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .eq('status', 'running')
      .lt('started_at', cutoffTime)
      .select('id');

    if (error) {
      console.error('Failed to reset stale jobs:', error);
      return 0;
    }
    return data?.length ?? 0;
  }
}
