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

export class MegaPkScraper extends BaseScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super('mega-pk');
  }

  async scrape(): Promise<ScrapedProductSchemaType[]> {
    const products: ScrapedProductSchemaType[] = [];

    try {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.createContext(this.browser);
      const page = await this.context.newPage();
      page.setDefaultTimeout(scraperConfig.selectorTimeoutMs);
      page.setDefaultNavigationTimeout(scraperConfig.navigationTimeoutMs);

      const categoryDefs = STORE_CATEGORY_MAP['mega-pk'] || [
        { url: 'https://www.mega.pk/mobiles/', categorySlug: 'mobiles', categoryName: 'Mobile Phones' },
      ];

      for (const catDef of categoryDefs) {
        if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) {
          break;
        }

        try {
          logger.info({ store: this.storeSlug, url: catDef.url }, 'Navigating to Mega.pk category');

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
          $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('_products/') || href.includes('_products_') || href.includes('-price-pakistan.html'))) {
              const fullUrl = href.startsWith('http')
                ? href
                : `https://www.mega.pk/${href.replace(/^\//, '')}`;
              if (!productLinks.includes(fullUrl)) {
                productLinks.push(fullUrl);
              }
            }
          });

          logger.info({ store: this.storeSlug, category: catDef.categorySlug, found: productLinks.length }, 'Discovered Mega.pk product links');

          const maxPerCategory = scraperConfig.maxProducts
            ? Math.min(scraperConfig.maxProducts - products.length, productLinks.length)
            : Math.min(25, productLinks.length);

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
              logger.error({ store: this.storeSlug, link, error: error.message }, 'Failed to scrape Mega.pk product');
            }
            await delay(scraperConfig.delayMs);
          }
        } catch (catError: any) {
          if (catError instanceof StoreAccessBlockedError) throw catError;
          logger.error({ store: this.storeSlug, category: catDef.url, error: catError.message }, 'Failed to scrape Mega.pk category');
        }
      }
    } catch (error: any) {
      logger.error({ store: this.storeSlug, error: error.message }, 'Mega.pk scraper encountered fatal error');
      throw error;
    } finally {
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    }

    return products;
  }

  /**
   * Extracts a standardized ScrapedProduct from Mega.pk HTML content.
   */
  public extractFromHtml(html: string, url: string): any | null {
    const $ = cheerio.load(html);

    // Title
    let nameStr = normalizeWhitespace(
      $('h1').first().text() ||
      $('#header_product_title').first().text() ||
      $('meta[property="og:title"]').attr('content') ||
      ''
    );

    if (!nameStr) return null;

    // Strip "Price in Pakistan" boilerplate if present
    if (nameStr.includes('Price in Pakistan')) {
      nameStr = nameStr.split('Price in Pakistan')[0].trim();
    }
    if (!nameStr) return null;

    // Price — ordered, product-scoped selectors (no broad .price or span:contains("PKR") fallback)
    const priceSelectors = [
      () => $('[itemprop="price"]').attr('content'),
      () => $('meta[property="og:price:amount"]').attr('content'),
      () => $('span#price').first().text(),
      () => $('.comp_ipro_price').first().text(),
      () => $('.desc-price').first().text(),
      () => $('#price .price').first().text(),
      () => $('.product_price .price, .product-price .price').first().text(),
      () => $('.price-box .price').first().text(),
      () => $('#product_price').first().text(),
      () => $('h3.price, h4.price').first().text(),
    ];

    let currentPriceStr = '';
    for (const selector of priceSelectors) {
      const val = selector();
      if (val && val.trim()) {
        currentPriceStr = val;
        break;
      }
    }

    const price = parsePrice(currentPriceStr);
    if (!price) return null;

    // Old Price
    const oldPriceStr = $('.old_price, .strike').first().text();
    const originalPrice = parsePrice(oldPriceStr);

    // Image
    const imageUrl =
      normalizeImageUrl($('meta[property="og:image"]').attr('content')) ||
      normalizeImageUrl($('#main_image').attr('src')) ||
      normalizeImageUrl($('.product_image img').attr('src')) ||
      null;

    // Stock
    const pageText = $('body').text().toLowerCase();
    const inStock = !pageText.includes('currently not available') && !pageText.includes('out of stock');

    // Identifier: extract numeric ID from URL pattern `_products/26804/`
    const idMatch = url.match(/_products\/(\d+)\//);
    let sourceIdentifier = idMatch ? idMatch[1] : null;
    let sourceIdentifierType: 'product_id' | 'url_slug' = 'product_id';

    if (!sourceIdentifier) {
      sourceIdentifier = url.split('/').pop()?.replace('.html', '') || null;
      sourceIdentifierType = 'url_slug';
    }
    if (!sourceIdentifier) return null;

    // Specs
    const ramGb = extractRamFromTitle(nameStr);
    const storageGb = extractStorageFromTitle(nameStr);

    // Brand detection
    let brand: string | null = null;
    const lowerName = nameStr.toLowerCase();
    const brands = ['apple', 'samsung', 'infinix', 'xiaomi', 'redmi', 'oppo', 'vivo', 'realme', 'lenovo', 'hp', 'dell'];
    for (const b of brands) {
      if (lowerName.includes(b)) {
        brand = b === 'hp' ? 'HP' : b.charAt(0).toUpperCase() + b.slice(1);
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
      modelNumber: null,
      sku: null,
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
