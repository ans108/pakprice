/**
 * Increment 7B — Phase 2: Scale Al-Fatah via WooCommerce Search & Categories
 * Target: 60-75+ real verified offers in prices table
 */

import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
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

const SEARCH_QUERIES = [
  'Nasgas', 'Philips', 'Kenwood', 'Westpoint', 'Anex', 'Panasonic', 'Braun', 
  'Haier', 'Dawlance', 'Gree', 'Microwave', 'Air Fryer', 'Blender', 'Juicer', 
  'Iron', 'Kettle', 'Toaster', 'Sandwich Maker', 'Heater', 'Geyser', 'Vacuum', 
  'Trimmer', 'Hair Dryer', 'Earbuds', 'Power Bank', 'Watch'
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function run() {
  console.log('=== Increment 7B - Phase 2: Scaling Al-Fatah via WooCommerce Search ===');

  const { data: store, error: storeErr } = await supabase.from('stores').select('id, name, slug').eq('slug', 'al-fatah').single();
  if (!store) {
    console.error('Al-Fatah store not found:', storeErr);
    return;
  }
  console.log(`Using Store: ${store.name} (${store.id})`);

  const seenUrls = new Set<string>();

  // Check current count
  const { count: initialCount } = await supabase
    .from('prices')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', store.id);
  console.log(`Initial verified offers for Al-Fatah: ${initialCount || 0}`);

  for (const query of SEARCH_QUERIES) {
    // Check if target reached
    const { count: currentCount } = await supabase
      .from('prices')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', store.id);

    if ((currentCount || 0) >= 75) {
      console.log(`\n Target reached! Al-Fatah currently has ${currentCount} verified offers in prices.`);
      break;
    }

    console.log(`\nQuerying Al-Fatah for: "${query}"...`);
    const searchUrl = `https://alfatah.com.pk/?s=${encodeURIComponent(query)}&post_type=product`;

    try {
      const res = await axios.get(searchUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
        timeout: 10000,
      });

      if (res.status !== 200 || typeof res.data !== 'string') {
        console.warn(`Al-Fatah returned status ${res.status} for "${query}"`);
        continue;
      }

      const $ = cheerio.load(res.data);
      const items: ScrapedProductSchemaType[] = [];

      $('.product, .product-grid-item, .type-product').each((_, el) => {
        try {
          const titleEl = $(el).find('.woocommerce-loop-product__title, .product-title, h3, h2').first();
          const name = normalizeWhitespace(titleEl.text());
          if (!name) return;

          const href = $(el).find('a.woocommerce-LoopProduct-link, .product-element-top a, a').first().attr('href');
          if (!href || !href.startsWith('http') || !href.includes('/product/')) return;

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

          items.push({
            storeSlug: 'al-fatah',
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
          // ignore single item parse errors
        }
      });

      console.log(`Found ${items.length} products on page for "${query}"`);

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
          console.log(`\n Target reached! Al-Fatah currently has ${c} verified offers in prices.`);
          break;
        }
      }
    } catch (err: any) {
      console.error(`Query failed for "${query}":`, err.message);
    }
  }

  const { count: finalCount } = await supabase
    .from('prices')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', store.id);

  console.log('\n=== Phase 2 Complete ===');
  console.log(`Total verified offers for Al-Fatah in prices: ${finalCount}`);
}

run().catch(console.error);

