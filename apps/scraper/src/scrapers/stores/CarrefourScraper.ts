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

export class CarrefourScraper extends BaseScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super('carrefour');
  }

  async scrape(): Promise<ScrapedProductSchemaType[]> {
    const products: ScrapedProductSchemaType[] = [];

    try {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.createContext(this.browser);
      const page = await this.context.newPage();
      page.setDefaultTimeout(scraperConfig.selectorTimeoutMs);
      page.setDefaultNavigationTimeout(scraperConfig.navigationTimeoutMs);

      const categoryDefs = STORE_CATEGORY_MAP['carrefour'] || [
        { url: 'https://www.carrefour.pk/mafpak/en/c/NFPAK4000000', categorySlug: 'groceries', categoryName: 'Food & Groceries' },
      ];

      for (const catDef of categoryDefs) {
        if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) break;

        try {
          logger.info({ store: this.storeSlug, url: catDef.url }, 'Navigating to Carrefour category');

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
          $('a[data-testid="product_card"], a[href*="/p/"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !productLinks.includes(href)) {
              const fullUrl = href.startsWith('http') ? href : `https://www.carrefour.pk${href.startsWith('/') ? '' : '/'}${href}`;
              productLinks.push(fullUrl);
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
              logger.warn({ store: this.storeSlug, url: link, err: err.message }, 'Failed to scrape Carrefour product');
            }
          }
        } catch (err: any) {
          if (err instanceof StoreAccessBlockedError) throw err;
          logger.error({ store: this.storeSlug, url: catDef.url, err: err.message }, 'Failed to scrape Carrefour category');
        }
      }
    } finally {
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser) await this.browser.close().catch(() => {});
    }

    return products;
  }

  /**
   * Pure extraction function from Carrefour HTML / Schema.org JSON-LD.
   */
  public extractProductFromHtml(html: string, url: string, categorySlug?: string): ScrapedProductSchemaType | null {
    const $ = cheerio.load(html);

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

    const rawTitle = jsonLd?.name || $('h1[data-testid="product-title"], h1.css-11vwhh0, h1').first().text();
    const name = normalizeWhitespace(rawTitle);
    if (!name) return null;

    // Price
    let rawPrice = '';
    if (jsonLd?.offers) {
      const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
      if (offer?.price) rawPrice = String(offer.price);
    }
    if (!rawPrice) {
      rawPrice = $('[data-testid="offer-price"], .css-179z75z, span.price').first().text().trim();
    }
    const price = parsePrice(rawPrice);
    if (!price || price <= 0) return null;

    // Original price
    let originalPrice: number | null = null;
    const oldPriceText = $('[data-testid="was-price"], .css-1q8q7e9, del').first().text().trim();
    if (oldPriceText) {
      const parsed = parsePrice(oldPriceText);
      if (parsed && parsed > price) originalPrice = parsed;
    }

    // SKU
    const sku = jsonLd?.sku || $('[data-testid="sku"], .sku').first().text().trim() || null;
    const urlSlug = url.split('/').filter(Boolean).pop()?.replace('.html', '') || null;
    const sourceIdentifier = sku || urlSlug;
    const sourceIdentifierType: 'sku' | 'url_slug' = sku ? 'sku' : 'url_slug';
    if (!sourceIdentifier) return null;

    // Image
    const rawImg =
      jsonLd?.image ||
      $('meta[property="og:image"]').attr('content') ||
      $('img[data-testid="product-image"], .css-11vwhh0 img').first().attr('src');
    const imageUrl = normalizeImageUrl(Array.isArray(rawImg) ? rawImg[0] : rawImg);

    // Stock
    let inStock = true;
    if (jsonLd?.offers) {
      const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
      if (offer?.availability) inStock = String(offer.availability).toLowerCase().includes('instock');
    } else {
      const outOfStock = $('[data-testid="out-of-stock"], .out-of-stock');
      if (outOfStock.length > 0) inStock = false;
    }

    const brand = jsonLd?.brand?.name || $('[data-testid="brand-name"]').first().text().trim() || null;
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
