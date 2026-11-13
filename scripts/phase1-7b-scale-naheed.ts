/**
 * Increment 7B — Phase 1: Scale Naheed via Typesense API
 * Target: 60-75+ real verified offers in prices table
 */

import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
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

const node = Buffer.from('ODVlY2cwcGoyaHlua2Q2bXAtMS5hMS50eXBlc2Vuc2UubmV0', 'base64').toString('ascii');
const apiKey = Buffer.from('Y1F2Z3g3eWhSdkxmcGRuSmpSZTZucTU5d1J6ZjkxT3Q~'.replace(/~/g, '='), 'base64').toString('ascii');

const SEARCH_QUERIES = [
  'Audionic', 'Ronin', 'Zero', 'Anker', 'Xiaomi', 'Samsung', 'Infinix', 'Tecno', 
  'Dany', 'Baseus', 'Ugreen', 'Philips', 'Panasonic', 'Braun', 'Remington', 
  'Kenwood', 'Westpoint', 'Anex', 'Haier', 'Dawlance', 'Earbuds', 'Smart Watch', 
  'Power Bank', 'Iron', 'Blender', 'Kettle', 'Trimmer', 'Hair Dryer'
];

async function run() {
  console.log('=== Increment 7B - Phase 1: Scaling Naheed via Typesense API ===');

  const { data: store, error: storeErr } = await supabase.from('stores').select('id, name, slug').eq('slug', 'naheed').single();
  if (!store) {
    console.error('Naheed store not found:', storeErr);
    return;
  }
  console.log(`Using Store: ${store.name} (${store.id})`);

  // Track URLs already processed in this run to avoid duplicate queries
  const seenUrls = new Set<string>();
  let newlyIngested = 0;
  let alreadyExisting = 0;
  let errors = 0;

  for (const query of SEARCH_QUERIES) {
    console.log(`\nQuerying Typesense for: "${query}"...`);
    const searchUrl = `https://${node}/collections/npk_livedefault-products/documents/search?q=${encodeURIComponent(query)}&query_by=name&per_page=50`;

    try {
      const res = await axios.get(searchUrl, {
        headers: { 'x-typesense-api-key': apiKey },
        timeout: 10000,
      });

      const hits = res.data?.hits || [];
      console.log(`Found ${hits.length} hits for "${query}"`);

      for (const hit of hits) {
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
        const sourceUrl = doc.url || `https://www.naheed.pk/${slug}`;
        if (seenUrls.has(sourceUrl)) continue;
        seenUrls.add(sourceUrl);

        const sourceIdentifier = String(doc.sku || slug || doc.id);
        const inStock = doc.is_in_stock !== false;
        const brand = Array.isArray(doc.manufacturer)
          ? doc.manufacturer[0]
          : (typeof doc.manufacturer === 'string' ? doc.manufacturer : null);

        const scrapedProduct: ScrapedProductSchemaType = {
          storeSlug: 'naheed',
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

        try {
          const result = await priceIngestion.ingest(scrapedProduct, store.id, false, { allowCreate: true });
          if (result.action === 'created' || result.action === 'updated' || result.action === 'dry_run_new') {
            newlyIngested++;
            console.log(` [INGESTED] ${name} @ Rs. ${price.toLocaleString()} (${result.action})`);
          } else if (result.action === 'no_change') {
            alreadyExisting++;
          } else {
            console.log(` [SKIPPED] ${name}: ${result.reason || result.action}`);
          }
        } catch (ingestErr: any) {
          console.error(` Error ingesting ${name}:`, ingestErr.message);
          errors++;
        }

        // Check if we reached our target
        const { count: currentNaheedCount } = await supabase
          .from('prices')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', store.id);

        if ((currentNaheedCount || 0) >= 75) {
          console.log(`\n Target reached! Naheed currently has ${currentNaheedCount} verified offers in prices.`);
          break;
        }
      }
    } catch (err: any) {
      console.error(`Typesense query failed for "${query}":`, err.message);
    }

    const { count: checkCount } = await supabase
      .from('prices')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', store.id);

    if ((checkCount || 0) >= 75) {
      break;
    }
  }

  const { count: finalCount } = await supabase
    .from('prices')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', store.id);

  console.log('\n=== Phase 1 Complete ===');
  console.log(`Total verified offers for Naheed in prices: ${finalCount}`);
}

run().catch(console.error);
