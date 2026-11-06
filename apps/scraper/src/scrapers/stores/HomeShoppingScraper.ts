import { chromium, Browser, BrowserContext, Page } from 'playwright';
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
  withRetry,
  StoreAccessBlockedError,
} from '../../utils/scraperUtils';
import { extractRamFromTitle, extractStorageFromTitle } from '@pakprice/shared';

export class HomeShoppingScraper extends BaseScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super('homeshopping');
  }

  async scrape(): Promise<ScrapedProductSchemaType[]> {
    const products: ScrapedProductSchemaType[] = [];

    try {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.createContext(this.browser);
      const page = await this.context.newPage();
      page.setDefaultTimeout(scraperConfig.selectorTimeoutMs);
      page.setDefaultNavigationTimeout(scraperConfig.navigationTimeoutMs);

      const categoryDefs = STORE_CATEGORY_MAP['homeshopping'] || [
        { url: 'https://homeshopping.pk/categories/Mobile-Phones-Price-Pakistan/', categorySlug: 'mobiles', categoryName: 'Mobile Phones' },
        { url: 'https://homeshopping.pk/categories/Laptops-Price-Pakistan/', categorySlug: 'laptops', categoryName: 'Laptops' },
      ];

      for (const catDef of categoryDefs) {
        if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) break;

        try {
          logger.info({ store: this.storeSlug, url: catDef.url }, 'Navigating to HomeShopping category');

          await withRetry(async () => {
            await page.goto(catDef.url, {
              waitUntil: 'domcontentloaded',
              timeout: scraperConfig.navigationTimeoutMs,
            });
          });

          await this.checkAntiBotBlock(page, catDef.url);
          await delay(scraperConfig.delayMs);

          const html = await page.content();
          const $ = cheerio.load(html);

          const productLinks: string[] = [];
          $('a.productBox, .product a, .vtex-product-summary-2-x-clearLink, a[href*="/products/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !productLinks.includes(href)) {
              const fullUrl = href.startsWith('http') ? href : `https://homeshopping.pk${href.startsWith('/') ? '' : '/'}${href}`;
              if (!productLinks.includes(fullUrl)) productLinks.push(fullUrl);
            }
          });

          logger.info({ store: this.storeSlug, category: catDef.categorySlug, count: productLinks.length }, 'Discovered HomeShopping product links');

          for (const link of productLinks) {
            if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) break;

            try {
              await withRetry(async () => {
                await page.goto(link, { waitUntil: 'domcontentloaded', timeout: scraperConfig.navigationTimeoutMs });
              });
              await this.checkAntiBotBlock(page, link);
              const pdpHtml = await page.content();
              const prod = this.extractProductFromHtml(pdpHtml, link, catDef.categorySlug);
              if (prod) {
                products.push(prod);
                logger.info({ store: this.storeSlug, name: prod.name, price: prod.price }, 'Extracted HomeShopping product');
              }
            } catch (err: any) {
              if (err instanceof StoreAccessBlockedError) throw err;
              logger.warn({ store: this.storeSlug, url: link, err: err.message }, 'Failed to scrape HomeShopping product page');
            }
            await delay(scraperConfig.delayMs);
          }
        } catch (err: any) {
          if (err instanceof StoreAccessBlockedError) throw err;
          logger.error({ store: this.storeSlug, url: catDef.url, err: err.message }, 'Failed to scrape HomeShopping category');
        }
      }
    } finally {
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    }

    return products;
  }

  /**
   * Pure extraction function from HomeShopping HTML / Schema.org JSON-LD.
   */
  public extractProductFromHtml(html: string, url: string, categorySlug?: string): ScrapedProductSchemaType | null {
    const $ = cheerio.load(html);

    // 1. JSON-LD check
    let jsonLd: any = null;
    $('script[type="application/ld+json"]').each((_, s) => {
      try {
        const parsed = JSON.parse($(s).html() || '{}');
        if (parsed['@type'] === 'Product') jsonLd = parsed;
        else if (Array.isArray(parsed)) {
          const p = parsed.find((x: any) => x['@type'] === 'Product');
          if (p) jsonLd = p;
        }
      } catch {}
    });

    const rawTitle = jsonLd?.name || $('h1.product-title, h1.title, h1, .vtex-store-components-3-x-productNameContainer').first().text();
    const name = normalizeWhitespace(rawTitle);
    if (!name) return null;

    // 2. Price
    let rawPrice = '';
    if (jsonLd?.offers) {
      const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
      if (offer?.price) rawPrice = String(offer.price);
    }
    if (!rawPrice) {
      rawPrice = $(
        '.price, .product-price, .vtex-product-price-1-x-sellingPrice, .actual-price'
      ).first().text().trim();
    }
    const price = parsePrice(rawPrice);
    if (!price || price <= 0) return null;

    // 3. Original price
    let originalPrice: number | null = null;
    const oldPriceText = $(
      '.old-price, .strike-price, .vtex-product-price-1-x-listPrice, .line-through'
    ).first().text().trim();
    if (oldPriceText) {
      const parsed = parsePrice(oldPriceText);
      if (parsed && parsed > price) originalPrice = parsed;
    }

    // 4. Source identifier
    const sku = jsonLd?.sku || $('.sku, .vtex-product-identifier, [itemprop="sku"]').first().text().trim() || null;
    const urlSlug = url.split('/').filter(Boolean).pop()?.replace('.html', '') || null;
    const sourceIdentifier = sku || urlSlug;
    const sourceIdentifierType: 'sku' | 'url_slug' = sku ? 'sku' : 'url_slug';
    if (!sourceIdentifier) return null;

    // 5. Image
    const rawImg =
      jsonLd?.image ||
      $('meta[property="og:image"]').attr('content') ||
      $('.product-image img, .vtex-store-components-3-x-productImageTag').first().attr('src');
    const imageUrl = normalizeImageUrl(Array.isArray(rawImg) ? rawImg[0] : rawImg);

    // 6. Stock
    let inStock = true;
    if (jsonLd?.offers) {
      const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
      if (offer?.availability) inStock = String(offer.availability).toLowerCase().includes('instock');
    } else {
      const outOfStockEl = $('.out-of-stock, .unavailable, .sold-out');
      if (outOfStockEl.length > 0) inStock = false;
    }

    const brand = jsonLd?.brand?.name || $('.brand, .vtex-store-components-3-x-productBrandName').first().text().trim() || null;
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
