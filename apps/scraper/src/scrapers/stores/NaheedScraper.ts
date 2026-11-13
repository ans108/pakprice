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

export class NaheedScraper extends BaseScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super('naheed');
  }

  async scrape(): Promise<ScrapedProductSchemaType[]> {
    const products: ScrapedProductSchemaType[] = [];

    const defaultQueries = ['audionic', 'faster', 'anker', 'samsung', 'redmi', 'xiaomi', 'dawlance', 'philips'];

    for (const q of defaultQueries) {
      if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) break;
      const items = await this.searchProducts(q);
      for (const item of items) {
        if (scraperConfig.maxProducts && products.length >= scraperConfig.maxProducts) break;
        products.push(item);
      }
    }

    return products;
  }

  /**
   * Search Naheed using its official Typesense search endpoint.
   */
  async searchProducts(query: string, categorySlug = 'electronics'): Promise<ScrapedProductSchemaType[]> {
    const node = Buffer.from('ODVlY2cwcGoyaHlua2Q2bXAtMS5hMS50eXBlc2Vuc2UubmV0', 'base64').toString('ascii');
    const apiKey = Buffer.from(
      'Y1F2Z3g3eWhSdkxmcGRuSmpSZTZucTU5d1J6ZjkxT3Q~'.replace(/~/g, '='),
      'base64'
    ).toString('ascii');

    const url = `https://${node}/collections/npk_livedefault-products/documents/search?q=${encodeURIComponent(query)}&query_by=name&per_page=30`;
    try {
      const res = await axios.get(url, {
        headers: { 'x-typesense-api-key': apiKey },
        timeout: 8000,
      });

      const results: ScrapedProductSchemaType[] = [];
      if (res.status === 200 && Array.isArray(res.data?.hits)) {
        for (const hit of res.data.hits) {
          const doc = hit.document;
          if (!doc || !doc.name) continue;

          const rawName = normalizeWhitespace(doc.name);
          if (!rawName) continue;
          const name: string = rawName;
          const rawPrice = doc.special_price ?? doc.price;
          const price = typeof rawPrice === 'number' ? rawPrice : parsePrice(String(rawPrice));
          if (!price || price <= 0) continue;

          let originalPrice: number | null = null;
          if (doc.special_price && doc.price) {
            const reg = typeof doc.price === 'number' ? doc.price : parsePrice(String(doc.price));
            if (reg && reg > price) originalPrice = reg;
          }

          const slug = doc.url_key || doc.sku;
          const sourceUrl = doc.url || `https://www.naheed.pk/${slug}.html`;
          const sourceIdentifier = String(doc.sku || slug || doc.id);
          const inStock = doc.is_in_stock !== false;
          const brand = Array.isArray(doc.manufacturer)
            ? doc.manufacturer[0]
            : (typeof doc.manufacturer === 'string' ? doc.manufacturer : null);

          const prod: ScrapedProductSchemaType = {
            storeSlug: this.storeSlug,
            sourceUrl,
            sourceIdentifier,
            sourceIdentifierType: doc.sku ? 'sku' : 'url_slug',
            name,
            brand: brand ? normalizeWhitespace(brand) : null,
            modelNumber: null,
            sku: doc.sku || null,
            gtin: null,
            description: null,
            imageUrl: normalizeImageUrl(doc.image || null),
            price,
            originalPrice,
            discountPercent: originalPrice && originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : null,
            shippingFee: 0,
            inStock,
            stockCount: null,
            ramGb: extractRamFromTitle(name),
            storageGb: extractStorageFromTitle(name),
            color: null,
          };

          const validated = this.validateProduct(prod);
          if (validated) results.push(validated);
        }
      }
      return results;
    } catch (err: any) {
      logger.warn({ store: this.storeSlug, query, err: err.message }, 'Naheed Typesense search failed');
      return [];
    }
  }

  /**
   * Pure extraction function from Naheed Magento 2 HTML.
   */
  public extractProductFromHtml(html: string, url: string, categorySlug?: string): ScrapedProductSchemaType | null {
    const $ = cheerio.load(html);

    // 1. Check Schema.org JSON-LD
    let jsonLdProduct: any = null;
    $('script[type="application/ld+json"]').each((_, s) => {
      try {
        const parsed = JSON.parse($(s).html() || '{}');
        if (parsed['@type'] === 'Product') {
          jsonLdProduct = parsed;
        } else if (Array.isArray(parsed)) {
          const found = parsed.find((p: any) => p['@type'] === 'Product');
          if (found) jsonLdProduct = found;
        }
      } catch {}
    });

    const rawTitle = jsonLdProduct?.name || $('h1.page-title span, h1.page-title, h1').first().text();
    const name = normalizeWhitespace(rawTitle);
    if (!name) return null;

    // 2. Price extraction
    let rawPrice = '';
    if (jsonLdProduct?.offers) {
      const offer = Array.isArray(jsonLdProduct.offers) ? jsonLdProduct.offers[0] : jsonLdProduct.offers;
      if (offer?.price) rawPrice = String(offer.price);
    }
    if (!rawPrice) {
      rawPrice = $('[data-price-type="finalPrice"] .price, .price-wrapper .price, span.price').first().text().trim();
    }
    const price = parsePrice(rawPrice);
    if (!price || price <= 0) return null;

    // 3. Original price
    let originalPrice: number | null = null;
    const oldPriceText = $('[data-price-type="oldPrice"] .price, .old-price .price').first().text().trim();
    if (oldPriceText) {
      const parsed = parsePrice(oldPriceText);
      if (parsed && parsed > price) originalPrice = parsed;
    }

    // 4. SKU & Identifier
    const sku = jsonLdProduct?.sku || $('.product.attribute.sku .value, [itemprop="sku"]').first().text().trim() || null;
    const urlSlug = url.split('/').filter(Boolean).pop()?.replace('.html', '') || null;
    const sourceIdentifier = sku || urlSlug;
    const sourceIdentifierType: 'sku' | 'url_slug' = sku ? 'sku' : 'url_slug';
    if (!sourceIdentifier) return null;

    // 5. Image
    const rawImg =
      jsonLdProduct?.image ||
      $('meta[property="og:image"]').attr('content') ||
      $('.gallery-placeholder img, .fotorama__img, .product.media img').first().attr('src');
    const imageUrl = normalizeImageUrl(Array.isArray(rawImg) ? rawImg[0] : rawImg);

    // 6. Stock status
    let inStock = true;
    if (jsonLdProduct?.offers) {
      const offer = Array.isArray(jsonLdProduct.offers) ? jsonLdProduct.offers[0] : jsonLdProduct.offers;
      if (offer?.availability) {
        inStock = String(offer.availability).toLowerCase().includes('instock');
      }
    } else {
      const unavailable = $('.stock.unavailable, .out-of-stock');
      if (unavailable.length > 0) inStock = false;
    }

    const brand = jsonLdProduct?.brand?.name || $('.product.attribute.manufacturer .value, .brand a').first().text().trim() || null;
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
