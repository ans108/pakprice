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
  StoreAccessBlockedError 
} from '../../utils/scraperUtils';
import { extractRamFromTitle, extractStorageFromTitle } from '@pakprice/shared';

export class DarazScraper extends BaseScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super('daraz');
  }

  async scrape(): Promise<ScrapedProductSchemaType[]> {
    const products: ScrapedProductSchemaType[] = [];
    
    try {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.createContext(this.browser);
      const page = await this.context.newPage();
      page.setDefaultTimeout(scraperConfig.selectorTimeoutMs);
      page.setDefaultNavigationTimeout(scraperConfig.navigationTimeoutMs);

      const categoryDefs = STORE_CATEGORY_MAP['daraz'] || [
        { url: 'https://www.daraz.pk/smartphones/', categorySlug: 'mobiles', categoryName: 'Smartphones' },
      ];

      for (const catDef of categoryDefs) {
        if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) {
          break;
        }

        try {
          logger.info({ store: this.storeSlug, url: catDef.url }, 'Navigating to Daraz category');
          
          await withRetry(async () => {
            await page.goto(catDef.url, { 
              waitUntil: 'domcontentloaded', 
              timeout: scraperConfig.navigationTimeoutMs 
            });
          });

          await this.checkAntiBotBlock(page, catDef.url);
          await delay(scraperConfig.delayMs * 2);

          const html = await page.content();
          const $ = cheerio.load(html);

          const productLinks: string[] = [];
          $('.gridItem--Yd0sa a, a[href*="/products/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/products/')) {
              const fullUrl = href.startsWith('//') ? `https:${href}` : href.startsWith('http') ? href : `https://www.daraz.pk${href}`;
              const cleanUrl = fullUrl.split('?')[0];
              if (!productLinks.includes(cleanUrl)) {
                productLinks.push(cleanUrl);
              }
            }
          });

          logger.info({ store: this.storeSlug, category: catDef.categorySlug, found: productLinks.length }, 'Discovered Daraz product links');

          const maxToScrape = scraperConfig.maxProducts 
            ? Math.min(scraperConfig.maxProducts - products.length, productLinks.length) 
            : Math.min(25, productLinks.length);

          for (let i = 0; i < maxToScrape; i++) {
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
              if (error instanceof StoreAccessBlockedError) {
                throw error;
              }
              logger.error({ store: this.storeSlug, link, error: error.message }, 'Failed to scrape Daraz product');
            }
            await delay(scraperConfig.delayMs);
          }
        } catch (catError: any) {
          if (catError instanceof StoreAccessBlockedError) throw catError;
          logger.error({ store: this.storeSlug, category: catDef.url, error: catError.message }, 'Failed to scrape Daraz category');
        }
      }

    } catch (error: any) {
      logger.error({ store: this.storeSlug, error: error.message }, 'Daraz scraper encountered fatal error');
      throw error;
    } finally {
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    }

    return products;
  }

  /**
   * Extracts a standardized ScrapedProduct from Daraz HTML content.
   * Multi-tier extraction: DOM selectors → JSON-LD schema → __moduleData__ state.
   */
  public extractFromHtml(html: string, url: string): any | null {
    const $ = cheerio.load(html);

    // --- Tier 1: DOM Selectors ---
    let nameStr = normalizeWhitespace(
      $('.pdp-mod-product-badge-title').first().text() ||
      $('h1').first().text() ||
      $('meta[property="og:title"]').attr('content') ||
      ''
    );

    let price: number | null = null;
    let originalPrice: number | null = null;
    let imageUrl: string | null = null;
    let sku: string | null = null;

    const currentPriceStr =
      $('.pdp-price_type_normal').first().text() ||
      $('.pdp-price').first().text() ||
      $('[itemprop="price"]').attr('content') ||
      '';
    const originalPriceStr = $('.pdp-price_type_deleted').first().text();

    price = parsePrice(currentPriceStr);
    originalPrice = parsePrice(originalPriceStr);

    imageUrl =
      normalizeImageUrl($('meta[property="og:image"]').attr('content')) ||
      normalizeImageUrl($('.gallery-preview-panel__image').attr('src')) ||
      normalizeImageUrl($('.gallery-preview-panel__image').attr('data-src')) ||
      null;

    // --- Tier 2: JSON-LD Schema Fallback ---
    if (!nameStr || !price) {
      try {
        $('script[type="application/ld+json"]').each((_, el) => {
          try {
            const jsonText = $(el).html();
            if (!jsonText) return;
            const parsed = JSON.parse(jsonText);

            // Handle both single object and array of objects
            const items = Array.isArray(parsed) ? parsed : [parsed];
            for (const item of items) {
              if (item['@type'] === 'Product' || item['@type'] === 'IndividualProduct') {
                if (!nameStr && item.name) {
                  nameStr = normalizeWhitespace(item.name);
                }
                if (!sku && item.sku) {
                  sku = item.sku;
                }
                if (!imageUrl && item.image) {
                  const imgSrc = Array.isArray(item.image) ? item.image[0] : item.image;
                  if (typeof imgSrc === 'string') {
                    imageUrl = normalizeImageUrl(imgSrc);
                  }
                }
                // Offers pricing
                const offers = item.offers || (item.offer ? [item.offer] : []);
                const offerList = Array.isArray(offers) ? offers : [offers];
                for (const offer of offerList) {
                  if (!price && offer.price) {
                    price = typeof offer.price === 'number' ? offer.price : parsePrice(String(offer.price));
                  }
                  if (!price && offer.lowPrice) {
                    price = typeof offer.lowPrice === 'number' ? offer.lowPrice : parsePrice(String(offer.lowPrice));
                  }
                }
              }
            }
          } catch { /* malformed JSON-LD block, skip */ }
        });
      } catch { /* JSON-LD parsing failed, continue */ }
    }

    // --- Tier 3: __moduleData__ Embedded State Fallback ---
    if (!price) {
      try {
        const moduleDataMatch = html.match(/var\s+__moduleData__\s*=\s*(\{[\s\S]*?\});\s*(?:var|<\/script>)/);
        if (moduleDataMatch) {
          const moduleStr = moduleDataMatch[1];
          // Extract price from nested JSON structure
          const priceMatch = moduleStr.match(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/);
          if (priceMatch) {
            const extracted = parseFloat(priceMatch[1]);
            if (Number.isFinite(extracted) && extracted > 0) {
              price = extracted;
            }
          }
          // Extract originalPrice
          if (!originalPrice) {
            const origMatch = moduleStr.match(/"originalPrice"\s*:\s*"?(\d+(?:\.\d+)?)"?/);
            if (origMatch) {
              const extracted = parseFloat(origMatch[1]);
              if (Number.isFinite(extracted) && extracted > 0) {
                originalPrice = extracted;
              }
            }
          }
        }
      } catch { /* __moduleData__ parsing failed, continue */ }
    }

    // --- Tier 4: Embedded tracking pdt_price fallback ---
    if (!price) {
      const pdtPriceMatch = html.match(/"pdt_price"\s*:\s*"([^"]+)"/);
      if (pdtPriceMatch) {
        price = parsePrice(pdtPriceMatch[1]);
      }
    }

    // Final validation: must have name and price
    if (!nameStr) return null;
    if (!price) return null;

    let discountPercent: number | null = null;
    if (originalPrice && price < originalPrice) {
      discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
    }

    // Stock
    const outOfStock = $('.pdp-button_theme_gray').text().toLowerCase().includes('out of stock');

    // Identifiers
    const productIdMatch = url.match(/-i(\d+)/);
    const productId = productIdMatch ? productIdMatch[1] : url.split('/').pop()?.replace('.html', '');

    if (!productId) return null;

    // Spec parsing
    let ramGb = extractRamFromTitle(nameStr);
    let storageGb = extractStorageFromTitle(nameStr);

    $('.key-li').each((_, el) => {
      const text = $(el).text();
      if (ramGb === null && text.includes('RAM Memory')) {
        const match = text.match(/(\d+)\s*GB/i);
        if (match) ramGb = parseInt(match[1], 10);
      }
      if (storageGb === null && text.includes('Storage')) {
        const match = text.match(/(\d+)\s*GB/i);
        if (match) storageGb = parseInt(match[1], 10);
      }
    });

    return {
      storeSlug: this.storeSlug,
      sourceUrl: url.split('?')[0],
      sourceIdentifier: productId as string,
      sourceIdentifierType: 'product_id',
      name: nameStr,
      brand: null,
      modelNumber: null,
      sku: sku,
      gtin: null,
      description: null,
      imageUrl,
      price,
      originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
      discountPercent,
      shippingFee: 0,
      inStock: !outOfStock,
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

    await delay(scraperConfig.delayMs);
    const html = await page.content();
    return this.extractFromHtml(html, url);
  }
}
