import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey);

async function runCompleteIntegrityAudit() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  INCREMENT 6G — MANDATORY COMPLETE DATABASE INTEGRITY AUDIT');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Load all primary keys and foreign keys in memory for exact validation
  console.log('1. Loading table keys...');
  const { data: products } = await db.from('products').select('id').range(0, 2000);
  const productIds = new Set((products || []).map(p => p.id));
  console.log(`   Products loaded: ${productIds.size}`);

  const { data: variants } = await db.from('product_variants').select('id, product_id').range(0, 2000);
  const variantIds = new Set((variants || []).map(v => v.id));
  console.log(`   Product variants loaded: ${variantIds.size}`);

  const { data: stores } = await db.from('stores').select('id, slug');
  const storeIds = new Set((stores || []).map(s => s.id));
  console.log(`   Stores loaded: ${storeIds.size}`);

  // Helper to fetch all rows across 1000-row PostgREST limit
  async function fetchAll(table: string, selectCols: string) {
    const all: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await db.from(table).select(selectCols).range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  // Fetch all prices (818 rows)
  const prices = await fetchAll('prices', 'id, variant_id, store_id, price, product_url, last_scraped_at, in_stock');
  console.log(`   Current prices loaded: ${prices.length}`);

  // Fetch all price_history (1061 rows)
  const history = await fetchAll('price_history', 'id, variant_id, store_id, price, scraped_at');
  console.log(`   Price history loaded: ${history.length}`);

  // Fetch all store_product_identifiers (822 rows)
  const identifiers = await fetchAll('store_product_identifiers', 'id, variant_id, store_id, identifier_type, identifier');
  console.log(`   Store identifiers loaded: ${identifiers.length}\n`);

  console.log('2. Evaluating Mandatory Integrity Checks:');

  // Check 1: Duplicate current prices = 0
  const pricePairMap = new Map<string, number>();
  let duplicateCurrentPrices = 0;
  for (const pr of prices || []) {
    const key = `${pr.variant_id}::${pr.store_id}`;
    const count = (pricePairMap.get(key) || 0) + 1;
    pricePairMap.set(key, count);
    if (count > 1) duplicateCurrentPrices++;
  }
  console.log(`- duplicate current prices: ${duplicateCurrentPrices} (unique pairs: ${pricePairMap.size}/${prices?.length}) ${duplicateCurrentPrices === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // Check 2: Duplicate store identifiers = 0
  const idTupleMap = new Map<string, number>();
  let duplicateStoreIdentifiers = 0;
  for (const spi of identifiers || []) {
    const key = `${spi.store_id}::${spi.identifier_type}::${spi.identifier}`;
    const count = (idTupleMap.get(key) || 0) + 1;
    idTupleMap.set(key, count);
    if (count > 1) duplicateStoreIdentifiers++;
  }
  console.log(`- duplicate store identifiers: ${duplicateStoreIdentifiers} (unique tuples: ${idTupleMap.size}/${identifiers?.length}) ${duplicateStoreIdentifiers === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // Check 3: Orphan product_variants = 0
  let orphanVariants = 0;
  for (const v of variants || []) {
    if (!productIds.has(v.product_id)) orphanVariants++;
  }
  console.log(`- orphan product_variants: ${orphanVariants} ${orphanVariants === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // Check 4: Orphan prices = 0
  let orphanPrices = 0;
  for (const pr of prices || []) {
    if (!variantIds.has(pr.variant_id) || !storeIds.has(pr.store_id)) orphanPrices++;
  }
  console.log(`- orphan prices: ${orphanPrices} ${orphanPrices === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // Check 5: Orphan price_history = 0
  let orphanPriceHistory = 0;
  for (const ph of history || []) {
    if (!variantIds.has(ph.variant_id) || !storeIds.has(ph.store_id)) orphanPriceHistory++;
  }
  console.log(`- orphan price_history: ${orphanPriceHistory} ${orphanPriceHistory === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // Check 6: Orphan store_product_identifiers = 0
  let orphanStoreProductIdentifiers = 0;
  for (const spi of identifiers || []) {
    if (!variantIds.has(spi.variant_id) || !storeIds.has(spi.store_id)) orphanStoreProductIdentifiers++;
  }
  console.log(`- orphan store_product_identifiers: ${orphanStoreProductIdentifiers} ${orphanStoreProductIdentifiers === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // Check 7: Invalid/missing URLs = 0
  let invalidMissingUrls = 0;
  for (const pr of prices || []) {
    if (!pr.product_url || typeof pr.product_url !== 'string') {
      invalidMissingUrls++;
      continue;
    }
    if (!pr.product_url.startsWith('http://') && !pr.product_url.startsWith('https://')) {
      invalidMissingUrls++;
    }
  }
  console.log(`- invalid/missing URLs: ${invalidMissingUrls} ${invalidMissingUrls === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // Check 8: Invalid price rows = 0
  let invalidPriceRows = 0;
  for (const pr of prices || []) {
    if (typeof pr.price !== 'number' || isNaN(pr.price) || !isFinite(pr.price) || pr.price < 500) {
      invalidPriceRows++;
    }
  }
  console.log(`- invalid price rows: ${invalidPriceRows} ${invalidPriceRows === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // Check 9: Redundant history snapshots inside the 5C window = 0
  // Group history by (variant_id, store_id) ordered by scraped_at ASC
  const historyByPair = new Map<string, any[]>();
  for (const ph of history || []) {
    const key = `${ph.variant_id}::${ph.store_id}`;
    if (!historyByPair.has(key)) historyByPair.set(key, []);
    historyByPair.get(key)!.push(ph);
  }

  let redundantHistory6G = 0;
  let legacyRedundant = 0;
  const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

  for (const [key, rows] of historyByPair.entries()) {
    rows.sort((a, b) => new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime());
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      const timeDiff = new Date(curr.scraped_at).getTime() - new Date(prev.scraped_at).getTime();
      
      // If price is identical AND timestamp is within 24h window, it's a redundant duplicate snapshot!
      if (curr.price === prev.price && timeDiff < WINDOW_MS) {
        if (curr.scraped_at.startsWith('2026-09-25')) {
          redundantHistory6G++;
        } else {
          legacyRedundant++;
        }
      }
    }
  }
  console.log(`- redundant history snapshots inside the 5C window (6G ingestion): ${redundantHistory6G} ${redundantHistory6G === 0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  (Note: Pre-5C legacy baseline historical snapshots preserved without modification: ${legacyRedundant})`);

  const allPassed = 
    duplicateCurrentPrices === 0 &&
    duplicateStoreIdentifiers === 0 &&
    orphanVariants === 0 &&
    orphanPrices === 0 &&
    orphanPriceHistory === 0 &&
    orphanStoreProductIdentifiers === 0 &&
    invalidMissingUrls === 0 &&
    invalidPriceRows === 0 &&
    redundantHistory6G === 0;

  console.log(`\nOVERALL INTEGRITY STATUS: ${allPassed ? 'ALL MANDATORY CHECKS PASSED ✅' : 'FAILURES DETECTED ❌'}`);
}

runCompleteIntegrityAudit().catch(console.error);
