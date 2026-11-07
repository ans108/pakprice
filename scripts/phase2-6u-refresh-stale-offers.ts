/**
 * Increment 6U — Phase 2: Refresh Stale Offers Across Active Tech Stores
 *
 * Requirements:
 *   - 4 active tech stores: priceoye, shophive, telemart, mega-pk
 *   - Stale threshold: last_scraped_at > 72h or NULL
 *   - Prioritize multi-store products first, followed by single-store products
 *   - Batch: 80–100 stale URLs
 *   - Polite rate limits: 1,500ms default, 4,000ms for Telemart
 *   - Validate via PriceValidator (apps/scraper/src/validation/PriceValidator)
 *   - Deduplicated price_history (only write when price actually changed)
 *   - allowCreate = false (never create new product or variant)
 *   - Report before and after Fresh (<72h) vs Stale (>72h) counts per store
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { validatePrice } from '../apps/scraper/src/validation/PriceValidator';
import { PriceOyeScraper } from '../apps/scraper/src/scrapers/stores/PriceOyeScraper';
import { TelemartScraper } from '../apps/scraper/src/scrapers/stores/TelemartScraper';
import { ShophiveScraper } from '../apps/scraper/src/scrapers/stores/ShophiveScraper';
import { MegaPkScraper } from '../apps/scraper/src/scrapers/stores/MegaPkScraper';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const priceoyeScraper = new PriceOyeScraper();
const telemartScraper = new TelemartScraper();
const shophiveScraper = new ShophiveScraper();
const megaScraper = new MegaPkScraper();

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; PakPriceBot/1.0; +https://pakprice.pk)';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface StalePriceRow {
  id: string;
  variant_id: string;
  store_id: string;
  price: number;
  original_price: number | null;
  product_url: string;
  last_scraped_at: string | null;
  store_slug: string;
  product_id: string;
  product_name: string;
  category_slug?: string;
  is_multistore: boolean;
}

async function getFreshnessReport() {
  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  const { data: prices } = await supabase
    .from('prices')
    .select('id, store_id, last_scraped_at');

  const now = Date.now();
  const thresholdMs = 72 * 60 * 60 * 1000;

  const stats: Record<string, { total: number; fresh: number; stale: number }> = {};
  for (const s of stores || []) {
    stats[s.slug] = { total: 0, fresh: 0, stale: 0 };
  }

  for (const p of prices || []) {
    const slug = storeMap.get(p.store_id) || 'other';
    if (!stats[slug]) stats[slug] = { total: 0, fresh: 0, stale: 0 };
    stats[slug].total++;

    const scrapedAt = p.last_scraped_at ? new Date(p.last_scraped_at).getTime() : 0;
    if ((now - scrapedAt) < thresholdMs) {
      stats[slug].fresh++;
    } else {
      stats[slug].stale++;
    }
  }

  return stats;
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6U — PHASE 2: STALE OFFER REFRESH');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Baseline database integrity check
  const { count: prodCount0 } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCount0 } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`Baseline Database: ${prodCount0} products, ${varCount0} variants (allowCreate=false strictly locked)\n`);

  // Report initial freshness
  const beforeStats = await getFreshnessReport();
  console.log('Freshness BEFORE Refresh (<72h vs >72h):');
  for (const store of ['priceoye', 'shophive', 'telemart', 'mega-pk']) {
    const s = beforeStats[store] || { total: 0, fresh: 0, stale: 0 };
    console.log(`  ${store.padEnd(12)}: Total ${s.total.toString().padStart(4)}, Fresh: ${s.fresh.toString().padStart(4)}, Stale: ${s.stale.toString().padStart(4)}`);
  }

  // Load store ID mappings
  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeIdToSlug = new Map((stores || []).map(s => [s.id, s.slug]));
  const slugToStoreId = new Map((stores || []).map(s => [s.slug, s.id]));

  // Query all active prices with product info to determine multi-store status
  const { data: allPrices, error: priceErr } = await supabase
    .from('prices')
    .select(`
      id, variant_id, store_id, price, original_price, product_url, last_scraped_at,
      product_variants!inner (
        id,
        product_id,
        products!inner (
          id,
          name,
          category_id,
          categories ( slug )
        )
      )
    `);

  if (priceErr || !allPrices) {
    console.error('Failed to load prices:', priceErr);
    process.exit(1);
  }

  // Group by product_id to identify multi-store products
  const productStoreSet = new Map<string, Set<string>>();
  for (const p of allPrices as any[]) {
    const prodId = p.product_variants?.product_id;
    if (!prodId) continue;
    if (!productStoreSet.has(prodId)) productStoreSet.set(prodId, new Set());
    productStoreSet.get(prodId)!.add(p.store_id);
  }

  const multiStoreProductIds = new Set<string>();
  for (const [prodId, sSet] of productStoreSet.entries()) {
    if (sSet.size > 1) multiStoreProductIds.add(prodId);
  }
  console.log(`\nIdentified ${multiStoreProductIds.size} multi-store products in catalog.`);

  // Filter stale prices belonging to the 4 target tech stores
  const targetStoreSlugs = new Set(['priceoye', 'shophive', 'telemart', 'mega-pk']);
  const now = Date.now();
  const thresholdMs = 72 * 60 * 60 * 1000;

  const candidatePrices: StalePriceRow[] = [];
  for (const p of allPrices as any[]) {
    const storeSlug = storeIdToSlug.get(p.store_id);
    if (!storeSlug || !targetStoreSlugs.has(storeSlug)) continue;

    const scrapedAt = p.last_scraped_at ? new Date(p.last_scraped_at).getTime() : 0;
    const isStale = (now - scrapedAt) >= thresholdMs;
    if (!isStale) continue;

    const prod = p.product_variants?.products;
    const prodId = prod?.id || '';
    const isMultiStore = multiStoreProductIds.has(prodId);

    candidatePrices.push({
      id: p.id,
      variant_id: p.variant_id,
      store_id: p.store_id,
      price: p.price,
      original_price: p.original_price,
      product_url: p.product_url,
      last_scraped_at: p.last_scraped_at,
      store_slug: storeSlug,
      product_id: prodId,
      product_name: prod?.name || 'Unknown',
      category_slug: prod?.categories?.slug || 'mobiles',
      is_multistore: isMultiStore,
    });
  }

  // Prioritize multi-store products first, then single-store products
  candidatePrices.sort((a, b) => {
    if (a.is_multistore && !b.is_multistore) return -1;
    if (!a.is_multistore && b.is_multistore) return 1;
    // Secondary sort: oldest last_scraped_at first
    const timeA = a.last_scraped_at ? new Date(a.last_scraped_at).getTime() : 0;
    const timeB = b.last_scraped_at ? new Date(b.last_scraped_at).getTime() : 0;
    return timeA - timeB;
  });

  const BATCH_LIMIT = 90; // Within target 80–100 stale URLs
  const queue = candidatePrices.slice(0, BATCH_LIMIT);

  console.log(`\nSelected ${queue.length} stale prices to refresh:`);
  console.log(`  - Multi-store offers : ${queue.filter(q => q.is_multistore).length}`);
  console.log(`  - Single-store offers: ${queue.filter(q => !q.is_multistore).length}`);

  const byStore: Record<string, number> = {};
  for (const item of queue) {
    byStore[item.store_slug] = (byStore[item.store_slug] || 0) + 1;
  }
  for (const [s, count] of Object.entries(byStore)) {
    console.log(`    * ${s}: ${count} URLs`);
  }

  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('  STARTING DIRECT PDP FETCH & VALIDATION');
  console.log('────────────────────────────────────────────────────────────────\n');

  let refreshedCount = 0;
  let priceChangedCount = 0;
  let historyInsertedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const prefix = `[${(i + 1).toString().padStart(2, '0')}/${queue.length}] [${item.store_slug}]`;

    // Rate limiting delay: 4,000ms for Telemart, 1,500ms for others
    const delayTime = item.store_slug === 'telemart' ? 4000 : 1500;
    if (i > 0) {
      await sleep(delayTime);
    }

    try {
      // Direct HTTP GET
      const res = await axios.get(item.product_url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 15000,
      });

      const html = res.data;
      if (!html || typeof html !== 'string') {
        console.warn(`${prefix} Empty response for ${item.product_url}`);
        failedCount++;
        continue;
      }

      // Extract using store-specific parser
      let extracted: any = null;
      if (item.store_slug === 'priceoye') {
        extracted = priceoyeScraper.extractProductFromHtml(html, item.product_url);
      } else if (item.store_slug === 'shophive') {
        extracted = shophiveScraper.extractProductFromHtml(html, item.product_url, item.category_slug || 'mobiles');
      } else if (item.store_slug === 'telemart') {
        extracted = telemartScraper.extractFromHtml(html, item.product_url);
      } else if (item.store_slug === 'mega-pk') {
        extracted = megaScraper.extractFromHtml(html, item.product_url);
      }

      if (!extracted || !extracted.price || extracted.price <= 0) {
        // Product might be out of stock or price temporarily unlisted
        const isOutOfStock = html.toLowerCase().includes('out of stock') || html.toLowerCase().includes('sold out');
        if (isOutOfStock) {
          await supabase
            .from('prices')
            .update({
              in_stock: false,
              last_scraped_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          console.log(`${prefix} Marked out-of-stock: ${item.product_name}`);
          refreshedCount++;
        } else {
          console.warn(`${prefix} Could not extract price from PDP: ${item.product_url}`);
          failedCount++;
        }
        continue;
      }

      // Validate through PriceValidator
      const validation = validatePrice({
        price: extracted.price,
        originalPrice: extracted.originalPrice || null,
        discountPercent: extracted.discountPercent || null,
        shippingFee: extracted.shippingFee || 0,
        inStock: extracted.inStock !== false,
        stockCount: extracted.stockCount || null,
        previousPrice: item.price,
        previousOriginalPrice: item.original_price,
      });

      if (validation.action === 'rejected') {
        console.warn(`${prefix} ❌ PriceValidator REJECTED: ${validation.rejectReason} (${validation.warnings.join('; ')})`);
        failedCount++;
        continue;
      }

      const newPrice = validation.price;
      const newOrigPrice = validation.originalPrice;
      const newInStock = extracted.inStock !== false;
      const nowIso = new Date().toISOString();

      // Update prices table
      const { error: updateErr } = await supabase
        .from('prices')
        .update({
          price: newPrice,
          original_price: newOrigPrice,
          in_stock: newInStock,
          last_scraped_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', item.id);

      if (updateErr) {
        console.error(`${prefix} DB update error: ${updateErr.message}`);
        failedCount++;
        continue;
      }

      refreshedCount++;

      // Check if price changed -> insert price_history (deduplicated)
      const priceChanged = Math.abs(newPrice - item.price) > 0.01;
      if (priceChanged) {
        priceChangedCount++;
        const { error: histErr } = await supabase.from('price_history').insert({
          variant_id: item.variant_id,
          store_id: item.store_id,
          price: newPrice,
          original_price: newOrigPrice,
          shipping_fee: validation.shippingFee || 0,
          in_stock: newInStock,
          scraped_at: nowIso,
        });

        if (!histErr) {
          historyInsertedCount++;
        }
      }

      const diffLabel = priceChanged
        ? `Rs. ${item.price.toLocaleString()} → Rs. ${newPrice.toLocaleString()} (CHANGED)`
        : `Rs. ${newPrice.toLocaleString()} (UNCHANGED)`;

      console.log(`${prefix} ✓ ${item.product_name.slice(0, 36).padEnd(36)} | ${diffLabel}`);

    } catch (fetchErr: any) {
      console.warn(`${prefix} Fetch error (${fetchErr.message}): ${item.product_url}`);
      failedCount++;
    }
  }

  // Report final results
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  PHASE 2 SUMMARY & INTEGRITY CHECK');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  Processed URLs           : ${queue.length}`);
  console.log(`  Successfully Refreshed   : ${refreshedCount}`);
  console.log(`  Price Changes Observed   : ${priceChangedCount}`);
  console.log(`  Price History Inserted   : ${historyInsertedCount}`);
  console.log(`  Failed / Skipped URLs    : ${failedCount}\n`);

  const afterStats = await getFreshnessReport();
  console.log('Freshness AFTER Refresh (<72h vs >72h):');
  for (const store of ['priceoye', 'shophive', 'telemart', 'mega-pk']) {
    const b = beforeStats[store] || { total: 0, fresh: 0, stale: 0 };
    const a = afterStats[store] || { total: 0, fresh: 0, stale: 0 };
    console.log(`  ${store.padEnd(12)}: Fresh: ${b.fresh.toString().padStart(3)} → ${a.fresh.toString().padStart(3)} | Stale: ${b.stale.toString().padStart(3)} → ${a.stale.toString().padStart(3)}`);
  }

  // Integrity Check
  const { count: prodCountFinal } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCountFinal } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`\nIntegrity Verification:`);
  console.log(`  Products: ${prodCountFinal} (expected ${prodCount0}) ${prodCountFinal === prodCount0 ? '✓' : '❌'}`);
  console.log(`  Variants: ${varCountFinal} (expected ${varCount0}) ${varCountFinal === varCount0 ? '✓' : '❌'}`);

  if (prodCountFinal !== prodCount0 || varCountFinal !== varCount0) {
    console.error('❌ INTEGRITY VIOLATION: Product/variant count changed during Phase 2!');
    process.exit(1);
  }

  console.log('\n✅ Phase 2 completed successfully — stale offers refreshed.\n');
}

main().catch(err => {
  console.error('Fatal error in phase2-6u-refresh-stale-offers:', err);
  process.exit(1);
});

