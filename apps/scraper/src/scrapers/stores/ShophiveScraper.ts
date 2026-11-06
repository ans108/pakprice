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

export class ShophiveScraper extends BaseScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super('shophive');
  }

  async scrape(): Promise<ScrapedProductSchemaType[]> {
    const products: ScrapedProductSchemaType[] = [];

    try {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.createContext(this.browser);
      const page = await this.context.newPage();
      page.setDefaultTimeout(scraperConfig.selectorTimeoutMs);
      page.setDefaultNavigationTimeout(scraperConfig.navigationTimeoutMs);

      const categoryDefs = STORE_CATEGORY_MAP['shophive'] || [
        { url: 'https://www.shophive.com/mobile-phones', categorySlug: 'mobiles', categoryName: 'Mobile Phones' },
        { url: 'https://www.shophive.com/laptops', categorySlug: 'laptops', categoryName: 'Laptops' },
        { url: 'https://www.shophive.com/smart-watches', categorySlug: 'smart-watches', categoryName: 'Smart Watches' },
      ];

      for (const catDef of categoryDefs) {
        if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) {
          break;
        }

        try {
          logger.info({ store: this.storeSlug, url: catDef.url }, 'Navigating to Shophive category');

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
          $('a.product-item-link, a.product-item-photo, ol.products li a.product-item-link').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('http') && !productLinks.includes(href)) {
              // Ensure link is on shophive domain and not a non-product link
              if (
                href.includes('shophive.com') &&
                !href.includes('/checkout/') &&
                !href.includes('/customer/') &&
                !href.includes('/wishlist/') &&
                !href.includes('/contact')
              ) {
                productLinks.push(href);
              }
            }
          });

          logger.info(
            { store: this.storeSlug, category: catDef.categorySlug, count: productLinks.length },
            'Discovered Shophive product links'
          );

          for (const link of productLinks) {
            if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) {
              break;
            }

            try {
              const product = await this.scrapeProductPage(page, link, catDef.categorySlug);
              if (product) {
                products.push(product);
                logger.info(
                  { store: this.storeSlug, name: product.name, price: product.price },
                  'Extracted Shophive product'
                );
              }
            } catch (err: any) {
              if (err instanceof StoreAccessBlockedError) throw err;
              logger.warn({ store: this.storeSlug, url: link, err: err.message }, 'Failed to scrape Shophive product page');
            }

            await delay(scraperConfig.delayMs);
          }
        } catch (err: any) {
          if (err instanceof StoreAccessBlockedError) throw err;
          logger.error({ store: this.storeSlug, url: catDef.url, err: err.message }, 'Failed to scrape Shophive category');
        }
      }
    } finally {
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    }

    return products;
  }

  private async scrapeProductPage(page: Page, url: string, categorySlug: string): Promise<ScrapedProductSchemaType | null> {
    await withRetry(async () => {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: scraperConfig.navigationTimeoutMs,
      });
    });

    await this.checkAntiBotBlock(page, url);
    const html = await page.content();
    return this.extractProductFromHtml(html, url, categorySlug);
  }

  /**
   * Pure extraction function: parses product details from Shophive Magento 2 HTML.
   * Public for deterministic testing against fixtures without browser dependencies.
   */
  public extractProductFromHtml(html: string, url: string, categorySlug: string): ScrapedProductSchemaType | null {
    const $ = cheerio.load(html);

    // 1. Product title
    const rawTitle = $('h1.page-title span, h1.page-title, [itemprop="name"]').first().text();
    const name = normalizeWhitespace(rawTitle);
    if (!name) return null;

    // 2. Price extraction (Magento 2 finalPrice / special-price / regular-price)
    const priceSelectors = [
      '[data-price-type="finalPrice"] .price',
      '.special-price .price',
      '.regular-price .price',
      '.price-box .price-wrapper .price',
      'meta[property="product:price:amount"]',
      'span.price',
    ];

    let rawPrice = '';
    for (const sel of priceSelectors) {
      if (sel.startsWith('meta')) {
        rawPrice = $(sel).attr('content') || '';
      } else {
        rawPrice = $(sel).first().text().trim();
      }
      if (rawPrice) {
        const p = parsePrice(rawPrice);
        if (p !== null && p > 0) break;
      }
    }

    const price = parsePrice(rawPrice);
    if (!price || price <= 0) return null;

    // 3. Original price extraction (was / old-price)
    const oldPriceSelectors = [
      '[data-price-type="oldPrice"] .price',
      '.old-price .price',
      '.old-price .price-wrapper .price',
    ];

    let originalPrice: number | null = null;
    for (const sel of oldPriceSelectors) {
      const oldText = $(sel).first().text().trim();
      if (oldText) {
        const parsed = parsePrice(oldText);
        if (parsed !== null && parsed > price) {
          originalPrice = parsed;
          break;
        }
      }
    }

    // 4. Stable source identifier (SKU preferred, fallback to product_id or url_slug)
    const skuRaw = $('.product.attribute.sku .value, [itemprop="sku"]').first().text().trim();
    const productIdInput = $('input[name="product"]').val() as string | undefined;
    const jsonProductIdMatch = html.match(/"productId":\s*(\d+)/);
    const productId = productIdInput || (jsonProductIdMatch ? jsonProductIdMatch[1] : null);

    let sourceIdentifier: string | null = null;
    let sourceIdentifierType: 'sku' | 'product_id' | 'url_slug' = 'sku';

    if (skuRaw) {
      sourceIdentifier = skuRaw;
      sourceIdentifierType = 'sku';
    } else if (productId) {
      sourceIdentifier = String(productId);
      sourceIdentifierType = 'product_id';
    } else {
      const urlSlug = url.split('/').filter(Boolean).pop()?.replace('.html', '') || null;
      sourceIdentifier = urlSlug;
      sourceIdentifierType = 'url_slug';
    }

    if (!sourceIdentifier) return null;

    // 5. Image extraction (og:image or product gallery)
    const rawImage =
      $('meta[property="og:image"]').attr('content') ||
      $('.gallery-placeholder__image, .fotorama__img, .product.media img').first().attr('src') ||
      null;

    let rawImageClean = rawImage
      ? rawImage.startsWith('http')
        ? rawImage
        : `https://www.shophive.com${rawImage.startsWith('/') ? '' : '/'}${rawImage}`
      : null;
    const imageUrl = normalizeImageUrl(rawImageClean);

    // 6. Stock status
    const unavailableEl = $('.stock.unavailable, .out-of-stock');
    const availableEl = $('.stock.available');
    let inStock = true;
    if (unavailableEl.length > 0) {
      inStock = false;
    } else if (availableEl.length > 0) {
      inStock = availableEl.text().toLowerCase().includes('in stock');
    }

    // 7. Specifications (RAM, Storage, Brand)
    const ram = extractRamFromTitle(name);
    const storage = extractStorageFromTitle(name);

    // Brand derivation
    let brand: string | null =
      $('.product.attribute.brand .value, [itemprop="brand"]').first().text().trim() || null;
    if (!brand) {
      const brandMatch = name.match(/^(apple|samsung|xiaomi|hp|lenovo|dell|infinix|tecno|vivo|oppo|realme|huawei|sony|oneplus|google|asus|acer)\b/i);
      if (brandMatch) brand = brandMatch[1];
    }

    return {
      storeSlug: this.storeSlug,
      sourceUrl: url,
      sourceIdentifier,
      sourceIdentifierType,
      name,
      brand,
      modelNumber: null,
      sku: sourceIdentifierType === 'sku' ? sourceIdentifier : null,
      gtin: null,
      description: null,
      imageUrl,
      price,
      originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
      discountPercent: null,
      shippingFee: 0,
      inStock,
      stockCount: null,
      ramGb: ram,
      storageGb: storage,
      color: null,
    };
  }
}
