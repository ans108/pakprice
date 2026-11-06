import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as cheerio from 'cheerio';
import { BaseScraper, logger } from '../base/BaseScraper';
import { ScrapedProductSchemaType } from '../../types/scraperTypes';
import { scraperConfig } from '../../config/scraperConfig';
import { 
  parsePrice, 
  delay, 
  parseDiscountPercent, 
  normalizeWhitespace, 
  normalizeImageUrl,
  withRetry,
  StoreAccessBlockedError
} from '../../utils/scraperUtils';
import { extractRamFromTitle, extractStorageFromTitle } from '@pakprice/shared';

export class PriceOyeScraper extends BaseScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super('priceoye');
  }

  async scrape(): Promise<ScrapedProductSchemaType[]> {
    const products: ScrapedProductSchemaType[] = [];
    
    try {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.createContext(this.browser);
      const page = await this.context.newPage();
      page.setDefaultTimeout(scraperConfig.selectorTimeoutMs);
      page.setDefaultNavigationTimeout(scraperConfig.navigationTimeoutMs);

      // Scrape key product categories (live PriceOye category paths)
      const categories = [
        'https://priceoye.pk/mobiles',
        'https://priceoye.pk/mobiles/samsung',
        'https://priceoye.pk/mobiles/apple',
        'https://priceoye.pk/mobiles/xiaomi',
        'https://priceoye.pk/mobiles/infinix',
        'https://priceoye.pk/mobiles/tecno',
        'https://priceoye.pk/mobiles/vivo',
        'https://priceoye.pk/laptops',
        'https://priceoye.pk/tablets',
        'https://priceoye.pk/smart-watches',
        'https://priceoye.pk/wireless-earbuds',
        'https://priceoye.pk/power-banks',
      ];

      for (const categoryUrl of categories) {
        if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) {
          break;
        }
        try {
          logger.info({ store: this.storeSlug, url: categoryUrl }, 'Navigating to category');
          
          await withRetry(async () => {
            await page.goto(categoryUrl, { 
              waitUntil: 'domcontentloaded', 
              timeout: scraperConfig.navigationTimeoutMs 
            });
          });

          await this.checkAntiBotBlock(page, categoryUrl);
          await delay(scraperConfig.delayMs);

          const html = await page.content();
          const $ = cheerio.load(html);

          const productLinks: string[] = [];
          
          $('.productBox a, .product-list a, .product-card a').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://priceoye.pk${href}`;
              productLinks.push(fullUrl);
            }
          });

          const uniqueLinks = [...new Set(productLinks)];
          logger.info({ store: this.storeSlug, category: categoryUrl, found: uniqueLinks.length }, 'Discovered product links');

          const maxPerCategory = scraperConfig.maxProducts 
            ? Math.min(scraperConfig.maxProducts - products.length, uniqueLinks.length) 
            : Math.min(40, uniqueLinks.length);

          for (let i = 0; i < maxPerCategory; i++) {
            if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) {
              break;
            }
            const link = uniqueLinks[i];
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
              logger.error({ store: this.storeSlug, link, error: error.message }, 'Failed to scrape product page');
            }
            await delay(scraperConfig.delayMs);
          }
        } catch (catError: any) {
          if (catError instanceof StoreAccessBlockedError) {
            throw catError;
          }
          logger.error({ store: this.storeSlug, category: categoryUrl, error: catError.message }, 'Failed to scrape category');
        }
      }

    } catch (error: any) {
      logger.error({ store: this.storeSlug, error: error.message }, 'Scraper failed');
      throw error;
    } finally {
      if (this.context) {
        await this.context.close().catch(() => {});
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
      }
    }

    return products;
  }

  public async scrapeProductPage(page: Page, url: string): Promise<ScrapedProductSchemaType | null> {
    logger.debug({ store: this.storeSlug, url }, 'Scraping product page');
    
    // Fast path: fetch HTML directly via Playwright context request (bypasses heavy 3rd-party tracking scripts)
    try {
      const response = await page.request.get(url, {
        headers: { 'User-Agent': scraperConfig.userAgent },
        timeout: 15000,
      });
      if (response.ok()) {
        const html = await response.text();
        const extracted = this.extractProductFromHtml(html, url);
        if (extracted && extracted.price) {
          return extracted;
        }
      }
    } catch (fastErr: any) {
      logger.debug({ store: this.storeSlug, url, err: fastErr.message }, 'Fast fetch fallback to page navigation');
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: scraperConfig.navigationTimeoutMs });
    
    await this.checkAntiBotBlock(page, url);

    if (page.url().includes('404')) return null;

    const html = await page.content();
    return this.extractProductFromHtml(html, url);
  }

  /**
   * Pure extraction function: parses product details from PriceOye HTML.
   * Public for deterministic testing against fixtures without browser dependencies.
   */
  public extractProductFromHtml(html: string, url: string): ScrapedProductSchemaType | null {
    const $ = cheerio.load(html);

    // 0. Parse structured JSON-LD if present (canonical, authoritative)
    let ldProduct: any = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html() || '{}');
        if (parsed['@type'] === 'Product') {
          ldProduct = parsed;
        }
      } catch {}
    });

    // 1. Name and Brand
    let nameStr = normalizeWhitespace(
      (ldProduct && ldProduct.name) ||
      $('h3.product-title').first().text() ||
      $('h1').first().text() ||
      $('.product-title').first().text() ||
      $('.product-name').first().text()
    );
    if (!nameStr) {
      const titleText = $('title').text();
      if (titleText.includes('Price in Pakistan')) {
        nameStr = titleText.split('Price in Pakistan')[0].trim();
      }
    }
    
    if (!nameStr) {
      logger.debug({ url }, 'Failed to parse name');
      return null;
    }

    // Brand extraction: JSON-LD -> Breadcrumbs -> URL -> Title prefix
    let brandStr: string | null = null;
    if (ldProduct && ldProduct.brand) {
      brandStr = typeof ldProduct.brand === 'object' ? ldProduct.brand.name || null : String(ldProduct.brand);
    }
    if (!brandStr) {
      const breadcrumbItems = $('.breadcrumb li, ol.breadcrumb li, .breadcrumbs li')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean);
      if (breadcrumbItems.length >= 2) {
        const candidate = breadcrumbItems[1];
        if (!['mobiles', 'smartphones', 'tablets', 'laptops'].includes(candidate.toLowerCase())) {
          brandStr = candidate;
        }
      }
    }
    if (!brandStr) {
      const KNOWN_BRANDS = [
        'Samsung', 'Apple', 'Xiaomi', 'Infinix', 'Tecno', 'Vivo', 'Realme',
        'Honor', 'Oppo', 'Google', 'OnePlus', 'Lenovo', 'HP', 'Dell', 'Huawei',
        'Nokia', 'Sony', 'Asus', 'Acer', 'Zero', 'Kieslect', 'Kospet', 'Mibro'
      ];
      for (const b of KNOWN_BRANDS) {
        if (new RegExp(`^${b}\\b`, 'i').test(nameStr)) {
          brandStr = b;
          break;
        }
      }
    }

    // 2. Price extraction — scoped to first instance to prevent concatenating accessory bundles
    let price: number | null = null;
    if (ldProduct && ldProduct.offers && ldProduct.offers.price) {
      price = parsePrice(String(ldProduct.offers.price));
    }
    if (!price) {
      const currentPriceStr =
        $('.summary-price.price-size-lg').first().text() ||
        $('.summary-price:not(.line-through)').first().text() ||
        $('.summary-price.text-black').first().text() ||
        $('.product-price').first().text();
      price = parsePrice(currentPriceStr);
    }
    if (!price) {
      logger.debug({ url }, 'Failed to parse price');
      return null;
    }

    // Original price extraction — must use .first() to prevent concatenating accessory spans
    const originalPriceStr = $('.summary-price.line-through').first().text() || $('.old-price').first().text();
    const discountStr = $('.discount-badge, .save-price').first().text();
    
    let originalPrice = parsePrice(originalPriceStr);
    if (originalPrice !== null && originalPrice < price) {
      originalPrice = null;
    }
    const discountPercent = parseDiscountPercent(discountStr);

    // 3. Image — priority chain:
    //   1. JSON-LD image
    //   2. og:image  — server-rendered, always a clean CDN URL (most reliable)
    //   3. .product-image img[src]
    //   4. .product-image img[data-src]
    const imageUrl =
      normalizeImageUrl(ldProduct && ldProduct.image) ||
      normalizeImageUrl($('meta[property="og:image"]').attr('content')) ||
      normalizeImageUrl($('.product-image img').attr('src')) ||
      normalizeImageUrl($('.product-image img').attr('data-src')) ||
      null;

    // 4. Availability
    const btnText = $('.btn-add-to-cart, .add-cart-btn').text().toLowerCase();
    const inStock = !btnText.includes('out of stock');

    // 5. Identifiers
    const rawId = $('input[name="product_id"]').val() || (ldProduct && ldProduct.productID) || null;
    const urlSlug = url.split('/').filter(Boolean).pop() || null;
    const sourceIdentifier = rawId ? String(rawId) : (urlSlug || null);
    const sourceIdentifierType = rawId ? 'product_id' : 'url_slug';

    if (!sourceIdentifier) {
      logger.debug({ url }, 'Failed to parse product ID');
      return null;
    }

    // 6. Variant Specs parsing
    const ramGb = extractRamFromTitle(nameStr);
    let storageGb = extractStorageFromTitle(nameStr);

    // Fallback to table specs if title extraction failed
    if (storageGb === null) {
      const tableStorage = $('th:contains("Internal Storage")').next('td').text().match(/(\d+)/);
      if (tableStorage) {
        const val = parseInt(tableStorage[1], 10);
        if (val >= 16) storageGb = val;
      }
    }

    return {
      storeSlug: this.storeSlug,
      sourceUrl: url,
      sourceIdentifier,
      sourceIdentifierType,
      name: nameStr,
      brand: brandStr,
      modelNumber: null,
      sku: null,
      gtin: null,
      description: null,
      imageUrl,
      price,
      originalPrice,
      discountPercent,
      shippingFee: 0,
      inStock,
      stockCount: null,
      ramGb,
      storageGb,
      color: null
    };
  }
}
