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

export class IShoppingScraper extends BaseScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super('ishopping');
  }

  async scrape(): Promise<ScrapedProductSchemaType[]> {
    const products: ScrapedProductSchemaType[] = [];

    try {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.createContext(this.browser);
      const page = await this.context.newPage();
      page.setDefaultTimeout(scraperConfig.selectorTimeoutMs);
      page.setDefaultNavigationTimeout(scraperConfig.navigationTimeoutMs);

      const categoryDefs = STORE_CATEGORY_MAP['ishopping'] || [
        { url: 'https://www.ishopping.pk/electronics/mobile-phones-tablets.html', categorySlug: 'mobiles', categoryName: 'Mobile Phones' },
      ];

      for (const catDef of categoryDefs) {
        if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) break;

        try {
          logger.info({ store: this.storeSlug, url: catDef.url }, 'Navigating to iShopping category');

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
          $('a.product-item-link, .product-name a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('http') && !productLinks.includes(href)) {
              productLinks.push(href);
            }
          });

          for (const link of productLinks) {
            if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) break;

            try {
              await page.goto(link, { waitUntil: 'domcontentloaded', timeout: scraperConfig.navigationTimeoutMs });
              await this.checkAntiBotBlock(page, link);
              const pdpHtml = await page.content();
              const prod = this.extractProductFromHtml(pdpHtml, link, catDef.categorySlug);
              if (prod) products.push(prod);
            } catch (err: any) {
              if (err instanceof StoreAccessBlockedError) throw err;
              logger.warn({ store: this.storeSlug, url: link, err: err.message }, 'Failed to scrape iShopping product');
            }
          }
        } catch (err: any) {
          if (err instanceof StoreAccessBlockedError) throw err;
          logger.error({ store: this.storeSlug, url: catDef.url, err: err.message }, 'Failed to scrape iShopping category');
        }
      }
    } finally {
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    }

    return products;
  }

  /**
   * Pure extraction function from iShopping HTML / Schema.org JSON-LD.
   */
  public extractProductFromHtml(html: string, url: string, categorySlug?: string): ScrapedProductSchemaType | null {
    const $ = cheerio.load(html);

    // Schema.org LD-JSON
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

    const rawTitle = jsonLd?.name || $('h1.product-name, h1.page-title, h1').first().text();
    const name = normalizeWhitespace(rawTitle);
    if (!name) return null;

    // Price
    let rawPrice = '';
    if (jsonLd?.offers) {
      const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
      if (offer?.price) rawPrice = String(offer.price);
    }
    if (!rawPrice) {
      rawPrice = $('.price-box .special-price .price, .price-box .regular-price .price, span.price').first().text().trim();
    }
    const price = parsePrice(rawPrice);
    if (!price || price <= 0) return null;

    // Original price
    let originalPrice: number | null = null;
    const oldPriceText = $('.price-box .old-price .price').first().text().trim();
    if (oldPriceText) {
      const parsed = parsePrice(oldPriceText);
      if (parsed && parsed > price) originalPrice = parsed;
    }

    // SKU
    const sku = jsonLd?.sku || $('.sku .value, [itemprop="sku"]').first().text().trim() || null;
    const urlSlug = url.split('/').filter(Boolean).pop()?.replace('.html', '') || null;
    const sourceIdentifier = sku || urlSlug;
    const sourceIdentifierType: 'sku' | 'url_slug' = sku ? 'sku' : 'url_slug';
    if (!sourceIdentifier) return null;

    // Image
    const rawImg =
      jsonLd?.image ||
      $('meta[property="og:image"]').attr('content') ||
      $('.product-image-gallery img, .main-image img').first().attr('src');
    const imageUrl = normalizeImageUrl(Array.isArray(rawImg) ? rawImg[0] : rawImg);

    // Stock
    let inStock = true;
    if (jsonLd?.offers) {
      const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
      if (offer?.availability) inStock = String(offer.availability).toLowerCase().includes('instock');
    } else {
      const outOfStock = $('.out-of-stock, .availability.out-of-stock');
      if (outOfStock.length > 0) inStock = false;
    }

    const brand = jsonLd?.brand?.name || $('.product-brand, .brand a').first().text().trim() || null;
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
