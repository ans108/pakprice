/**
 * Increment 6P — Pre/Post Apply Audit and Verification Script
 *
 * Captures the exact baseline before and after apply:
 * - Total products, variants, prices, price_history, identifiers
 * - Per-product offer counts for all 49 pilot products
 * - Specific prices for the 5 approved candidate variants
 * - Multi-store counts (products with >= 2 store offers)
 * - Checks for any duplicate (variant_id, store_id) pairs
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const stage = process.argv[2] || 'pre';
  console.log(`════════════════════════════════════════════════════════════════`);
  console.log(`  INCREMENT 6P DB AUDIT — STAGE: ${stage.toUpperCase()}`);
  console.log(`════════════════════════════════════════════════════════════════`);

  // 1. Table Counts
  const [
    { count: productsCount },
    { count: variantsCount },
    { count: pricesCount },
    { count: historyCount },
    { count: identifiersCount },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('product_variants').select('*', { count: 'exact', head: true }),
    supabase.from('prices').select('*', { count: 'exact', head: true }),
    supabase.from('price_history').select('*', { count: 'exact', head: true }),
    supabase.from('store_product_identifiers').select('*', { count: 'exact', head: true }),
  ]);

  console.log(`Table Counts:`);
  console.log(`  products                : ${productsCount}`);
  console.log(`  product_variants        : ${variantsCount}`);
  console.log(`  prices                  : ${pricesCount}`);
  console.log(`  price_history           : ${historyCount}`);
  console.log(`  store_product_identifiers: ${identifiersCount}`);

  // 2. Load pilot 49 products
  const pilotPath = path.resolve(process.cwd(), 'scripts/pilot-50-6p.json');
  const pilot: Array<{ slug: string; name: string }> = JSON.parse(fs.readFileSync(pilotPath, 'utf8'));
  const pilotSlugs = pilot.map(p => p.slug);

  const { data: stores } = await supabase.from('stores').select('id, name, slug');
  const storeMap = new Map((stores || []).map(s => [s.id, s]));

  const { data: dbPilotProducts, error: pErr } = await supabase
    .from('products')
    .select('id, slug, name, product_variants(id, prices(id, store_id, price, in_stock, product_url))')
    .in('slug', pilotSlugs);

  if (pErr) console.error('Error fetching pilot products:', pErr.message);

  let pilotMultiStoreCount = 0;
  let pilotSingleStoreCount = 0;
  let pilotZeroStoreCount = 0;
  const pilotOfferCounts: Record<string, number> = {};

  for (const p of dbPilotProducts || []) {
    const storeSlugs = new Set<string>();
    for (const v of p.product_variants || []) {
      for (const pr of (v.prices as any) || []) {
        const store = storeMap.get(pr.store_id);
        if (store?.slug) storeSlugs.add(store.slug);
      }
    }
    const storeCount = storeSlugs.size;
    pilotOfferCounts[p.slug] = storeCount;
    if (storeCount >= 2) pilotMultiStoreCount++;
    else if (storeCount === 1) pilotSingleStoreCount++;
    else pilotZeroStoreCount++;
  }

  console.log(`\nPilot Set (49 products) Store Coverage:`);
  console.log(`  Multi-store (>=2 stores): ${pilotMultiStoreCount} / ${dbPilotProducts?.length} (${((pilotMultiStoreCount / (dbPilotProducts?.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`  Single-store (1 store)  : ${pilotSingleStoreCount} / ${dbPilotProducts?.length} (${((pilotSingleStoreCount / (dbPilotProducts?.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`  Zero-store (0 stores)   : ${pilotZeroStoreCount} / ${dbPilotProducts?.length}`);

  // 3. Approved 5 products specific state
  const approvedSlugs = [
    'unknown-audionic-spark-pro-s-200-powerbank-20000-mah',
    'unknown-infinix-xw3gt-smart-watch',
    'unknown-zero-ignite-smart-watch',
    'unknown-zero-luna-smart-watch',
    'unknown-zero-visionary-smartwatch',
  ];

  console.log(`\nApproved 5 Products Status:`);
  for (const slug of approvedSlugs) {
    const p = (dbPilotProducts || []).find(x => x.slug === slug);
    if (!p) continue;
    const storesList: string[] = [];
    for (const v of p.product_variants || []) {
      for (const pr of (v.prices as any) || []) {
        const s = storeMap.get(pr.store_id);
        storesList.push(`${s?.slug}: Rs.${pr.price} (id: ${pr.id})`);
      }
    }
    console.log(`  - ${p.name} (${slug})`);
    console.log(`    Stores [${storesList.length}]: ${storesList.join(' | ')}`);
  }

  // 4. Duplicate (variant_id, store_id) check
  const { data: allPrices } = await supabase.from('prices').select('id, variant_id, store_id');
  const seenPairs = new Map<string, string[]>();
  for (const pr of allPrices || []) {
    const key = `${pr.variant_id}::${pr.store_id}`;
    if (!seenPairs.has(key)) seenPairs.set(key, []);
    seenPairs.get(key)!.push(pr.id);
  }
  const duplicates = Array.from(seenPairs.entries()).filter(([_, ids]) => ids.length > 1);
  console.log(`\nIntegrity: Duplicate (variant_id, store_id) price pairs: ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.error('❌ CRITICAL: Found duplicate price pairs:', duplicates);
  } else {
    console.log('✓ Zero duplicate price pairs in DB');
  }

  // Save snapshot to file
  const snapshotFile = path.resolve(process.cwd(), `scripts/audit_snapshot_${stage}.json`);
  fs.writeFileSync(snapshotFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    stage,
    tableCounts: { productsCount, variantsCount, pricesCount, historyCount, identifiersCount },
    pilotCoverage: { pilotMultiStoreCount, pilotSingleStoreCount, pilotZeroStoreCount, total: dbPilotProducts?.length },
    pilotOfferCounts,
    duplicateCount: duplicates.length,
  }, null, 2));
  console.log(`\nSaved ${stage} snapshot to ${snapshotFile}`);
}

main().catch(console.error);
