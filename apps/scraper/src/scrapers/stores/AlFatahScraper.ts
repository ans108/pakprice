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

    // Al-Fatah provides a public WooCommerce Store REST API
    const categoryDefs = STORE_CATEGORY_MAP['al-fatah'] || [
      { url: 'https://www.alfatah.com.pk/wp-json/wc/store/v1/products?per_page=20', categorySlug: 'home-appliances', categoryName: 'Appliances & Electronics' },
    ];

    for (const catDef of categoryDefs) {
      if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) {
        break;
      }

      try {
        logger.info({ store: this.storeSlug, url: catDef.url }, 'Querying Al-Fatah products');

        if (catDef.url.includes('/wp-json/')) {
          const res = await axios.get(catDef.url, {
            headers: {
              'User-Agent': scraperConfig.userAgent,
              Accept: 'application/json',
            },
            timeout: scraperConfig.navigationTimeoutMs,
          });

          if (Array.isArray(res.data)) {
            for (const item of res.data) {
              if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) {
                break;
              }
              const prod = this.extractProductFromJson(item, catDef.categorySlug);
              if (prod) {
                products.push(prod);
                logger.info({ store: this.storeSlug, name: prod.name, price: prod.price }, 'Extracted Al-Fatah product from API');
              }
            }
          }
        } else {
          // Playwright / HTML fallback
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
            const $ = cheerio.load(html);

            const links: string[] = [];
            $('a.woocommerce-LoopProduct-link, .product-element-top a').each((_, el) => {
              const h = $(el).attr('href');
              if (h && h.startsWith('http') && !links.includes(h)) links.push(h);
            });

            for (const link of links) {
              if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) break;
              try {
                await page.goto(link, { waitUntil: 'domcontentloaded', timeout: scraperConfig.navigationTimeoutMs });
                await this.checkAntiBotBlock(page, link);
                const pdpHtml = await page.content();
                const prod = this.extractProductFromHtml(pdpHtml, link, catDef.categorySlug);
                if (prod) products.push(prod);
              } catch (err: any) {
                if (err instanceof StoreAccessBlockedError) throw err;
                logger.warn({ store: this.storeSlug, url: link, err: err.message }, 'Failed to scrape Al-Fatah product page');
              }
            }
          } finally {
            await page.close().catch(() => {});
          }
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
