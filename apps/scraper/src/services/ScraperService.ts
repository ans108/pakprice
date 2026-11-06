import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ScraperRegistry } from '../scrapers/ScraperRegistry';
import { PriceIngestionService } from './PriceIngestionService';
import { ScrapeJobService } from './ScrapeJobService';
import { scraperConfig } from '../config/scraperConfig';
import { logger } from '../scrapers/base/BaseScraper';
import { withTimeout, StoreAccessBlockedError } from '../utils/scraperUtils';
import { ScrapeMetrics } from '../types/scraperTypes';
import { classifyScraperError } from '../utils/errorClassifier';
import type { ScrapeErrorCategory } from '@pakprice/shared';
import { RefreshUrlRepository } from '../repositories/RefreshUrlRepository';
import { isValidStoreDomain, STORE_BASE_DOMAINS } from '../validation/DomainValidator';
import { validateStoreRedirect } from '../validation/RedirectValidator';
import { PriceOyeScraper } from '../scrapers/stores/PriceOyeScraper';
import { TelemartScraper } from '../scrapers/stores/TelemartScraper';
import { MegaPkScraper } from '../scrapers/stores/MegaPkScraper';
import { ShophiveScraper } from '../scrapers/stores/ShophiveScraper';
import { chromium, Browser } from 'playwright';
import axios from 'axios';

export interface RunScraperOptions {
  storeKey: string;
  triggeredBy?: 'system' | 'admin' | 'cron' | 'manual';
  dryRun?: boolean;
  force?: boolean;
}

export interface RunRefreshOptions {
  storeKey: string;
  triggeredBy?: 'system' | 'admin' | 'cron' | 'manual';
  dryRun?: boolean;
  force?: boolean;
  limit?: number;
}

export interface StoreScrapeResult {
  storeKey: string;
  success: boolean;
  status: 'completed' | 'failed' | 'cancelled';
  metrics: ScrapeMetrics;
  error?: string;
  errorCategory?: ScrapeErrorCategory;
}

