import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import fs from 'fs';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';
import { ShophiveScraper } from '../apps/scraper/src/scrapers/stores/ShophiveScraper';
import { PriceIngestionService } from '../apps/scraper/src/services/PriceIngestionService';
import { ScrapedProductSchemaType } from '../apps/scraper/src/types/scraperTypes';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function getDbCounts() {
  const [{ count: p }, { count: v }, { count: pr }, { count: ph }, { count: spi }] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('product_variants').select('*', { count: 'exact', head: true }),
    supabase.from('prices').select('*', { count: 'exact', head: true }),
    supabase.from('price_history').select('*', { count: 'exact', head: true }),
    supabase.from('store_product_identifiers').select('*', { count: 'exact', head: true }),
  ]);
  return { products: p!, variants: v!, prices: pr!, priceHistory: ph!, identifiers: spi! };
}

export async function verifyDbIntegrity() {
  // 1. Check duplicate current prices on (variant_id, store_id)
  const { data: allPrices, error: pErr } = await supabase.from('prices').select('id, variant_id, store_id, price');
  if (pErr) throw pErr;

  const priceKeySet = new Set<string>();
  let duplicatePrices = 0;
  for (const pr of allPrices || []) {
    const key = `${pr.variant_id}::${pr.store_id}`;
    if (priceKeySet.has(key)) duplicatePrices++;
    priceKeySet.add(key);
  }

  // 2. Check duplicate identifiers on (store_id, identifier_type, identifier)
  const { data: allIds, error: iErr } = await supabase.from('store_product_identifiers').select('id, store_id, identifier_type, identifier');
  if (iErr) throw iErr;

  const idKeySet = new Set<string>();
  let duplicateIds = 0;
  for (const idRow of allIds || []) {
    const key = `${idRow.store_id}::${idRow.identifier_type}::${idRow.identifier}`;
    if (idKeySet.has(key)) duplicateIds++;
    idKeySet.add(key);
  }

  // 3. Check orphan prices
  const { data: orphanPrices, error: opErr } = await supabase
    .from('prices')
    .select('id, variant_id')
    .not('variant_id', 'in', `(${Array.from(new Set(allPrices?.map(p => p.variant_id) || [])).slice(0, 100).join(',')})`); // quick sanity check or check foreign key

  // 4. Check prices by store
  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));
  const pricesByStore: Record<string, number> = {};
  for (const pr of allPrices || []) {
    const slug = storeMap.get(pr.store_id) || 'unknown';
    pricesByStore[slug] = (pricesByStore[slug] || 0) + 1;
  }

  const passed = duplicatePrices === 0 && duplicateIds === 0;
  console.log(`\n── INTEGRITY AUDIT ──`);
  console.log(`Total current prices: ${allPrices?.length} | Unique pairs: ${priceKeySet.size} | Duplicate prices: ${duplicatePrices} ${duplicatePrices === 0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Total identifiers: ${allIds?.length} | Unique tuples: ${idKeySet.size} | Duplicate IDs: ${duplicateIds} ${duplicateIds === 0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Current prices by store:`, pricesByStore);

  if (!passed) {
    throw new Error(`Data integrity violation detected: duplicate prices=${duplicatePrices}, duplicate IDs=${duplicateIds}`);
  }

  return { duplicatePrices, duplicateIds, pricesByStore };
}

interface IngestItem {
  target: any;
  product: ScrapedProductSchemaType;
}

export async function scrapeMegaCandidates(startIndex: number, count: number): Promise<IngestItem[]> {
  const candidates: any[] = JSON.parse(fs.readFileSync('scripts/mega-candidates-6g.json', 'utf8'));
  const scraper = new MegaPkScraper();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };

  const items: IngestItem[] = [];
  const batch = candidates.slice(startIndex, startIndex + count * 2); // slice extra to account for unpriced

  for (const c of batch) {
    if (items.length >= count) break;
    try {
      const res = await axios.get(c.url, { headers, timeout: 15000 });
      const extracted = scraper.extractFromHtml(res.data, c.url);
      if (extracted) {
        const validated = scraper.validateProduct(extracted);
        if (validated && validated.price >= 500) {
          items.push({ target: c, product: validated });
        }
      }
    } catch (e: any) {
      // skip individual error
    }
  }

  return items;
}

export async function scrapeShophiveCandidates(startIndex: number, count: number): Promise<IngestItem[]> {
  const candidates: any[] = JSON.parse(fs.readFileSync('scripts/shophive-candidates-6g.json', 'utf8'));
  const scraper = new ShophiveScraper();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };

  const items: IngestItem[] = [];
  const batch = candidates.slice(startIndex, startIndex + count * 2);

  for (const c of batch) {
    if (items.length >= count) break;
    try {
      const res = await axios.get(c.url, { headers, timeout: 15000 });
      const extracted = scraper.extractProductFromHtml(res.data, c.url, c.categorySlug || 'mobiles');
      if (extracted) {
        const validated = scraper.validateProduct(extracted);
        if (validated && validated.price >= 500) {
          items.push({ target: c, product: validated });
        }
      }
    } catch (e: any) {
      // skip individual error
    }
  }

  return items;
}
