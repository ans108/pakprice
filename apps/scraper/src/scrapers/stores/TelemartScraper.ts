import * as cheerio from 'cheerio';
import { BaseScraper, logger } from '../base/BaseScraper';
import { ScrapedProductSchemaType } from '../../types/scraperTypes';
import { scraperConfig } from '../../config/scraperConfig';
import { STORE_CATEGORY_MAP } from '../../config/categoryMap';
import {
  parsePrice,
  delay,
  normalizeWhitespace,
  normalizeImageUrl,
} from '../../utils/scraperUtils';
import { extractRamFromTitle, extractStorageFromTitle } from '@pakprice/shared';

/** Safety bounds for Telemart collection traversal */
const MAX_PAGES_PER_COLLECTION = 20;
const MAX_TOTAL_PRODUCTS = 2000;
const LIMIT_PER_PAGE = 250;

export class TelemartScraper extends BaseScraper {
  constructor() {
    super('telemart');
  }

  /**
   * Scrapes Telemart products via verified Shopify collection endpoints.
   * Iterates over collections defined in STORE_CATEGORY_MAP['telemart'],
   * with bounded pagination, cross-collection deduplication, and safety limits.
   */
  async scrape(): Promise<ScrapedProductSchemaType[]> {
    const products: ScrapedProductSchemaType[] = [];
    const baseUrl = 'https://www.telemart.pk';
    const seenIds = new Set<string>();
    const maxProducts = scraperConfig.maxProducts || MAX_TOTAL_PRODUCTS;

    const collections = STORE_CATEGORY_MAP['telemart'] || [];
    if (collections.length === 0) {
      logger.warn({ store: this.storeSlug }, 'No Telemart collections configured in STORE_CATEGORY_MAP');
      return products;
    }

    try {
      logger.info(
        { store: this.storeSlug, collections: collections.length },
        'Beginning Telemart catalog discovery via Shopify collection endpoints',
      );

      for (const collectionDef of collections) {
        if (products.length >= maxProducts) break;

        // Derive the Shopify collection handle from the URL
        // e.g. "https://www.telemart.pk/collections/smart-phones" → "smart-phones"
        const collectionHandle = collectionDef.url.split('/collections/')[1] || collectionDef.url.split('/').pop();
        if (!collectionHandle) {
          logger.warn({ store: this.storeSlug, url: collectionDef.url }, 'Could not parse collection handle');
          continue;
        }

        logger.info(
          { store: this.storeSlug, collection: collectionHandle, category: collectionDef.categorySlug },
          'Starting collection traversal',
        );

        let page = 1;
        let collectionProducts = 0;

        while (page <= MAX_PAGES_PER_COLLECTION && products.length < maxProducts) {
          const apiUrl = `${baseUrl}/collections/${collectionHandle}/products.json?limit=${LIMIT_PER_PAGE}&page=${page}`;
          logger.info({ store: this.storeSlug, collection: collectionHandle, page, url: apiUrl }, 'Fetching collection page');

          const res = await fetch(apiUrl, {
            headers: {
              'User-Agent': scraperConfig.userAgent,
              Accept: 'application/json',
            },
          });

          if (!res.ok) {
            logger.warn(
              { store: this.storeSlug, collection: collectionHandle, status: res.status },
              'Telemart collection API returned non-OK status',
            );
            break;
          }

          const data = await res.json();
          const rawProducts: any[] = data.products || [];

          // Termination: empty page
          if (rawProducts.length === 0) {
            logger.info(
              { store: this.storeSlug, collection: collectionHandle, page },
              'Empty page — collection exhausted',
            );
            break;
          }

          let newInPage = 0;
          for (const raw of rawProducts) {
            if (products.length >= maxProducts) break;

            const extracted = this.extractFromShopifyProduct(raw, baseUrl);
            if (!extracted) continue;

            // Cross-collection deduplication by sourceIdentifier
            const dedupKey = `${extracted.sourceIdentifierType}:${extracted.sourceIdentifier}`;
            if (seenIds.has(dedupKey)) continue;
            seenIds.add(dedupKey);

            // Attach collection's category slug
            extracted.categorySlug = collectionDef.categorySlug;

            const valid = this.validateProduct(extracted);
            if (valid) {
              products.push(valid);
              newInPage++;
              collectionProducts++;
            }
          }

          // Termination: no new unique products on this page → stop
          if (newInPage === 0) {
            logger.info(
              { store: this.storeSlug, collection: collectionHandle, page },
              'No new unique products on page — stopping collection',
            );
            break;
          }

          page++;
          await delay(scraperConfig.delayMs);
        }

        logger.info(
          { store: this.storeSlug, collection: collectionHandle, collectionProducts },
          'Collection traversal completed',
        );
      }
    } catch (error: any) {
      logger.error({ store: this.storeSlug, error: error.message }, 'Telemart scrape encountered an error');
      throw error;
    }

    logger.info({ store: this.storeSlug, total: products.length, uniqueIds: seenIds.size }, 'Telemart scrape completed');
    return products;
  }

