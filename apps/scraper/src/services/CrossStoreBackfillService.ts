import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ShophiveScraper } from '../scrapers/stores/ShophiveScraper';
import { PriceOyeScraper } from '../scrapers/stores/PriceOyeScraper';
import { TelemartScraper } from '../scrapers/stores/TelemartScraper';
import { MegaPkScraper } from '../scrapers/stores/MegaPkScraper';
import { ProductMatcher } from './ProductMatcher';
import { PriceIngestionService } from './PriceIngestionService';
import { ProductRepository } from '../repositories/ProductRepository';
import { PriceRepository } from '../repositories/PriceRepository';
import { logger } from '../scrapers/base/BaseScraper';
import { validatePrice } from '../validation/PriceValidator';
import { delay } from '../utils/scraperUtils';
import { ScrapedProductSchemaType } from '../types/scraperTypes';
import { normalizeProductName, calculateStringSimilarity } from '@pakprice/shared';

export type BackfillOutcome =
  | 'found_and_matched'
  | 'offer_persisted'
  | 'no_listing_found'
  | 'no_match'
  | 'ambiguous'
  | 'invalid_price'
  | 'invalid_url'
  | 'unsupported_store'
  | 'blocked_or_rate_limited'
  | 'scrape_error';

export interface BackfillAuditRecord {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  storeSlug: string;
  outcome: BackfillOutcome;
  candidateUrl?: string;
  candidateTitle?: string;
  price?: number;
  matchMethod?: string;
  confidence?: number;
  reason?: string;
  timestamp: string;
}

export interface BackfillOptions {
  apply: boolean;                     // dry-run by default (false)
  stores: string[];                   // e.g. ['shophive', 'priceoye', 'mega-pk']
  batchSize: number;                  // default 20
  offset?: number;                    // start offset
  rateLimitMs: number;                // default 1500ms
  concurrency: number;                // bounded (1 default)
  timeoutMs: number;                  // per-request timeout (15000ms)
  checkpointFile: string;             // path to JSON checkpoint
  onlyTelemartSingleStore?: boolean; // filter only Telemart-exclusive products
  productIds?: string[];              // explicit product ID allowlist
  categories?: string[];              // category slug allowlist
}

export interface BackfillSummary {
  totalCanonicalAudited: number;
  candidatesFound: number;
  pdpsParsed: number;
  safeCanonicalMatches: number;
  offersPersisted: number;
  outcomes: Record<BackfillOutcome, number>;
  records: BackfillAuditRecord[];
  durationMs: number;
}

export class CrossStoreBackfillService {
  private supabase: SupabaseClient;
  private matcher: ProductMatcher;
  private ingestionService: PriceIngestionService;
  private productRepo: ProductRepository;
  private priceRepo: PriceRepository;

  private shophiveScraper = new ShophiveScraper();
  private priceoyeScraper = new PriceOyeScraper();
  private telemartScraper = new TelemartScraper();
  private megaScraper = new MegaPkScraper();

  private isInterrupted = false;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    this.matcher = new ProductMatcher();
    this.ingestionService = new PriceIngestionService();
    this.productRepo = new ProductRepository();
    this.priceRepo = new PriceRepository();

