import { ScrapedProductSchemaType, IngestionResult } from '../types/scraperTypes';
import { ProductMatcher } from './ProductMatcher';
import { ProductRepository } from '../repositories/ProductRepository';
import { PriceRepository } from '../repositories/PriceRepository';
import { validatePrice, PriceValidationInput } from '../validation/PriceValidator';
import { scraperConfig } from '../config/scraperConfig';
import { logger } from '../scrapers/base/BaseScraper';
import { 
  normalizeProductName, 
  generateProductSlug, 
  buildVariantName, 
  buildNormalizedVariantName,
  normalizeModelNumber,
} from '@pakprice/shared';

export interface IngestionOptions {
  allowCreate?: boolean;
}

export class PriceIngestionService {
  private matcher = new ProductMatcher();
  private productRepo = new ProductRepository();
  private priceRepo = new PriceRepository();

  async ingest(
    scraped: ScrapedProductSchemaType,
    storeId: string,
    dryRun: boolean,
    options?: IngestionOptions
  ): Promise<IngestionResult> {
    try {
      const allowCreate = options?.allowCreate ?? true;

      // ── Step 1: Basic price safety check (fast reject before matching) ──
      if (!scraped.price || !Number.isFinite(scraped.price) || scraped.price <= 0) {
        logger.warn({ product: scraped.name, price: scraped.price }, 'Rejecting invalid scraped price');
        return { action: 'rejected', reason: 'Invalid price' };
      }

      // ── Step 2: Match using structured MatchResult (5B — LOCKED) ──
      const matchResult = await this.matcher.match(scraped, storeId);
      
      let matchedProduct = matchResult.product;
      let matchedVariant = matchResult.variant;
      let isNewProduct = false;
      let isNewVariant = false;

      if (matchResult.status === 'ambiguous') {
        logger.warn(
          { 
            name: scraped.name, 
            candidateCount: matchResult.candidates.length, 
            reason: matchResult.reason,
          },
          'Ambiguous match — rejecting ingestion to prevent data corruption'
        );
        return { 
          action: 'ambiguous_rejected', 
          reason: matchResult.reason,
          matchMethod: matchResult.method || undefined,
        };
      }

      if (matchResult.status === 'no_match') {
        if (!allowCreate) {
          logger.info({ name: scraped.name, storeId }, 'Ingestion rejecting no_match: allowCreate is false (refresh mode)');
          return {
            action: 'rejected',
            reason: 'Product creation disabled (refresh mode)',
            matchMethod: matchResult.method || undefined,
          };
        }

        if (dryRun) {
          logger.info({ name: scraped.name }, '[DRY RUN] Would create new product/variant');
          return { action: 'dry_run_new' };
        }

        // We need to create a new product and/or variant.
        const normalizedName = normalizeProductName(scraped.name);
        
        // Infer brand from scraped.brand or first word of product name
        let brand = scraped.brand ? await this.productRepo.getBrandByName(scraped.brand) : null;
        if (!brand) {
          const firstWord = scraped.name.split(' ')[0];
          brand = await this.productRepo.getBrandByName(firstWord);
        }

        // Infer category from URL or name keywords
        let categorySlug: string | null = null;
        const nameLower = scraped.name.toLowerCase();
        const urlLower = (scraped.sourceUrl || '').toLowerCase();
        if (urlLower.includes('/smart-phones') || nameLower.includes('iphone') || nameLower.includes('mobile') || nameLower.includes('galaxy s') || nameLower.includes('galaxy a')) {
          categorySlug = 'mobiles';
        } else if (urlLower.includes('/laptops') || nameLower.includes('macbook') || nameLower.includes('laptop') || nameLower.includes('thinkpad')) {
          categorySlug = 'laptops';
        } else if (urlLower.includes('/tablets') || nameLower.includes('tab') || nameLower.includes('ipad')) {
          categorySlug = 'tablets';
        } else if (urlLower.includes('/smart-watches') || nameLower.includes('watch')) {
          categorySlug = 'smart-watches';
        } else if (urlLower.includes('/earbuds') || nameLower.includes('earbud') || nameLower.includes('airpod') || nameLower.includes('headphone')) {
          categorySlug = 'headphones-audio';
        } else if (urlLower.includes('/power-banks') || nameLower.includes('power bank') || nameLower.includes('charger')) {
          categorySlug = 'computer-accessories';
        }

        const category = categorySlug ? await this.productRepo.getCategoryBySlug(categorySlug) : null;
        
        // Check if product family already exists (but no compatible variant)
        let product = await this.productRepo.fuzzySearchProduct(normalizedName, brand ? brand.id : null);
        
        if (!product) {
          // Create product
          product = await this.productRepo.createProduct({
            name: scraped.name,
            slug: generateProductSlug(brand ? brand.name : 'unknown', scraped.name),
            brand_id: brand ? brand.id : null,
            category_id: category ? category.id : null,
            image_url: scraped.imageUrl || null,
            normalized_name: normalizedName,
          } as any);
          
          if (!product) throw new Error('Failed to create product');
          logger.info({ productId: product.id }, 'Created new product');
          isNewProduct = true;
        }

        // Create variant
        const variantName = buildVariantName(scraped.ramGb || null, scraped.storageGb || null, scraped.color || null);
        const normalizedVariantName = buildNormalizedVariantName(scraped.ramGb || null, scraped.storageGb || null, scraped.color || null);
        
        const variant = await this.productRepo.createVariant({
          product_id: product.id,
          name: variantName,
          ram_gb: scraped.ramGb || null,
          storage_gb: scraped.storageGb || null,
          color: scraped.color || null,
          model_number: scraped.modelNumber ? normalizeModelNumber(scraped.modelNumber) : null,
          image_url: scraped.imageUrl || null,
          sku: scraped.sku || null,
          gtin: scraped.gtin || null,
          normalized_name: normalizedVariantName,
          source_identifier: scraped.sourceIdentifier
        });

        if (!variant) throw new Error('Failed to create variant');
        logger.info({ variantId: variant.id }, 'Created new variant');
        isNewVariant = true;
        
        matchedProduct = product;
        matchedVariant = variant;
      }

      // At this point we have a matched product and variant
      if (!matchedProduct || !matchedVariant) {
        throw new Error('Unexpected state: matched status but null product/variant');
      }

      // ── Step 2b: Missing → Valid image update (5D) ──
      // If the matched product/variant has no image yet and the scrape produced
      // a valid imageUrl, fill it in. The repo methods use a server-side IS NULL
      // filter — a valid existing URL can never be overwritten.
      if (scraped.imageUrl && !dryRun) {
        if (!matchedProduct.image_url) {
          await this.productRepo.updateProductImageIfMissing(matchedProduct.id, scraped.imageUrl);
          logger.info({ productId: matchedProduct.id, imageUrl: scraped.imageUrl }, '5D: filled missing product image_url');
        }
        if (!matchedVariant.image_url) {
          await this.productRepo.updateVariantImageIfMissing(matchedVariant.id, scraped.imageUrl);
          logger.info({ variantId: matchedVariant.id, imageUrl: scraped.imageUrl }, '5D: filled missing variant image_url');
        }
      }

      // ── Step 3: Fetch current price for outlier detection ──
      // Scoped by (variant_id, store_id)
      const currentPriceRow = await this.priceRepo.getCurrentPrice(matchedVariant.id, storeId);
      const previousPrice = currentPriceRow ? currentPriceRow.price : null;
      const previousOriginalPrice = currentPriceRow ? currentPriceRow.original_price : null;

      // ── Step 4: PriceValidator — correct or reject ──
      const validationInput: PriceValidationInput = {
        price: scraped.price,
        originalPrice: scraped.originalPrice || null,
        discountPercent: scraped.discountPercent || null,
        shippingFee: scraped.shippingFee ?? null,
        inStock: scraped.inStock,
        stockCount: scraped.stockCount || null,
        previousPrice,
        previousOriginalPrice,
      };

      const validation = validatePrice(validationInput);

      // Log validation warnings
      if (validation.warnings.length > 0) {
        logger.warn({
          variantId: matchedVariant.id,
          storeId,
          product: scraped.name,
          warnings: validation.warnings,
          action: validation.action,
        }, `Price validation: ${validation.warnings.length} warning(s)`);
      }

      // ── Step 5: IF rejected → return immediately ──
      // NO DB writes, NO history, NO alerts, NO last_scraped_at update
      if (validation.action === 'rejected') {
        logger.warn({
          variantId: matchedVariant.id,
          storeId,
          product: scraped.name,
          observedPrice: scraped.price,
          previousPrice,
          rejectReason: validation.rejectReason,
          configuredThresholds: {
            dropPct: scraperConfig.priceDropThresholdPct,
            increasePct: scraperConfig.priceIncreaseThresholdPct,
          },
        }, `Price rejected: ${validation.rejectReason}`);

        return {
          action: 'outlier_rejected',
          reason: validation.rejectReason || 'Price validation rejected',
          variantId: matchedVariant.id,
          productId: matchedProduct.id,
          matchMethod: matchResult.method || undefined,
        };
      }

      // ── Step 6: History dedup decision (read-only query) ──
      const latestHistory = await this.priceRepo.getLatestHistoryEntry(matchedVariant.id, storeId);

      const shouldInsertHistory = this.shouldInsertHistory(
        latestHistory,
        validation.price,
        validation.originalPrice,
        validation.shippingFee ?? 0,
        scraped.inStock
      );
      const historyDeduplicated = !shouldInsertHistory.insert;
      const historySnapshot = shouldInsertHistory.isPeriodicSnapshot;

      if (dryRun) {
        logger.info({ 
          variantId: matchedVariant.id, 
          matchMethod: matchResult.method,
          validationAction: validation.action,
          warnings: validation.warnings,
          historyDeduplicated,
          historySnapshot,
          wouldInsertHistory: shouldInsertHistory.insert,
        }, '[DRY RUN] Would update price and identifier (0 DB writes)');
        return { 
          action: 'dry_run_matched', 
          variantId: matchedVariant.id, 
          productId: matchedProduct.id,
          matchMethod: matchResult.method || undefined,
          historyDeduplicated,
          historySnapshot,
        };
      }

      // ── Step 7: Upsert Identifier ──
      await this.productRepo.upsertIdentifier(matchedVariant.id, storeId, scraped.sourceIdentifier, scraped.sourceIdentifierType);

      // ── Step 8: Upsert Current Price with validated values ──
      // last_scraped_at is set to now() ONLY because validation passed
      await this.priceRepo.upsertCurrentPrice({
        variant_id: matchedVariant.id,
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

      // ── Step 9: Insert History if required ──
      if (shouldInsertHistory.insert) {
        await this.priceRepo.insertPriceHistory(
          matchedVariant.id,
          storeId,
          validation.price,
          validation.originalPrice,
          validation.shippingFee ?? 0,
          scraped.inStock
        );
      }

      // ── Step 9: Alert evaluation — ONLY after validation passed + persistence succeeded ──
      if (scraped.inStock && validation.price > 0) {
        const claimedAlerts = await this.priceRepo.claimMatchingAlerts(matchedVariant.id, validation.price);
        if (claimedAlerts.length > 0) {
          logger.info(
            { variantId: matchedVariant.id, alertCount: claimedAlerts.length, currentPrice: validation.price },
            '🎯 Claimed matching price alerts atomically'
          );

          for (const alert of claimedAlerts) {
            const productName = `${(alert as any).variant?.product?.name || 'Product'} - ${(alert as any).variant?.name || 'Variant'}`;
            logger.info(
              {
                alertId: alert.id,
                userId: alert.user_id,
                targetPrice: alert.target_price,
                currentPrice: validation.price,
                productName,
              },
              '🔔 [ALERT TRIGGERED] Price drop notification dispatched'
            );
          }
        }
      }

      // ── Step 10: Telemetry ──
      logger.info({ 
        variantId: matchedVariant.id, 
        storeId, 
        matchMethod: matchResult.method,
        confidence: matchResult.confidence,
        validationAction: validation.action,
        historyDeduplicated,
        historySnapshot,
      }, 'Ingested price successfully');

      // Determine the base action
      let baseAction: IngestionResult['action'];
      if (validation.action === 'corrected') {
        baseAction = 'validation_corrected';
      } else if (isNewProduct) {
        baseAction = 'inserted_product';
      } else if (isNewVariant) {
        baseAction = 'inserted_variant';
      } else {
        baseAction = 'updated_price';
      }

      return { 
        action: baseAction, 
        productId: matchedProduct.id, 
        variantId: matchedVariant.id, 
        matchMethod: matchResult.method || undefined,
        historyDeduplicated,
        historySnapshot,
      };
    } catch (error: any) {
      logger.error({ error: error.message, scraped }, 'Failed to ingest price');
      throw error;
    }
  }

  /**
   * Window-aware history deduplication.
   *
   * - If price fields changed → always insert.
   * - If identical and inside snapshot interval → skip (suppress noise).
   * - If identical and outside snapshot interval → insert (periodic snapshot).
   */
  private shouldInsertHistory(
    latestHistory: {
      price: number;
      original_price: number | null;
      shipping_fee: number;
      in_stock: boolean;
      scraped_at: string;
    } | null,
    newPrice: number,
    newOriginalPrice: number | null,
    newShippingFee: number,
    newInStock: boolean
  ): { insert: boolean; isPeriodicSnapshot: boolean } {
    // No previous history → always insert
    if (!latestHistory) {
      return { insert: true, isPeriodicSnapshot: false };
    }

    // Compare tracked price fields (stock_count is NOT a history field)
    const priceChanged = latestHistory.price !== newPrice;
    const originalChanged = latestHistory.original_price !== newOriginalPrice;
    const shippingChanged = latestHistory.shipping_fee !== newShippingFee;
    const stockStatusChanged = latestHistory.in_stock !== newInStock;

    if (priceChanged || originalChanged || shippingChanged || stockStatusChanged) {
      // Genuine change → always insert
      return { insert: true, isPeriodicSnapshot: false };
    }

    // All tracked fields are identical — check time window
    const lastTime = new Date(latestHistory.scraped_at).getTime();
    const now = Date.now();
    const intervalMs = scraperConfig.historySnapshotIntervalHours * 60 * 60 * 1000;

    if (isNaN(lastTime)) {
      // Malformed timestamp — insert to be safe
      return { insert: true, isPeriodicSnapshot: false };
    }

    if (now - lastTime >= intervalMs) {
      // Outside window → periodic snapshot
      return { insert: true, isPeriodicSnapshot: true };
    }

    // Inside window → deduplicate (skip)
    return { insert: false, isPeriodicSnapshot: false };
  }
}
