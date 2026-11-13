/**
 * Increment 7B — Phase 3 (Part 1): Scale Paklap via Playwright Category Scraping
 * Target: 65-75+ real verified offers in prices table
 */

import dotenv from 'dotenv';
import path from 'path';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { ScrapedProductSchemaType } from '../apps/scraper/src/types/scraperTypes';
import { normalizeWhitespace, parsePrice, normalizeImageUrl } from '../apps/scraper/src/utils/scraperUtils';
import { parseRam as extractRamFromTitle, parseStorage as extractStorageFromTitle } from '@pakprice/shared';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const priceIngestion = new PriceIngestionService();

const CATEGORY_URLS = [
  'https://www.paklap.pk/laptops-prices.html',
  'https://www.paklap.pk/laptops-prices/gaming-laptops.html',
  'https://www.paklap.pk/laptops-prices/hp-laptops.html',
  'https://www.paklap.pk/laptops-prices/dell-laptops.html',
  'https://www.paklap.pk/laptops-prices/lenovo-laptops.html',
  'https://www.paklap.pk/laptops-prices/asus-laptops.html',
  'https://www.paklap.pk/laptops-prices/apple-macbooks.html',
];

async function run() {
  console.log('=== Increment 7B - Phase 3 (Part 1): Scaling Paklap via Playwright ===');

  const { data: store, error: storeErr } = await supabase.from('stores').select('id, name, slug').eq('slug', 'paklap').single();
  if (!store) {
    console.error('Paklap store not found:', storeErr);
    return;
  }
  console.log(`Using Store: ${store.name} (${store.id})`);

  const { count: initialCount } = await supabase
    .from('prices')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', store.id);
  console.log(`Initial verified offers for Paklap: ${initialCount || 0}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const seenUrls = new Set<string>();

  try {
    for (const catUrl of CATEGORY_URLS) {
      const { count: currentCount } = await supabase
        .from('prices')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id);

      if ((currentCount || 0) >= 75) {
        console.log(`\n Target reached! Paklap currently has ${currentCount} verified offers in prices.`);
        break;
      }

      console.log(`\nNavigating to Paklap category: ${catUrl}...`);
      try {
        const res = await page.goto(catUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });

        if (res?.status() !== 200) {
          console.warn(`Paklap returned status ${res?.status()} for ${catUrl}`);
          continue;
        }

        const html = await page.content();
        const $ = cheerio.load(html);

        const items: ScrapedProductSchemaType[] = [];

        $('.item.product-item, .product-item-info').each((_, el) => {
          try {
            const link = $(el).find('a.product-item-link').first();
            const rawTitle = link.text();
            const name = normalizeWhitespace(rawTitle);
            const href = link.attr('href');
            if (!name || !href || !href.startsWith('http') || !href.includes('.html')) return;

            const priceBox = $(el).find('[data-price-type="finalPrice"] .price, .price-box .price').first();
            const rawPrice = priceBox.text();
            const price = parsePrice(rawPrice);
            if (!price || price <= 0) return;

            let originalPrice: number | null = null;
            const oldPriceEl = $(el).find('[data-price-type="oldPrice"] .price, .old-price .price').first();
            if (oldPriceEl.length) {
              const parsedOld = parsePrice(oldPriceEl.text());
              if (parsedOld && parsedOld > price) originalPrice = parsedOld;
            }

            const imgEl = $(el).find('.product-image-photo').first();
            const rawImg = imgEl.attr('src') || imgEl.attr('data-src') || null;
            const imageUrl = normalizeImageUrl(rawImg);

            const urlSlug = href.split('/').filter(Boolean).pop()?.replace('.html', '') || null;
            const sourceIdentifier = urlSlug || name.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const inStock = !$(el).find('.stock.unavailable').length;

            items.push({
              storeSlug: 'paklap',
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
              ramGb: extractRamFromTitle(name),
              storageGb: extractStorageFromTitle(name),
              color: null,
            });
          } catch (e: any) {
            // ignore
          }
        });

        console.log(`Discovered ${items.length} laptop items on page.`);

        for (const item of items) {
          if (seenUrls.has(item.sourceUrl)) continue;
          seenUrls.add(item.sourceUrl);

          try {
            const result = await priceIngestion.ingest(item, store.id, false, { allowCreate: true });
            console.log(` [INGESTED] ${item.name} @ Rs. ${item.price.toLocaleString()} (${result.action})`);
          } catch (err: any) {
            console.error(` Error ingesting ${item.name}:`, err.message);
          }

          const { count: c } = await supabase
            .from('prices')
            .select('*', { count: 'exact', head: true })
            .eq('store_id', store.id);

          if ((c || 0) >= 75) {
            console.log(`\n Target reached! Paklap currently has ${c} verified offers in prices.`);
            break;
          }
        }
      } catch (navErr: any) {
        console.error(`Error navigating to ${catUrl}:`, navErr.message);
      }
    }
  } finally {
    await browser.close();
  }

  const { count: finalCount } = await supabase
    .from('prices')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', store.id);

  console.log('\n=== Paklap Scaling Complete ===');
  console.log(`Total verified offers for Paklap in prices: ${finalCount}`);
}

run().catch(console.error);