export class ScraperService {
  private registry = ScraperRegistry.getInstance();
  private ingestionService = new PriceIngestionService();
  private jobService = new ScrapeJobService();
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(scraperConfig.supabaseUrl, scraperConfig.supabaseServiceKey);
  }

  /**
   * Runs a scraper for a single store with failure isolation, timeouts, and metrics.
   */
  async runStore(options: RunScraperOptions): Promise<StoreScrapeResult> {
    const { storeKey, triggeredBy = 'manual', dryRun = scraperConfig.dryRun, force = false } = options;
    const startTime = Date.now();

    const metrics: ScrapeMetrics = {
      discovered: 0,
      scraped: 0,
      matched: 0,
      newProducts: 0,
      newVariants: 0,
      updatedPrices: 0,
      rejected: 0,
      errors: 0,
      durationMs: 0,
      gtinMatches: 0,
      storeIdentifierMatches: 0,
      brandModelMatches: 0,
      exactSpecsMatches: 0,
      strongSpecsMatches: 0,
      fuzzyCandidates: 0,
      fuzzyRejected: 0,
      ambiguousMatches: 0,
      // 5C price quality telemetry
      priceValidationWarnings: 0,
      priceOutlierRejections: 0,
      historyDeduplicated: 0,
      historySnapshots: 0,
    };

    logger.info({ storeKey, dryRun, force }, 'Starting isolated store scraper run');

    // 1. Check if scraper exists in registry
    const scraper = this.registry.get(storeKey);
    if (!scraper) {
      const err = `No scraper registered for store slug: ${storeKey}`;
      logger.error({ storeKey }, err);
      return { storeKey, success: false, status: 'failed', metrics, error: err };
    }

    // 2. Resolve store in DB
    const { data: store, error: storeErr } = await this.supabase
      .from('stores')
      .select('id, name, is_active')
      .or(`scraper_key.eq.${storeKey},slug.eq.${storeKey}`)
      .maybeSingle();

    if (storeErr || !store) {
      const err = `Store "${storeKey}" not found in database: ${storeErr?.message || 'not found'}`;
      logger.error({ storeKey }, err);
      return { storeKey, success: false, status: 'failed', metrics, error: err };
    }

    // 3. Handle force reset of running jobs
    if (force && !dryRun) {
      logger.info({ storeId: store.id }, 'Force-resetting running jobs for store');
      await this.supabase
        .from('scrape_jobs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('store_id', store.id)
        .eq('status', 'running');
    }

    // 4. Start job (if dry run, jobService avoids DB write)
    const jobId = await this.jobService.startJob(store.id, triggeredBy, dryRun, force, 'discovery');
    if (!jobId) {
      const err = `A job is already running for store ${storeKey}`;
      logger.warn({ storeKey, storeId: store.id }, err);
      return { storeKey, success: false, status: 'cancelled', metrics, error: err };
    }

    try {
      // 5. Run scraper with overall timeout
      const timeoutMs = scraperConfig.overallStoreTimeoutMs;
      const products = await withTimeout(
        scraper.scrape(),
        timeoutMs,
        `Store scrape timed out after ${timeoutMs}ms`
      );

      metrics.discovered = products.length;
      metrics.scraped = products.length;

      // 5C: Zero-result scrape safety — do NOT mutate existing data
      if (products.length === 0) {
        logger.warn({ storeKey }, 'Scrape returned zero products — skipping ingestion to preserve existing data');
        metrics.durationMs = Date.now() - startTime;
        await this.jobService.completeJob(jobId, 0, 0, metrics, dryRun, {
          jobType: 'discovery',
          productsCount: 0,
        });
        return { storeKey, success: true, status: 'completed', metrics };
      }

      // 6. Ingestion — each product ingested individually
      // Missing products are NOT marked stale/unavailable (5C: no post-scrape batch mutation)
      for (const product of products) {
        try {
          const res = await this.ingestionService.ingest(product, store.id, dryRun, { allowCreate: true });
          if (res.action === 'inserted_product') {
            metrics.newProducts++;
            metrics.newVariants++;
          } else if (res.action === 'inserted_variant') {
            metrics.newVariants++;
          } else if (res.action === 'updated_price') {
            metrics.updatedPrices++;
            metrics.matched++;
          } else if (res.action === 'validation_corrected') {
            // 5C: accepted after corrections
            metrics.updatedPrices++;
            metrics.matched++;
            metrics.priceValidationWarnings++;
          } else if (res.action === 'dry_run_matched') {
            metrics.matched++;
          } else if (res.action === 'dry_run_new') {
            metrics.newProducts++;
            metrics.newVariants++;
          } else if (res.action === 'rejected') {
            metrics.rejected++;
          } else if (res.action === 'ambiguous_rejected') {
            metrics.ambiguousMatches++;
            metrics.rejected++;
          } else if (res.action === 'outlier_rejected') {
            // 5C: price rejected by outlier detection
            metrics.priceOutlierRejections++;
            metrics.rejected++;
          }

          // 5C: history dedup/snapshot telemetry
          if (res.historyDeduplicated) {
            metrics.historyDeduplicated++;
          }
          if (res.historySnapshot) {
            metrics.historySnapshots++;
          }

          // 5B matching telemetry
          if (res.matchMethod) {
            switch (res.matchMethod) {
              case 'gtin': metrics.gtinMatches++; break;
              case 'store_identifier': metrics.storeIdentifierMatches++; break;
              case 'brand_model': metrics.brandModelMatches++; break;
              case 'exact_specs': metrics.exactSpecsMatches++; break;
              case 'strong_specs': metrics.strongSpecsMatches++; break;
              case 'fuzzy': metrics.fuzzyCandidates++; break;
            }
          }
        } catch (e: any) {
          metrics.errors++;
          logger.error({ storeKey, product: product.name, error: e.message }, 'Failed to ingest product');
        }
      }

      metrics.durationMs = Date.now() - startTime;

      // 7. Complete job
      await this.jobService.completeJob(jobId, metrics.scraped, metrics.errors, metrics, dryRun);

      logger.info({ storeKey, metrics }, 'Store scraper run completed successfully');
      return { storeKey, success: true, status: 'completed', metrics };
    } catch (error: any) {
      metrics.durationMs = Date.now() - startTime;
      const isBlock = error instanceof StoreAccessBlockedError;
      const errorCategory: ScrapeErrorCategory = isBlock
        ? 'ANTI_BOT'
        : classifyScraperError(error);
      const errMsg = isBlock
        ? `Store access restricted (anti-bot / rate limit): ${error.message}`
        : error.message || 'Unknown scrape failure';

      logger.error({ storeKey, error: errMsg, errorCategory, isBlock }, 'Store scraper failed');

      await this.jobService.failJob(jobId, error, metrics.scraped, metrics.errors, metrics, errorCategory, dryRun);
      return { storeKey, success: false, status: 'failed', metrics, error: errMsg, errorCategory };
    }
  }

  /**
   * Runs catalog refresh for a single store: fetches known PDPs, validates redirects/domains,
   * updates prices with allowCreate: false, and enforces coverage policy.
   */
  async runRefresh(options: RunRefreshOptions): Promise<StoreScrapeResult> {
    const { storeKey, triggeredBy = 'cron', dryRun = scraperConfig.dryRun, force = false, limit } = options;
    const startTime = Date.now();

    const metrics: ScrapeMetrics = {
      discovered: 0,
      scraped: 0,
      matched: 0,
      newProducts: 0,
      newVariants: 0,
      updatedPrices: 0,
      rejected: 0,
      errors: 0,
      durationMs: 0,
      gtinMatches: 0,
      storeIdentifierMatches: 0,
      brandModelMatches: 0,
      exactSpecsMatches: 0,
      strongSpecsMatches: 0,
      fuzzyCandidates: 0,
      fuzzyRejected: 0,
      ambiguousMatches: 0,
      priceValidationWarnings: 0,
      priceOutlierRejections: 0,
      historyDeduplicated: 0,
      historySnapshots: 0,
    };

    logger.info({ storeKey, dryRun, force }, 'Starting isolated store refresh run');

    // 1. Resolve store in DB
    const { data: store, error: storeErr } = await this.supabase
      .from('stores')
      .select('id, name, slug, scraper_key, is_active')
      .or(`scraper_key.eq.${storeKey},slug.eq.${storeKey}`)
      .maybeSingle();

    if (storeErr || !store) {
      const err = `Store "${storeKey}" not found in database: ${storeErr?.message || 'not found'}`;
      logger.error({ storeKey }, err);
      return { storeKey, success: false, status: 'failed', metrics, error: err };
    }

    // 2. Start refresh job
    const jobId = await this.jobService.startJob(store.id, triggeredBy, dryRun, force, 'refresh');
    if (!jobId) {
      const err = `A job is already running for store ${storeKey}`;
      logger.warn({ storeKey, storeId: store.id }, err);
      return { storeKey, success: false, status: 'cancelled', metrics, error: err };
    }

    const expectedDomain = STORE_BASE_DOMAINS[storeKey];
    if (!expectedDomain) {
      const err = `No base domain configured for store ${storeKey}`;
      logger.error({ storeKey }, err);
      await this.jobService.failJob(jobId, new Error(err), 0, 1, metrics, 'UNKNOWN', dryRun);
      return { storeKey, success: false, status: 'failed', metrics, error: err };
    }

    // 3. Load known candidate URLs using stale-first priority
    const refreshRepo = new RefreshUrlRepository(this.supabase);
    const candidateLimit = limit || scraperConfig.refreshUrlLimit;
    const candidates = await refreshRepo.getRefreshCandidates(store.id, candidateLimit);
    metrics.discovered = candidates.length;

    if (candidates.length === 0) {
      logger.info({ storeKey }, 'No refresh candidates found with product URLs');
      metrics.durationMs = Date.now() - startTime;
      const metadata = {
        coveragePct: 100,
        minimumCoveragePct: scraperConfig.minimumCoveragePct,
        lowCoverage: false,
        targetCount: 0,
        successCount: 0,
      };
      await this.jobService.completeJob(jobId, 0, 0, metrics, dryRun, metadata);
      return { storeKey, success: true, status: 'completed', metrics };
    }

    let browser: Browser | null = null;

    try {
      if (storeKey !== 'telemart') {
        browser = await chromium.launch({ headless: true });
      }

      const telemartScraper = new TelemartScraper();
      const priceOyeScraper = new PriceOyeScraper();
      const megaScraper = new MegaPkScraper();
      const shophiveScraper = new ShophiveScraper();

      for (const candidate of candidates) {
        try {
          // Domain verification (Phase 6)
          if (!isValidStoreDomain(candidate.productUrl, expectedDomain)) {
            logger.warn({ storeKey, url: candidate.productUrl }, 'Domain boundary validation failed for refresh candidate');
            metrics.rejected++;
            metrics.errors++;
            continue;
          }

          let scrapedProduct: any = null;

          if (storeKey === 'telemart') {
            // Shopify direct JSON PDP fetch
            const handleMatch = candidate.productUrl.match(/\/products\/([a-zA-Z0-9\-_%]+)/);
            const handle = handleMatch ? handleMatch[1] : null;
            if (!handle) {
              metrics.errors++;
              continue;
            }

            try {
              const res = await axios.get(`https://www.telemart.pk/products/${handle}.json`, {
                headers: { 'User-Agent': scraperConfig.userAgent },
                timeout: scraperConfig.requestTimeoutMs,
                maxRedirects: 5,
              });

              if (res.data?.product) {
                scrapedProduct = telemartScraper.extractFromShopifyProduct(res.data.product);
                const redirCheck = validateStoreRedirect({
                  storeSlug: 'telemart',
                  originalUrl: candidate.productUrl,
                  finalUrl: `https://www.telemart.pk/products/${res.data.product.handle || handle}`,
                  scrapedIdentifier: scrapedProduct?.sourceIdentifier,
                  knownIdentifier: candidate.sourceIdentifier,
                });
                if (!redirCheck.isValid) {
                  logger.warn({ url: candidate.productUrl, reason: redirCheck.reason }, 'Telemart redirect validation failed');
                  scrapedProduct = null;
                }
              }
            } catch (fetchErr: any) {
              logger.debug({ url: candidate.productUrl, err: fetchErr.message }, 'Failed to fetch Telemart JSON PDP');
            }
          } else if (browser) {
            const context = await browser.newContext({ userAgent: scraperConfig.userAgent });
            const page = await context.newPage();
            try {
              await page.goto(candidate.productUrl, {
                waitUntil: 'domcontentloaded',
                timeout: scraperConfig.navigationTimeoutMs,
              });

              const finalUrl = page.url();
              const redirCheck = validateStoreRedirect({
                storeSlug: storeKey,
                originalUrl: candidate.productUrl,
                finalUrl,
                knownIdentifier: candidate.sourceIdentifier,
              });

              if (!redirCheck.isValid) {
                logger.warn({ originalUrl: candidate.productUrl, finalUrl, reason: redirCheck.reason }, 'Redirect validation failed');
              } else {
                if (storeKey === 'priceoye') {
                  scrapedProduct = await priceOyeScraper.scrapeProductPage(page, finalUrl);
                } else if (storeKey === 'mega-pk') {
                  const html = await page.content();
                  scrapedProduct = megaScraper.extractFromHtml(html, finalUrl);
                } else if (storeKey === 'shophive') {
                  const html = await page.content();
                  scrapedProduct = shophiveScraper.extractProductFromHtml(html, finalUrl, 'refresh');
                }
              }
            } finally {
              await page.close().catch(() => {});
              await context.close().catch(() => {});
            }
          }

          if (!scrapedProduct) {
            metrics.errors++;
            continue;
          }

          metrics.scraped++;

          // Ingest with allowCreate: false (Phase 3)
          const res = await this.ingestionService.ingest(scrapedProduct, store.id, dryRun, { allowCreate: false });

          if (res.action === 'updated_price' || res.action === 'dry_run_matched') {
            metrics.updatedPrices++;
            metrics.matched++;
          } else {
            metrics.rejected++;
          }
        } catch (itemErr: any) {
          metrics.errors++;
          logger.warn({ storeKey, url: candidate.productUrl, err: itemErr.message }, 'Error refreshing candidate product');
        }
      }

      metrics.durationMs = Date.now() - startTime;

      // Coverage policy evaluation (Phase 11)
      const targetCount = candidates.length;
      const successCount = metrics.updatedPrices;
      const coveragePct = targetCount > 0 ? (successCount / targetCount) * 100 : 0;
      const isLowCoverage = successCount > 0 && coveragePct < scraperConfig.minimumCoveragePct;

      const metadata = {
        coveragePct: Math.round(coveragePct * 10) / 10,
        minimumCoveragePct: scraperConfig.minimumCoveragePct,
        lowCoverage: isLowCoverage,
        targetCount,
        successCount,
      };

      if (successCount === 0 && targetCount > 0) {
        const errorMsg = `Refresh run for ${storeKey} failed: 0 of ${targetCount} products succeeded (0% coverage)`;
        logger.error({ storeKey, metadata }, errorMsg);
        await this.jobService.failJob(jobId, new Error(errorMsg), successCount, metrics.errors, metrics, 'UNKNOWN', dryRun, metadata);
        return { storeKey, success: false, status: 'failed', metrics, error: errorMsg };
      }

      if (isLowCoverage) {
        logger.warn(
          { storeKey, metadata },
          `Low coverage alert for ${storeKey}: ${metadata.coveragePct}% < ${scraperConfig.minimumCoveragePct}%`
        );
      }

      await this.jobService.completeJob(jobId, successCount, metrics.errors, metrics, dryRun, metadata);
      logger.info({ storeKey, metadata }, 'Store refresh run completed');
      return { storeKey, success: true, status: 'completed', metrics };
    } catch (err: any) {
      metrics.durationMs = Date.now() - startTime;
      const errorCategory = classifyScraperError(err);
      logger.error({ storeKey, error: err.message, errorCategory }, 'Fatal error during refresh run');
      await this.jobService.failJob(jobId, err, metrics.scraped, metrics.errors + 1, metrics, errorCategory, dryRun);
      return { storeKey, success: false, status: 'failed', metrics, error: err.message, errorCategory };
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  /**
   * Runs all supported scrapers with failure isolation (one store failure does not abort others).
   */
  async runAll(triggeredBy: 'system' | 'admin' | 'cron' | 'manual' = 'manual', dryRun = scraperConfig.dryRun): Promise<Record<string, StoreScrapeResult>> {
    const supportedStores = this.registry.getSupportedStores();
    logger.info({ supportedStores, dryRun }, 'Starting scrape run for all supported stores');

    const results: Record<string, StoreScrapeResult> = {};

    for (const storeKey of supportedStores) {
      try {
        const result = await this.runStore({ storeKey, triggeredBy, dryRun });
        results[storeKey] = result;
      } catch (err: any) {
        // Absolute failure isolation guarantee
        const errorCategory = classifyScraperError(err);
        logger.error({ storeKey, error: err.message, errorCategory }, 'Unhandled failure in store execution boundary');
        results[storeKey] = {
          storeKey,
          success: false,
          status: 'failed',
          metrics: { discovered: 0, scraped: 0, matched: 0, newProducts: 0, newVariants: 0, updatedPrices: 0, rejected: 0, errors: 1, durationMs: 0, gtinMatches: 0, storeIdentifierMatches: 0, brandModelMatches: 0, exactSpecsMatches: 0, strongSpecsMatches: 0, fuzzyCandidates: 0, fuzzyRejected: 0, ambiguousMatches: 0, priceValidationWarnings: 0, priceOutlierRejections: 0, historyDeduplicated: 0, historySnapshots: 0 },
          error: err.message,
          errorCategory,
        };
      }
    }

    return results;
  }
}
