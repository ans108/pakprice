import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { BaseScraper, logger } from '../base/BaseScraper';
import { ScrapedProductSchemaType } from '../../types/scraperTypes';
import { scraperConfig } from '../../config/scraperConfig';
import { STORE_CATEGORY_MAP } from '../../config/categoryMap';
import {
  parsePrice,
  delay,
  normalizeWhitespace,
  normalizeImageUrl,
  withRetry,
  StoreAccessBlockedError,
} from '../../utils/scraperUtils';
import { extractRamFromTitle, extractStorageFromTitle } from '@pakprice/shared';

export class NaheedScraper extends BaseScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super('naheed');
  }

  async scrape(): Promise<ScrapedProductSchemaType[]> {
    const products: ScrapedProductSchemaType[] = [];

    const categoryDefs = STORE_CATEGORY_MAP['naheed'] || [
      { url: 'https://www.naheed.pk/groceries-pets', categorySlug: 'groceries', categoryName: 'Groceries' },
      { url: 'https://www.naheed.pk/electronics', categorySlug: 'home-appliances', categoryName: 'Electronics' },
    ];

    for (const catDef of categoryDefs) {
      if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) break;

      try {
        logger.info({ store: this.storeSlug, url: catDef.url }, 'Navigating to Naheed category');

        // Fast HTTP fetch using Cheerio
        const res = await axios.get(catDef.url, {
          headers: {
            'User-Agent': scraperConfig.userAgent,
            Accept: 'text/html,application/xhtml+xml',
          },
          timeout: scraperConfig.navigationTimeoutMs,
        });

        const $ = cheerio.load(res.data);
        const productLinks: string[] = [];

        $('.product-item-link, a.product-item-photo').each((_, el) => {
          const href = $(el).attr('href');
          if (href && href.startsWith('http') && !productLinks.includes(href)) {
            productLinks.push(href);
          }
        });

        logger.info({ store: this.storeSlug, category: catDef.categorySlug, count: productLinks.length }, 'Discovered Naheed product links');

        for (const link of productLinks) {
          if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) break;

          try {
            const pdpRes = await axios.get(link, {
              headers: {
                'User-Agent': scraperConfig.userAgent,
                Accept: 'text/html,application/xhtml+xml',
              },
              timeout: scraperConfig.navigationTimeoutMs,
            });

            const prod = this.extractProductFromHtml(pdpRes.data, link, catDef.categorySlug);
            if (prod) {
              products.push(prod);
              logger.info({ store: this.storeSlug, name: prod.name, price: prod.price }, 'Extracted Naheed product');
            }
          } catch (err: any) {
            logger.warn({ store: this.storeSlug, url: link, err: err.message }, 'Failed to fetch Naheed product PDP');
          }

          await delay(scraperConfig.delayMs);
        }
      } catch (err: any) {
        logger.error({ store: this.storeSlug, url: catDef.url, err: err.message }, 'Failed to scrape Naheed category');
      }
    }

    return products;
  }

  /**
   * Pure extraction function from Naheed Magento 2 HTML.
   */
  public extractProductFromHtml(html: string, url: string, categorySlug?: string): ScrapedProductSchemaType | null {
    const $ = cheerio.load(html);

    // 1. Check Schema.org JSON-LD
    let jsonLdProduct: any = null;
    $('script[type="application/ld+json"]').each((_, s) => {
      try {
        const parsed = JSON.parse($(s).html() || '{}');
        if (parsed['@type'] === 'Product') {
          jsonLdProduct = parsed;
        } else if (Array.isArray(parsed)) {
          const found = parsed.find((p: any) => p['@type'] === 'Product');
          if (found) jsonLdProduct = found;
        }
      } catch {}
    });

    const rawTitle = jsonLdProduct?.name || $('h1.page-title span, h1.page-title, h1').first().text();
    const name = normalizeWhitespace(rawTitle);
    if (!name) return null;

    // 2. Price extraction
    let rawPrice = '';
    if (jsonLdProduct?.offers) {
      const offer = Array.isArray(jsonLdProduct.offers) ? jsonLdProduct.offers[0] : jsonLdProduct.offers;
      if (offer?.price) rawPrice = String(offer.price);
    }
    if (!rawPrice) {
      rawPrice = $('[data-price-type="finalPrice"] .price, .price-wrapper .price, span.price').first().text().trim();
    }
    const price = parsePrice(rawPrice);
    if (!price || price <= 0) return null;

    // 3. Original price
    let originalPrice: number | null = null;
    const oldPriceText = $('[data-price-type="oldPrice"] .price, .old-price .price').first().text().trim();
    if (oldPriceText) {
      const parsed = parsePrice(oldPriceText);
      if (parsed && parsed > price) originalPrice = parsed;
    }

    // 4. SKU & Identifier
    const sku = jsonLdProduct?.sku || $('.product.attribute.sku .value, [itemprop="sku"]').first().text().trim() || null;
    const urlSlug = url.split('/').filter(Boolean).pop()?.replace('.html', '') || null;
    const sourceIdentifier = sku || urlSlug;
    const sourceIdentifierType: 'sku' | 'url_slug' = sku ? 'sku' : 'url_slug';
    if (!sourceIdentifier) return null;

    // 5. Image
    const rawImg =
      jsonLdProduct?.image ||
      $('meta[property="og:image"]').attr('content') ||
      $('.gallery-placeholder img, .fotorama__img, .product.media img').first().attr('src');
    const imageUrl = normalizeImageUrl(Array.isArray(rawImg) ? rawImg[0] : rawImg);

    // 6. Stock status
    let inStock = true;
    if (jsonLdProduct?.offers) {
      const offer = Array.isArray(jsonLdProduct.offers) ? jsonLdProduct.offers[0] : jsonLdProduct.offers;
      if (offer?.availability) {
        inStock = String(offer.availability).toLowerCase().includes('instock');
      }
    } else {
      const unavailable = $('.stock.unavailable, .out-of-stock');
      if (unavailable.length > 0) inStock = false;
    }

    const brand = jsonLdProduct?.brand?.name || $('.product.attribute.manufacturer .value, .brand a').first().text().trim() || null;
    const ramGb = extractRamFromTitle(name);
    const storageGb = extractStorageFromTitle(name);

    const product: ScrapedProductSchemaType = {
      storeSlug: this.storeSlug,
      sourceUrl: url,
      sourceIdentifier: String(sourceIdentifier),
      sourceIdentifierType,
      name,
      brand: brand ? normalizeWhitespace(brand) : null,
      modelNumber: null,
      sku,
      gtin: null,
      description: null,
      imageUrl,
      price,
      originalPrice,
      discountPercent: originalPrice && originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : null,
      shippingFee: 0,
      inStock,
      stockCount: null,
      ramGb,
      storageGb,
      color: null,
    };

    return this.validateProduct(product);
  }
}