  /**
   * Extracts a standardized ScrapedProduct from a raw Shopify product object.
   */
  public extractFromShopifyProduct(raw: any, baseUrl: string = 'https://www.telemart.pk'): any | null {
    if (!raw || !raw.title) return null;

    const name = normalizeWhitespace(raw.title);
    if (!name) return null;
    const handle = raw.handle || '';
    const sourceUrl = `${baseUrl}/products/${handle}`;

    const variants = raw.variants || [];
    const firstVariant = variants[0] || {};

    const price = typeof firstVariant.price === 'string' ? parseFloat(firstVariant.price) : firstVariant.price;
    if (!price || !Number.isFinite(price) || price <= 0) {
      return null;
    }

    const comparePrice =
      typeof firstVariant.compare_at_price === 'string'
        ? parseFloat(firstVariant.compare_at_price)
        : firstVariant.compare_at_price;
    const originalPrice =
      comparePrice && Number.isFinite(comparePrice) && comparePrice > price ? comparePrice : null;

    // Image
    let imageUrl: string | null = null;
    if (raw.images && raw.images.length > 0 && raw.images[0].src) {
      imageUrl = normalizeImageUrl(raw.images[0].src);
    } else if (raw.image && raw.image.src) {
      imageUrl = normalizeImageUrl(raw.image.src);
    }

    // Availability
    const inStock = firstVariant.available !== false;

    // Identifier priority: stable store product ID -> variant SKU -> handle
    let sourceIdentifier = String(raw.id || firstVariant.id || '');
    let sourceIdentifierType: 'product_id' | 'sku' | 'url_slug' = 'product_id';

    if (!sourceIdentifier) {
      if (firstVariant.sku) {
        sourceIdentifier = firstVariant.sku;
        sourceIdentifierType = 'sku';
      } else if (handle) {
        sourceIdentifier = handle;
        sourceIdentifierType = 'url_slug';
      }
    }

    if (!sourceIdentifier) return null;

    // Brand
    const vendor = raw.vendor ? normalizeWhitespace(raw.vendor) : null;
    const ramGb = extractRamFromTitle(name);
    const storageGb = extractStorageFromTitle(name);

    return {
      storeSlug: this.storeSlug,
      sourceUrl,
      sourceIdentifier,
      sourceIdentifierType,
      name,
      brand: vendor,
      modelNumber: firstVariant.sku || null,
      sku: firstVariant.sku || null,
      gtin: firstVariant.barcode || null,
      description: raw.body_html ? normalizeWhitespace(raw.body_html.replace(/<[^>]*>?/gm, '')) : null,
      imageUrl,
      price,
      originalPrice,
      discountPercent: null,
      shippingFee: 0,
      inStock,
      stockCount: null,
      ramGb,
      storageGb,
      color: null,
    };
  }

  /**
   * Extracts product from Telemart HTML page (for fixture testing).
   */
  public extractFromHtml(html: string, url: string): any | null {
    const $ = cheerio.load(html);

    let name = normalizeWhitespace(
      $('meta[property="og:title"]').attr('content') ||
      $('.page-title span').first().text() ||
      $('h1').first().text() ||
      $('title').text().split('– TeleX')[0].trim() ||
      ''
    );

    if (!name) return null;

    const priceText =
      $('meta[property="og:price:amount"]').attr('content') ||
      $('[data-price-type="finalPrice"] .price').first().text() ||
      $('.price-item--regular').first().text() ||
      $('.price').first().text();
    const price = parsePrice(priceText);
    if (!price) return null;

    const oldPriceText = $('.price-item--sale').first().text();
    const originalPrice = parsePrice(oldPriceText);

    const imageUrl =
      normalizeImageUrl($('meta[property="og:image:secure_url"]').attr('content')) ||
      normalizeImageUrl($('meta[property="og:image"]').attr('content')) ||
      normalizeImageUrl($('.product__media img').attr('src')) ||
      null;

    const sku = normalizeWhitespace($('.product.attribute.sku .value, .sku').first().text()) || null;
    const urlSlug = url.split('/').pop()?.split('?')[0] || null;

    return {
      storeSlug: this.storeSlug,
      sourceUrl: url,
      sourceIdentifier: sku || urlSlug || 'unknown-telemart',
      sourceIdentifierType: sku ? 'sku' : 'url_slug',
      name,
      brand: null,
      modelNumber: sku,
      sku,
      gtin: null,
      description: null,
      imageUrl,
      price,
      originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
      discountPercent: null,
      shippingFee: 0,
      inStock: true,
      stockCount: null,
      ramGb: extractRamFromTitle(name),
      storageGb: extractStorageFromTitle(name),
      color: null,
    };
  }
}