    // Setup graceful interruption handlers
    process.on('SIGINT', () => {
      logger.warn('SIGINT received: finishing current operation and gracefully halting backfill...');
      this.isInterrupted = true;
    });
    process.on('SIGTERM', () => {
      logger.warn('SIGTERM received: gracefully halting backfill...');
      this.isInterrupted = true;
    });
  }

  /**
   * Run cross-store backfill across targeted canonical products
   */
  async runBackfill(options: BackfillOptions): Promise<BackfillSummary> {
    const startTime = Date.now();
    this.isInterrupted = false;

    // Load checkpoint
    const processedIds = this.loadCheckpoint(options.checkpointFile);

    // Fetch stores metadata
    const { data: dbStores } = await this.supabase.from('stores').select('id, slug, name');
    const storeMap = new Map<string, { id: string; name: string }>(
      (dbStores || []).map((s: any) => [s.slug, { id: s.id, name: s.name }])
    );

    // Fetch candidate products
    const products = await this.fetchTargetProducts(options);
    logger.info({ totalFound: products.length, batchSize: options.batchSize }, 'Loaded target products for backfill');

    const summary: BackfillSummary = {
      totalCanonicalAudited: 0,
      candidatesFound: 0,
      pdpsParsed: 0,
      safeCanonicalMatches: 0,
      offersPersisted: 0,
      outcomes: {
        found_and_matched: 0,
        offer_persisted: 0,
        no_listing_found: 0,
        no_match: 0,
        ambiguous: 0,
        invalid_price: 0,
        invalid_url: 0,
        unsupported_store: 0,
        blocked_or_rate_limited: 0,
        scrape_error: 0,
      },
      records: [],
      durationMs: 0,
    };

    let processedCount = 0;

    for (const product of products) {
      if (this.isInterrupted) {
        logger.warn('Interruption detected: saving checkpoint and exiting cleanly.');
        break;
      }

      if (processedIds.has(product.id)) {
        logger.debug({ productId: product.id }, 'Skipping product already recorded in checkpoint');
        continue;
      }

      if (processedCount >= options.batchSize) {
        logger.info({ batchSize: options.batchSize }, 'Reached batch size limit for this run.');
        break;
      }

      summary.totalCanonicalAudited++;
      processedCount++;

      logger.info(
        { index: processedCount, total: options.batchSize, product: product.name, slug: product.slug },
        `\n[Backfill ${processedCount}/${options.batchSize}] Auditing canonical product: ${product.name}`
      );

      // Check each store in allowlist
      for (const storeSlug of options.stores) {
        if (this.isInterrupted) break;

        const storeInfo = storeMap.get(storeSlug);
        if (!storeInfo) {
          this.recordOutcome(summary, {
            productId: product.id,
            productName: product.name,
            variantId: product.product_variants[0]?.id || '',
            variantName: product.product_variants[0]?.name || 'Standard',
            storeSlug,
            outcome: 'unsupported_store',
            reason: `Store ${storeSlug} not configured in DB`,
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        // Check if store already has a verified offer for this product's variants
        const hasExistingStorePrice = product.product_variants.some((v: any) =>
          v.prices?.some((pr: any) => pr.store_id === storeInfo.id)
        );

        if (hasExistingStorePrice) {
          logger.debug({ product: product.name, store: storeSlug }, 'Product already has offer for this store, skipping');
          continue;
        }

        // Search store for candidates
        await delay(options.rateLimitMs);
        const storeAudit = await this.searchAndEvaluateStore(product, storeSlug, storeInfo.id, options);

        summary.candidatesFound += storeAudit.candidatesFound;
        summary.pdpsParsed += storeAudit.pdpsParsed;

        for (const record of storeAudit.records) {
          this.recordOutcome(summary, record);
          if (record.outcome === 'found_and_matched') summary.safeCanonicalMatches++;
          if (record.outcome === 'offer_persisted') summary.offersPersisted++;
        }
      }

      // Checkpoint after completing this product
      processedIds.add(product.id);
      this.saveCheckpoint(options.checkpointFile, processedIds);
    }

    summary.durationMs = Date.now() - startTime;
    return summary;
  }

  /**
   * Search and evaluate a specific store for candidates matching canonical product
   */
  private async searchAndEvaluateStore(
    product: any,
    storeSlug: string,
    storeId: string,
    options: BackfillOptions
  ): Promise<{ candidatesFound: number; pdpsParsed: number; records: BackfillAuditRecord[] }> {
    const records: BackfillAuditRecord[] = [];
    let candidatesFound = 0;
    let pdpsParsed = 0;

    const firstVariant = product.product_variants[0] || {};
    const defaultRecord: Omit<BackfillAuditRecord, 'outcome'> = {
      productId: product.id,
      productName: product.name,
      variantId: firstVariant.id || '',
      variantName: firstVariant.name || 'Standard',
      storeSlug,
      timestamp: new Date().toISOString(),
    };

    // Clean query from product name: strip boilerplate, keep brand + model
    const query = this.buildSearchQuery(product);

    try {
      const candidates = await this.searchStoreCandidates(storeSlug, query, product, options.timeoutMs);
      candidatesFound = candidates.length;

      if (candidates.length === 0) {
        records.push({
          ...defaultRecord,
          outcome: 'no_listing_found',
          reason: `No candidates found for query: "${query}"`,
        });
        return { candidatesFound, pdpsParsed, records };
      }

      // Evaluate candidate URLs (limit to top 3 candidates per store to respect rate limits)
      let matchedAny = false;
      let lastFailureReason = '';
      const candidatesToTest = candidates.slice(0, 3);

      for (const candidate of candidatesToTest) {
        await delay(options.rateLimitMs);
        pdpsParsed++;

        const scraped = await this.fetchAndExtractPdp(storeSlug, candidate.url, product, options.timeoutMs);
        if (!scraped) {
          records.push({
            ...defaultRecord,
            outcome: 'scrape_error',
            candidateUrl: candidate.url,
            candidateTitle: candidate.title,
            reason: 'Failed to extract valid product schema from PDP',
          });
          continue;
        }

        if (!scraped.price || scraped.price <= 0) {
          records.push({
            ...defaultRecord,
            outcome: 'invalid_price',
            candidateUrl: candidate.url,
            candidateTitle: scraped.name,
            reason: `Invalid price: ${scraped.price}`,
          });
          continue;
        }

        // Test matching with existing locked ProductMatcher
        const matchResult = await this.matcher.match(scraped, storeId);

        if (matchResult.status === 'ambiguous') {
          lastFailureReason = matchResult.reason || 'Ambiguous match candidate rejected';
          continue;
        }

        if (matchResult.status === 'no_match' || !matchResult.product) {
          lastFailureReason = 'Matcher confidence below locked 0.75 threshold or incompatible specs';
          continue;
        }

        // Verify the matched product is indeed THIS canonical product (prevent cross-product collisions)
        if (matchResult.product.id !== product.id) {
          lastFailureReason = `Matched different product ID ${matchResult.product.id} instead of target ${product.id}`;
          continue;
        }

        // Size specification conflict guard (e.g. 40mm vs 44mm smartwatch)
        const canonicalSize = (product.name || '').match(/\b(\d{2})\s*mm\b/i)?.[1];
        const candidateSize = (scraped.name || '').match(/\b(\d{2})\s*mm\b/i)?.[1];
        if (canonicalSize && candidateSize && canonicalSize !== candidateSize) {
          lastFailureReason = `Watch size conflict: canonical ${canonicalSize}mm vs candidate ${candidateSize}mm`;
          continue;
        }

        // Verify variant isolation: must match a valid variant in this product
        const targetVariant = matchResult.variant || product.product_variants.find((v: any) => v.id === matchResult.variant?.id);
        if (!targetVariant) {
          lastFailureReason = 'Candidate specs do not match any existing variant (allowCreate=false)';
          continue;
        }

        // Safe match verified!
        matchedAny = true;
        const auditRecord: BackfillAuditRecord = {
          ...defaultRecord,
          variantId: targetVariant.id,
          variantName: targetVariant.name,
          outcome: options.apply ? 'offer_persisted' : 'found_and_matched',
          candidateUrl: candidate.url,
          candidateTitle: scraped.name,
          price: scraped.price,
          matchMethod: matchResult.method || undefined,
          confidence: matchResult.confidence,
          reason: matchResult.reason,
        };

        if (options.apply) {
          // Explicit --apply: write to database with allowCreate=false
          const persistRes = await this.persistVerifiedOffer(targetVariant, product, storeId, scraped);
          if (persistRes.success) {
            auditRecord.outcome = 'offer_persisted';
            logger.info(
              { product: product.name, store: storeSlug, price: scraped.price, variantId: targetVariant.id },
              'Offer successfully persisted to database'
            );
          } else {
            auditRecord.outcome = 'invalid_price';
            auditRecord.reason = `Persistence rejected: ${persistRes.reason}`;
          }
        } else {
          logger.info(
            { product: product.name, store: storeSlug, price: scraped.price, method: matchResult.method, conf: matchResult.confidence },
            '[DRY RUN] Verified match ready for persistence'
          );
        }

        records.push(auditRecord);
        break; // Match found for this store, advance to next store
      }

      if (!matchedAny) {
        records.push({
          ...defaultRecord,
          outcome: 'no_match',
          reason: lastFailureReason || 'All candidates evaluated but none satisfied strict 6H/5B matching criteria',
        });
      }
    } catch (err: any) {
      if (err.message?.includes('403') || err.message?.includes('Cloudflare') || err.message?.includes('blocked')) {
        records.push({
          ...defaultRecord,
          outcome: 'blocked_or_rate_limited',
          reason: `Store access blocked or rate limited: ${err.message}`,
        });
      } else {
        records.push({
          ...defaultRecord,
          outcome: 'scrape_error',
          reason: `Search connector error: ${err.message}`,
        });
      }
    }

    return { candidatesFound, pdpsParsed, records };
  }

  /**
   * Search store candidates using verified connector mechanism
   */
  private async searchStoreCandidates(
    storeSlug: string,
    query: string,
    product: any,
    timeoutMs: number
  ): Promise<Array<{ title: string; url: string }>> {
    const results: Array<{ title: string; url: string }> = [];

    if (storeSlug === 'shophive') {
      const searchUrl = `https://www.shophive.com/catalogsearch/result/?q=${encodeURIComponent(query)}`;
      const res = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: timeoutMs,
      });
      const $ = cheerio.load(res.data);
      $('a.product-item-link, .item.product a.product-item-link').each((_, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim();
        if (href && href.startsWith('http') && !results.some(r => r.url === href)) {
          results.push({ title, url: href });
        }
      });
    } else if (storeSlug === 'telemart') {
      const suggestUrl = `https://www.telemart.pk/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product`;
      let res: any;
      try {
        res = await axios.get(suggestUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: timeoutMs,
        });
      } catch (err: any) {
        if (err.response?.status === 429) {
          logger.warn({ query }, 'Telemart rate limit (429) encountered — waiting 4000ms before polite retry');
          await delay(4000);
          res = await axios.get(suggestUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: timeoutMs,
          });
        } else {
          throw err;
        }
      }
      const products = res.data?.resources?.results?.products || [];
      for (const p of products) {
        const url = p.url?.startsWith('http') ? p.url : `https://www.telemart.pk${p.url}`;
        results.push({ title: p.title, url });
      }
    } else if (storeSlug === 'priceoye') {
      const searchUrl = `https://priceoye.pk/search?q=${encodeURIComponent(query)}`;
      const res = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: timeoutMs,
      });
      const $ = cheerio.load(res.data);
      $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (
          href.includes('/mobiles/') ||
          href.includes('/laptops/') ||
          href.includes('/smart-watches/') ||
          href.includes('/tablets/') ||
          href.includes('/wireless-earbuds/')
        ) {
          // Exclude category listing roots like /mobiles/samsung or /mobiles/pricelist/...
          const segments = href.replace(/^https?:\/\/priceoye\.pk/, '').split('/').filter(Boolean);
          if (segments.length >= 3 && !href.includes('/pricelist/')) {
            const fullUrl = href.startsWith('http') ? href : `https://priceoye.pk${href.startsWith('/') ? '' : '/'}${href}`;
            const title = $(el).find('img').attr('alt') || $(el).text().trim() || segments[segments.length - 1];
            if (!results.some(r => r.url === fullUrl)) {
              results.push({ title, url: fullUrl });
            }
          }
        }
      });
    } else if (storeSlug === 'mega-pk') {
      // Direct /search/ on Mega.pk returns 403. Check category pattern or document restriction
      throw new Error('Mega.pk search endpoint is anti-bot protected (403 Forbidden). Use category indexing.');
    } else {
      throw new Error(`Store connector ${storeSlug} not implemented for direct backfill search`);
    }

    return results;
  }

  /**
   * Fetch PDP and extract ScrapedProduct schema
   */
  private async fetchAndExtractPdp(
    storeSlug: string,
    url: string,
    canonicalProduct: any,
    timeoutMs: number
  ): Promise<ScrapedProductSchemaType | null> {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: timeoutMs,
    });

    const html = res.data;
    const catSlug = (canonicalProduct.categories as any)?.slug || 'mobiles';

    if (storeSlug === 'shophive') {
      return this.shophiveScraper.extractProductFromHtml(html, url, catSlug);
    } else if (storeSlug === 'priceoye') {
      return this.priceoyeScraper.extractProductFromHtml(html, url);
    } else if (storeSlug === 'telemart') {
      return this.telemartScraper.extractFromHtml(html, url);
    } else if (storeSlug === 'mega-pk') {
      return this.megaScraper.extractFromHtml(html, url);
    }

    return null;
  }

  /**
   * Build clean query string for store search
   */
  private buildSearchQuery(product: any): string {
    let name = product.name;

    // 1. Strip parentheticals and bracketed content (e.g. "(8GB256GB)", "[4G]", "(Titanium Milanese Loop)")
    name = name.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');

    // 2. Strip common marketing / warranty / spec fluff
    name = name
      .replace(/\b(Dual Sim|With Official Warranty|Official Warranty|Pin Pack|PTA Approved)\b/gi, ' ')
      .replace(/\b(Win11|Windows 11|DOS Laptop|OLED Display|FHD Display|WUXGA Display)\b/gi, ' ')
      .replace(/\b(Touch screen Display|Backlit KB|Fingerprint Reader|Gaming Laptop)\b/gi, ' ')
      .replace(/\b(Smartwatch|Smart Watch|Stainless Steel|Titanium|Ceramic|Aluminum)\b/gi, ' ')
      .replace(/\b(Intel Core|AMD Ryzen|GeForce RTX|NVIDIA RTX|Graphics|Display|Ultra|Pro)\b/gi, (match: string) => {
        // Keep Ultra/Pro if part of model name (e.g. Watch Ultra or Focus Pro)
        return match.toLowerCase() === 'ultra' || match.toLowerCase() === 'pro' ? match : ' ';
      })
      .replace(/\s+/g, ' ')
      .trim();

    // 3. Avoid duplicate brand name (e.g. "HP HP Optical Mouse" -> "HP Optical Mouse")
    const brand = (product.brands as any)?.name || '';
    if (brand) {
      const brandRegex = new RegExp(`^${brand}\\s+${brand}\\b`, 'i');
      name = name.replace(brandRegex, brand);
      if (!name.toLowerCase().startsWith(brand.toLowerCase())) {
        name = `${brand} ${name}`;
      }
    }

    // 4. Extract first 3-4 significant tokens for highest recall on Magento/Shopify/PriceOye engines
    const tokens = name.split(/\s+/).filter(Boolean);
    return tokens.slice(0, 4).join(' ');
  }

  /**
   * Query database for target canonical products
   */
  private async fetchTargetProducts(options: BackfillOptions): Promise<any[]> {
    const { data: stores } = await this.supabase.from('stores').select('id, slug');
    const storeMap = new Map((stores || []).map((s: any) => [s.id, s.slug]));

    const { data: products } = await this.supabase
      .from('products')
      .select(`
        id, name, slug, brand_id, category_id,
        brands ( name ),
        categories ( name, slug ),
        product_variants (
          id, name, ram_gb, storage_gb, color, model_number,
          prices ( id, store_id, price, in_stock, product_url, last_scraped_at )
        )
      `)
      .order('created_at', { ascending: false });

    const targetList: any[] = [];

    for (const p of products || []) {
      const storeSet = new Set<string>();
      let hasTelemart = false;

      for (const v of p.product_variants || []) {
        for (const pr of v.prices || []) {
          const storeSlug = storeMap.get(pr.store_id);
          if (storeSlug) {
            storeSet.add(storeSlug);
            if (storeSlug === 'telemart') hasTelemart = true;
          }
        }
      }

      if (options.productIds && options.productIds.length > 0) {
        if (!options.productIds.includes(p.id)) continue;
      }

      if (options.categories && options.categories.length > 0) {
        const catSlug = (p.categories as any)?.slug;
        if (!catSlug || !options.categories.includes(catSlug)) continue;
      }

      if (options.onlyTelemartSingleStore) {
        if (hasTelemart && storeSet.size === 1) {
          targetList.push(p);
        }
      } else {
        targetList.push(p);
      }
    }

    if (options.offset && options.offset > 0) {
      return targetList.slice(options.offset);
    }
    return targetList;
  }

  /**
   * Safely persist a verified match to existing product variant
   * Adheres strictly to locked 5B/5C rules: allowCreate=false, price validation, deduped history, scoped by (variant_id, store_id)
   */
  private async persistVerifiedOffer(
    targetVariant: any,
    product: any,
    storeId: string,
    scraped: ScrapedProductSchemaType
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      // 1. Price validation using 5C PriceValidator
      const currentPriceRow = await this.priceRepo.getCurrentPrice(targetVariant.id, storeId);
      const previousPrice = currentPriceRow ? currentPriceRow.price : null;
      const previousOriginalPrice = currentPriceRow ? currentPriceRow.original_price : null;

      const validation = validatePrice({
        price: scraped.price,
        originalPrice: scraped.originalPrice || null,
        discountPercent: scraped.discountPercent || null,
        shippingFee: scraped.shippingFee ?? null,
        inStock: scraped.inStock,
        stockCount: scraped.stockCount || null,
        previousPrice,
        previousOriginalPrice,
      });

      if (validation.action === 'rejected') {
        return { success: false, reason: validation.rejectReason || 'Price validation rejected' };
      }

      // 2. Fill missing images if any (5D)
      if (scraped.imageUrl) {
        if (!product.image_url) {
          await this.productRepo.updateProductImageIfMissing(product.id, scraped.imageUrl);
        }
        if (!targetVariant.image_url) {
          await this.productRepo.updateVariantImageIfMissing(targetVariant.id, scraped.imageUrl);
        }
      }

      // 3. Upsert store identifier
      if (scraped.sourceIdentifier) {
        await this.productRepo.upsertIdentifier(
          targetVariant.id,
          storeId,
          scraped.sourceIdentifier,
          scraped.sourceIdentifierType || 'url'
        );
      }

      // 4. Upsert current price scoped to (variant_id, store_id)
      await this.priceRepo.upsertCurrentPrice({
        variant_id: targetVariant.id,
        store_id: storeId,
        price: validation.price,
        original_price: validation.originalPrice,
        discount_percent: validation.discountPercent,
        shipping_fee: validation.shippingFee ?? 0,
        min_order_free_shipping: null,
        coupon_discount: 0,
        bank_discount: 0,
        in_stock: scraped.inStock,
        stock_count: validation.stockCount,
        product_url: scraped.sourceUrl,
        last_scraped_at: new Date().toISOString(),
      });

      // 5. Deduplicated price history
      const latestHistory = await this.priceRepo.getLatestHistoryEntry(targetVariant.id, storeId);
      const shouldInsert = !latestHistory || latestHistory.price !== validation.price || latestHistory.in_stock !== scraped.inStock;
      if (shouldInsert) {
        await this.priceRepo.insertPriceHistory(
          targetVariant.id,
          storeId,
          validation.price,
          validation.originalPrice,
          validation.shippingFee ?? 0,
          scraped.inStock
        );
      }

      return { success: true };
    } catch (err: any) {
      logger.error({ err: err.message, variantId: targetVariant.id, storeId }, 'Failed to persist verified offer');
      return { success: false, reason: err.message };
    }
  }

  private recordOutcome(summary: BackfillSummary, record: BackfillAuditRecord) {
    summary.outcomes[record.outcome] = (summary.outcomes[record.outcome] || 0) + 1;
    summary.records.push(record);
  }

  private loadCheckpoint(filePath: string): Set<string> {
    if (!fs.existsSync(filePath)) return new Set();
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return new Set(Array.isArray(data) ? data : data.processedIds || []);
    } catch {
      return new Set();
    }
  }

  private saveCheckpoint(filePath: string, ids: Set<string>) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify({ processedIds: Array.from(ids), updatedAt: new Date().toISOString() }, null, 2));
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to save checkpoint');
    }
  }
}
