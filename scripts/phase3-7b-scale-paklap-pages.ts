/**
 * Paklap Category Pagination via Playwright with fresh contexts
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

// Pages to scrape
const PAGES = [
  'https://www.paklap.pk/laptops-prices.html?p=2',
  'https://www.paklap.pk/laptops-prices.html?p=3',
  'https://www.paklap.pk/laptops-prices.html?p=4',
];

async function run() {
  const { data: store } = await supabase.from('stores').select('id, name, slug').eq('slug', 'paklap').single();
  if (!store) return;

  const browser = await chromium.launch({ headless: true });
  const seenUrls = new Set<string>();

  try {
    for (const pageUrl of PAGES) {
      const { count: currentCount } = await supabase
        .from('prices')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id);

      if ((currentCount || 0) >= 75) {
        console.log(`Target reached! Paklap has ${currentCount} offers.`);
        break;
      }

      console.log(`\nFetching ${pageUrl} with fresh context...`);
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();

      try {
        const res = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        console.log(`Status: ${res?.status()}`);
        if (res?.status() === 200) {
          const html = await page.content();
          const $ = cheerio.load(html);

          const items: ScrapedProductSchemaType[] = [];
          $('.item.product-item, .product-item-info').each((_, el) => {
            const link = $(el).find('a.product-item-link').first();
            const rawTitle = link.text();
            const name = normalizeWhitespace(rawTitle);
            const href = link.attr('href');
            if (!name || !href || !href.startsWith('http') || !href.includes('.html')) return;

            const priceBox = $(el).find('[data-price-type="finalPrice"] .price, .price-box .price').first();
            const price = parsePrice(priceBox.text());
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
          });

          console.log(`Discovered ${items.length} items on ${pageUrl}`);

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
              console.log(`Target reached! Paklap has ${c} offers.`);
              break;
            }
          }
        }
      } catch (err: any) {
        console.error(`Error on ${pageUrl}:`, err.message);
      } finally {
        await context.close();
      }

      // Small pause between pages to respect rate limits
      await new Promise(r => setTimeout(r, 2000));
    }
  } finally {
    await browser.close();
  }

  const { count: finalCount } = await supabase
    .from('prices')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', store.id);

  console.log(`Final verified offers for Paklap: ${finalCount}`);
}

run().catch(console.error);

