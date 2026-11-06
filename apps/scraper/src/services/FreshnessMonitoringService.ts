/**
 * FreshnessMonitoringService (Increment 6J)
 *
 * READ-ONLY diagnostic service for querying price freshness across production stores.
 *
 * SAFETY GUARANTEES:
 * - Never inserts, updates, or deletes any database row
 * - Never mutates prices.in_stock, prices.last_scraped_at, products, or variants
 * - Uses batched/aggregate queries — no N+1 access patterns
 * - Does not load the complete price_history table
 * - Preserves existing 5C freshness semantics (source of truth: prices.last_scraped_at)
 */

import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { scraperConfig } from '../config/scraperConfig';

export interface StoreFreshnessReport {
  storeSlug: string;
  storeName: string;
  storeId: string;
  totalUrls: number;
  freshCount: number;
  staleCount: number;
  unknownCount: number;
  coveragePct: number;
  oldestLastScrapedAt: string | null;
  newestLastScrapedAt: string | null;
  lastSuccessfulDiscovery: string | null;
  lastSuccessfulRefresh: string | null;
  queryCount: number;
}

export class FreshnessMonitoringService {
  private supabase: SupabaseClient;

  constructor(supabaseClient?: SupabaseClient) {
    this.supabase =
      supabaseClient ||
      createClient(scraperConfig.supabaseUrl, scraperConfig.supabaseServiceKey);
  }

  /**
   * Returns a freshness report for a single store.
   * Uses 7 batched queries per store (no N+1).
   */
  async getStoreFreshnessReport(
    storeId: string,
    storeSlug: string,
    storeName: string
  ): Promise<StoreFreshnessReport> {
    let queryCount = 0;
    const thresholdMs = scraperConfig.freshnessThresholdHours * 60 * 60 * 1000;
    const freshCutoff = new Date(Date.now() - thresholdMs).toISOString();

    // Query 1: Total URLs with a product_url
    const { count: totalUrls } = await this.supabase
      .from('prices')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .not('product_url', 'is', null)
      .neq('product_url', '');
    queryCount++;

    // Query 2: Fresh count (last_scraped_at >= freshCutoff)
    const { count: freshCount } = await this.supabase
      .from('prices')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .not('product_url', 'is', null)
      .neq('product_url', '')
      .gte('last_scraped_at', freshCutoff);
    queryCount++;

    // Query 3: Unknown count (last_scraped_at IS NULL)
    const { count: unknownCount } = await this.supabase
      .from('prices')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .not('product_url', 'is', null)
      .neq('product_url', '')
      .is('last_scraped_at', null);
    queryCount++;

    const total = totalUrls ?? 0;
    const fresh = freshCount ?? 0;
    const unknown = unknownCount ?? 0;
    const stale = Math.max(0, total - fresh - unknown);

    // Query 4: Oldest last_scraped_at
    const { data: oldestRow } = await this.supabase
      .from('prices')
      .select('last_scraped_at')
      .eq('store_id', storeId)
      .not('last_scraped_at', 'is', null)
      .order('last_scraped_at', { ascending: true })
      .limit(1);
    queryCount++;

    // Query 5: Newest last_scraped_at
    const { data: newestRow } = await this.supabase
      .from('prices')
      .select('last_scraped_at')
      .eq('store_id', storeId)
      .not('last_scraped_at', 'is', null)
      .order('last_scraped_at', { ascending: false })
      .limit(1);
    queryCount++;

    // Query 6: Last successful discovery
    const { data: lastDiscovery } = await this.supabase
      .from('scrape_jobs')
      .select('completed_at')
      .eq('store_id', storeId)
      .eq('job_type', 'discovery')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1);
    queryCount++;

    // Query 7: Last successful refresh
    const { data: lastRefresh } = await this.supabase
      .from('scrape_jobs')
      .select('completed_at')
      .eq('store_id', storeId)
      .eq('job_type', 'refresh')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1);
    queryCount++;

    const coveragePct = total > 0 ? Math.round((fresh / total) * 1000) / 10 : 0;

    return {
      storeSlug,
      storeName,
      storeId,
      totalUrls: total,
      freshCount: fresh,
      staleCount: stale,
      unknownCount: unknown,
      coveragePct,
      oldestLastScrapedAt: oldestRow?.[0]?.last_scraped_at ?? null,
      newestLastScrapedAt: newestRow?.[0]?.last_scraped_at ?? null,
      lastSuccessfulDiscovery: lastDiscovery?.[0]?.completed_at ?? null,
      lastSuccessfulRefresh: lastRefresh?.[0]?.completed_at ?? null,
      queryCount,
    };
  }

  /**
   * Returns freshness reports for all production stores.
   * Total queries: 1 (store lookup) + 7 per store = ~29 queries total.
   */
  async getAllStoreFreshnessReports(): Promise<{
    reports: StoreFreshnessReport[];
    totalQueries: number;
  }> {
    const productionSlugs = ['priceoye', 'telemart', 'mega-pk', 'shophive'];

    // Single query to resolve all production store IDs
    const { data: stores } = await this.supabase
      .from('stores')
      .select('id, slug, name')
      .in('slug', productionSlugs);

    let totalQueries = 1; // store lookup query

    if (!stores || stores.length === 0) {
      return { reports: [], totalQueries };
    }

    const reports: StoreFreshnessReport[] = [];
    for (const store of stores) {
      const report = await this.getStoreFreshnessReport(
        store.id,
        store.slug,
        store.name
      );
      totalQueries += report.queryCount;
      reports.push(report);
    }

    return { reports, totalQueries };
  }
}
