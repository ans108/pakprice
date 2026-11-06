import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as cheerio from 'cheerio';
import { BaseScraper, logger } from '../base/BaseScraper';
import { ScrapedProductSchemaType } from '../../types/scraperTypes';
import { scraperConfig } from '../../config/scraperConfig';
import { STORE_CATEGORY_MAP } from '../../config/categoryMap';
import {
  parsePrice,
  delay,
  parseDiscountPercent,
  normalizeWhitespace,
  normalizeImageUrl,
  withRetry,
  StoreAccessBlockedError,
} from '../../utils/scraperUtils';
import { extractRamFromTitle, extractStorageFromTitle } from '@pakprice/shared';

export class PaklapScraper extends BaseScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super('paklap');
  }

  async scrape(): Promise<ScrapedProductSchemaType[]> {
    const products: ScrapedProductSchemaType[] = [];

    try {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.createContext(this.browser);
      const page = await this.context.newPage();
      page.setDefaultTimeout(scraperConfig.selectorTimeoutMs);
      page.setDefaultNavigationTimeout(scraperConfig.navigationTimeoutMs);

      const categoryDefs = STORE_CATEGORY_MAP['paklap'] || [
        { url: 'https://www.paklap.pk/laptops-prices.html', categorySlug: 'laptops', categoryName: 'Laptops' },
      ];

      for (const catDef of categoryDefs) {
        if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) {
          break;
        }

        try {
          logger.info({ store: this.storeSlug, url: catDef.url }, 'Navigating to Paklap category');

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
          $('.product-item-link, a.product-item-photo').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://www.paklap.pk${href}`;
              if (!productLinks.includes(fullUrl)) {
                productLinks.push(fullUrl);
              }
            }
          });

          logger.info({ store: this.storeSlug, category: catDef.categorySlug, found: productLinks.length }, 'Discovered Paklap product links');

          const maxPerCategory = scraperConfig.maxProducts
            ? Math.min(scraperConfig.maxProducts - products.length, productLinks.length)
            : Math.min(30, productLinks.length);

          for (let i = 0; i < maxPerCategory; i++) {
            if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) {
              break;
            }

            const link = productLinks[i];
            try {
              const product = await withRetry(async () => {
                return await this.scrapeProductPage(page, link);
              });

              if (product) {
                const validProduct = this.validateProduct(product);
                if (validProduct) products.push(validProduct);
              }
            } catch (error: any) {
              if (error instanceof StoreAccessBlockedError) throw error;
              logger.error({ store: this.storeSlug, link, error: error.message }, 'Failed to scrape Paklap product');
            }
            await delay(scraperConfig.delayMs);
          }
        } catch (catError: any) {
          if (catError instanceof StoreAccessBlockedError) throw catError;
          logger.error({ store: this.storeSlug, category: catDef.url, error: catError.message }, 'Failed to scrape Paklap category');
        }
      }
    } catch (error: any) {
      logger.error({ store: this.storeSlug, error: error.message }, 'Paklap scraper encountered fatal error');
      throw error;
    } finally {
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    }

    return products;
  }

  /**
   * Scrapes an individual Paklap product page using Cheerio extraction.
   * Can be tested directly with offline HTML fixtures.
   */
  public extractFromHtml(html: string, url: string): any | null {
    const $ = cheerio.load(html);

    // Title
    let nameStr = normalizeWhitespace(
      $('.page-title span').first().text() ||
      $('h1.page-title').first().text() ||
      $('h1').first().text() ||
      $('meta[property="og:title"]').attr('content') ||
      ''
    );

    if (!nameStr) return null;

    // Price
    const currentPriceStr =
      $('[data-price-type="finalPrice"] .price').first().text() ||
      $('.special-price .price').first().text() ||
      $('.price-final_price .price').first().text() ||
      $('.price-box .price').first().text();

    const price = parsePrice(currentPriceStr);
    if (!price) return null;

    // Old / Original Price
    const oldPriceStr =
      $('[data-price-type="oldPrice"] .price').first().text() ||
      $('.old-price .price').first().text();
    const originalPrice = parsePrice(oldPriceStr);

    // Image priority: og:image -> main product image
    const imageUrl =
      normalizeImageUrl($('meta[property="og:image"]').attr('content')) ||
      normalizeImageUrl($('.gallery-placeholder img').attr('src')) ||
      normalizeImageUrl($('.product.media img').attr('src')) ||
      null;

    // Stock availability
    const stockText = $('.stock.available, .stock.unavailable').first().text().toLowerCase();
    const inStock = stockText.includes('in stock') || !stockText.includes('out of stock');

    // SKU / Identifier priority
    const sku = normalizeWhitespace($('.product.attribute.sku .value').first().text()) || null;
    const urlSlug = url.split('/').pop()?.replace('.html', '') || null;

    let sourceIdentifier = sku;
    let sourceIdentifierType: 'sku' | 'url_slug' = 'sku';
    if (!sourceIdentifier) {
      sourceIdentifier = urlSlug;
      sourceIdentifierType = 'url_slug';
    }
    if (!sourceIdentifier) return null;

    // Specification extraction
    const ramGb = extractRamFromTitle(nameStr);
    const storageGb = extractStorageFromTitle(nameStr);

    // Extract brand from title or breadcrumb if available
    let brand: string | null = null;
    const lowerName = nameStr.toLowerCase();
    const knownBrands = ['apple', 'hp', 'dell', 'lenovo', 'asus', 'acer', 'msi', 'infinix', 'samsung', 'xiaomi'];
    for (const b of knownBrands) {
      if (lowerName.includes(b)) {
        brand = b.charAt(0).toUpperCase() + b.slice(1);
        break;
      }
    }

    return {
      storeSlug: this.storeSlug,
      sourceUrl: url,
      sourceIdentifier,
      sourceIdentifierType,
      name: nameStr,
      brand,
      modelNumber: sku,
      sku,
      gtin: null,
      description: null,
      imageUrl,
      price,
      originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
      discountPercent: null,
      shippingFee: 0,
      inStock,
      stockCount: null,
      ramGb,
      storageGb,
      color: null,
    };
  }

  private async scrapeProductPage(page: Page, url: string): Promise<any | null> {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: scraperConfig.navigationTimeoutMs });
    await this.checkAntiBotBlock(page, url);

    if (page.url().includes('404')) return null;

    const html = await page.content();
    return this.extractFromHtml(html, url);
  }
}
