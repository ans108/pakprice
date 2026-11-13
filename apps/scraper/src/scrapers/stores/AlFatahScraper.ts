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

export class AlFatahScraper extends BaseScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super('al-fatah');
  }

  async scrape(): Promise<ScrapedProductSchemaType[]> {
    const products: ScrapedProductSchemaType[] = [];

    const categoryDefs = STORE_CATEGORY_MAP['al-fatah'] || [
      { url: 'https://www.alfatah.com.pk/?s=dawlance&post_type=product', categorySlug: 'home-appliances', categoryName: 'Dawlance' },
    ];

    for (const catDef of categoryDefs) {
      if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) {
        break;
      }

      try {
        logger.info({ store: this.storeSlug, url: catDef.url }, 'Querying Al-Fatah products');

        // Fast Cheerio extraction over HTTP
        try {
          const res = await axios.get(catDef.url, {
            headers: {
              'User-Agent': scraperConfig.userAgent,
              Accept: 'text/html,application/xhtml+xml',
            },
            timeout: scraperConfig.navigationTimeoutMs,
          });

          if (res.status === 200 && typeof res.data === 'string') {
            const listProds = this.extractProductsFromListingHtml(res.data, catDef.categorySlug);
            for (const prod of listProds) {
              if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) break;
              products.push(prod);
              logger.info({ store: this.storeSlug, name: prod.name, price: prod.price }, 'Extracted Al-Fatah product from search');
            }
            continue;
          }
        } catch (httpErr: any) {
          logger.warn({ store: this.storeSlug, url: catDef.url, err: httpErr.message }, 'Direct HTTP listing fetch failed, falling back to Playwright');
        }

        // Playwright fallback
        if (!this.browser) {
          this.browser = await chromium.launch({ headless: true });
          this.context = await this.createContext(this.browser);
        }
        if (!this.context) {
          this.context = await this.createContext(this.browser);
        }
        const page = await this.context.newPage();
        try {
          await withRetry(async () => {
            await page.goto(catDef.url, {
              waitUntil: 'domcontentloaded',
              timeout: scraperConfig.navigationTimeoutMs,
            });
          });
          await this.checkAntiBotBlock(page, catDef.url);
          const html = await page.content();
          const listProds = this.extractProductsFromListingHtml(html, catDef.categorySlug);
          for (const prod of listProds) {
            if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) break;
            products.push(prod);
          }
        } finally {
          await page.close().catch(() => {});
        }
      } catch (err: any) {
        if (err instanceof StoreAccessBlockedError) throw err;
        logger.error({ store: this.storeSlug, url: catDef.url, err: err.message }, 'Failed to scrape Al-Fatah category');
      }
    }

    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});

    return products;
  }

  /**
   * Search Al-Fatah for products matching a specific query string.
   */
  async searchProducts(query: string, categorySlug = 'home-appliances'): Promise<ScrapedProductSchemaType[]> {
    const url = `https://www.alfatah.com.pk/?s=${encodeURIComponent(query)}&post_type=product`;
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': scraperConfig.userAgent,
          Accept: 'text/html,application/xhtml+xml',
        },
        timeout: 10000,
      });
      if (res.status === 200 && typeof res.data === 'string') {
        return this.extractProductsFromListingHtml(res.data, categorySlug);
      }
    } catch (err: any) {
      logger.warn({ store: this.storeSlug, query, err: err.message }, 'Al-Fatah search request failed');
    }
    return [];
  }

  /**
   * Pure extraction function from Al-Fatah WooCommerce search / category listing HTML.
   */
  public extractProductsFromListingHtml(html: string, categorySlug = 'home-appliances'): ScrapedProductSchemaType[] {
    const $ = cheerio.load(html);
    const results: ScrapedProductSchemaType[] = [];

    $('.product, .product-grid-item, .type-product').each((_, el) => {
      try {
        const titleEl = $(el).find('.woocommerce-loop-product__title, .product-title, h3, h2').first();
        const name = normalizeWhitespace(titleEl.text());
        if (!name) return;

        const href = $(el).find('a.woocommerce-LoopProduct-link, .product-element-top a, a').first().attr('href');
        if (!href || !href.startsWith('http') || !href.includes('/product/')) return;

        // Parse price: get the lowest price if range or discount
        let price = 0;
        let originalPrice: number | null = null;

        const insPrice = $(el).find('.price ins .woocommerce-Price-amount, ins .woocommerce-Price-amount').first().text();
        const delPrice = $(el).find('.price del .woocommerce-Price-amount, del .woocommerce-Price-amount').first().text();
        const regPrice = $(el).find('.price .woocommerce-Price-amount, .woocommerce-Price-amount').first().text();

        if (insPrice) {
          price = parsePrice(insPrice) || 0;
          if (delPrice) originalPrice = parsePrice(delPrice);
        } else if (regPrice) {
          price = parsePrice(regPrice) || 0;
        }

        if (price <= 0) return;

        const imgEl = $(el).find('img').first();
        const rawImg = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || null;
        const imageUrl = normalizeImageUrl(rawImg);

        const urlSlug = href.split('/').filter(Boolean).pop()?.replace('.html', '') || null;
        const sourceIdentifier = urlSlug || name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const inStock = !$(el).hasClass('outofstock') && !$(el).find('.out-of-stock').length;

        const ramGb = extractRamFromTitle(name);
        const storageGb = extractStorageFromTitle(name);

        const prod: ScrapedProductSchemaType = {
          storeSlug: this.storeSlug,
          sourceUrl: href,
          sourceIdentifier: String(sourceIdentifier),
          sourceIdentifierType: 'url_slug',
          name,
          brand: null,
          modelNumber: null,
          sku: null,
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

        const validated = this.validateProduct(prod);
        if (validated) results.push(validated);
      } catch {}
    });

    return results;
  }

  /**
   * Pure extraction function from WooCommerce Store REST API JSON item.
   */
  public extractProductFromJson(item: any, categorySlug?: string): ScrapedProductSchemaType | null {
    if (!item || !item.name) return null;

    const name = normalizeWhitespace(item.name);
    if (!name) return null;

    // Price
    let rawPrice = item.prices?.price;
    if (rawPrice && item.prices?.currency_minor_unit && item.prices.currency_minor_unit > 0) {
      // In case minor unit needs division, check formatted value
      const parsed = parseFloat(rawPrice) / Math.pow(10, item.prices.currency_minor_unit);
      if (parsed > 0) rawPrice = String(parsed);
    }
    const price = parsePrice(rawPrice || item.prices?.sale_price || item.prices?.regular_price);
    if (!price || price <= 0) return null;

    let originalPrice: number | null = null;
    if (item.prices?.regular_price) {
      const reg = parsePrice(item.prices.regular_price);
      if (reg && reg > price) originalPrice = reg;
    }

    const sourceUrl = item.permalink || `https://www.alfatah.com.pk/product/${item.slug}/`;
    const sku = item.sku ? normalizeWhitespace(String(item.sku)) : null;
    const sourceIdentifier = sku || (item.id ? String(item.id) : item.slug);
    const sourceIdentifierType: 'sku' | 'product_id' | 'url_slug' = sku ? 'sku' : (item.id ? 'product_id' : 'url_slug');

    const imageUrl = normalizeImageUrl(item.images?.[0]?.src || null);
    const inStock = item.is_in_stock ?? true;

    const brand = item.brands?.[0]?.name ? normalizeWhitespace(item.brands[0].name) : null;
    const ramGb = extractRamFromTitle(name);
    const storageGb = extractStorageFromTitle(name);

    const product: ScrapedProductSchemaType = {
      storeSlug: this.storeSlug,
      sourceUrl,
      sourceIdentifier: String(sourceIdentifier),
      sourceIdentifierType,
      name,
      brand,
      modelNumber: null,
      sku,
      gtin: null,
      description: item.short_description ? normalizeWhitespace(item.short_description.replace(/<[^>]*>/g, '')) : null,
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

  /**
   * Pure extraction function from WooCommerce PDP HTML.
   */
  public extractProductFromHtml(html: string, url: string, categorySlug?: string): ScrapedProductSchemaType | null {
    const $ = cheerio.load(html);

    // Check JSON-LD first
    let jsonLdProduct: any = null;
    $('script[type="application/ld+json"]').each((_, s) => {
      try {
        const parsed = JSON.parse($(s).html() || '{}');
        if (parsed['@type'] === 'Product' || parsed['@graph']) {
          const prod = parsed['@type'] === 'Product' ? parsed : parsed['@graph']?.find((g: any) => g['@type'] === 'Product');
          if (prod) jsonLdProduct = prod;
        }
      } catch {}
    });

    const rawTitle = jsonLdProduct?.name || $('h1.product_title, h1.page-title, h1').first().text();
    const name = normalizeWhitespace(rawTitle);
    if (!name) return null;

    // Price
    let rawPrice = '';
    if (jsonLdProduct?.offers) {
      const offer = Array.isArray(jsonLdProduct.offers) ? jsonLdProduct.offers[0] : jsonLdProduct.offers;
      if (offer?.price) rawPrice = String(offer.price);
    }
    if (!rawPrice) {
      rawPrice = $('.price ins .amount, .price .woocommerce-Price-amount, span.amount').first().text().trim();
    }
    const price = parsePrice(rawPrice);
    if (!price || price <= 0) return null;

    // Original price
    let originalPrice: number | null = null;
    const oldPriceText = $('.price del .amount, .price del .woocommerce-Price-amount').first().text().trim();
    if (oldPriceText) {
      const parsed = parsePrice(oldPriceText);
      if (parsed && parsed > price) originalPrice = parsed;
    }

    // SKU
    const sku = jsonLdProduct?.sku || $('.sku_wrapper .sku, [itemprop="sku"]').first().text().trim() || null;
    const urlSlug = url.split('/').filter(Boolean).pop()?.replace('.html', '') || null;
    const sourceIdentifier = sku || urlSlug;
    const sourceIdentifierType: 'sku' | 'url_slug' = sku ? 'sku' : 'url_slug';
    if (!sourceIdentifier) return null;

    // Image
    const rawImg = jsonLdProduct?.image || $('meta[property="og:image"]').attr('content') || $('.woocommerce-product-gallery img').first().attr('src');
    const imageUrl = normalizeImageUrl(Array.isArray(rawImg) ? rawImg[0] : rawImg);

    // Stock
    let inStock = true;
    if (jsonLdProduct?.offers) {
      const offer = Array.isArray(jsonLdProduct.offers) ? jsonLdProduct.offers[0] : jsonLdProduct.offers;
      if (offer?.availability) inStock = String(offer.availability).toLowerCase().includes('instock');
    } else {
      const stockEl = $('.stock.out-of-stock');
      if (stockEl.length > 0) inStock = false;
    }

    const brand = jsonLdProduct?.brand?.name || $('.posted_in a').first().text().trim() || null;
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
