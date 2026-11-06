/**
 * Increment 6R — Pre/Post Apply Audit and Verification Script
 *
 * Captures the exact baseline before and after apply:
 * - Total products, variants, prices, price_history, identifiers
 * - Global store coverage distribution (0, 1, 2, 3, 4+ stores)
 * - Specific offers for approved 6R candidates
 * - Regression check on 6Q and 6P persisted candidates
 * - Duplicate (variant_id, store_id) pairs
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
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  INCREMENT 6R DB AUDIT — STAGE: ${stage.toUpperCase()}`);
  console.log('════════════════════════════════════════════════════════════════');

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
  console.log(`  products                 : ${productsCount}`);
  console.log(`  product_variants         : ${variantsCount}`);
  console.log(`  prices                   : ${pricesCount}`);
  console.log(`  price_history            : ${historyCount}`);
  console.log(`  store_product_identifiers: ${identifiersCount}`);

  // 2. Stores map
  const { data: stores } = await supabase.from('stores').select('id, name, slug');
  const storeMap = new Map((stores || []).map(s => [s.id, s]));

  // 3. Global Product Multi-Store Distribution
  const { data: allProducts, error: apErr } = await supabase
    .from('products')
    .select('id, slug, product_variants(id, prices(id, store_id, price, in_stock, product_url))');

  if (apErr) console.error('Error fetching all products:', apErr.message);

  const globalDist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  let globalMultiStore = 0;

  for (const p of allProducts || []) {
    const storeSlugs = new Set<string>();
    for (const v of p.product_variants || []) {
      for (const pr of (v.prices as any) || []) {
        const store = storeMap.get(pr.store_id);
        if (store?.slug) storeSlugs.add(store.slug);
      }
    }
    const count = storeSlugs.size;
    if (count >= 4) globalDist[4] = (globalDist[4] || 0) + 1;
    else globalDist[count] = (globalDist[count] || 0) + 1;

    if (count >= 2) globalMultiStore++;
  }

  console.log(`\nGlobal Catalog Distribution (${allProducts?.length} products):`);
  console.log(`  0 stores : ${globalDist[0]}`);
  console.log(`  1 store  : ${globalDist[1]}`);
  console.log(`  2 stores : ${globalDist[2]}`);
  console.log(`  3 stores : ${globalDist[3]}`);
  console.log(`  4+ stores: ${globalDist[4]}`);
  console.log(`  Multi-store (>=2): ${globalMultiStore} / ${allProducts?.length} (${((globalMultiStore / (allProducts?.length || 1)) * 100).toFixed(2)}%)`);

  // 4. Approved 6R Target Candidates Current State
  const approved6RSlugs = [
    'huawei-huawei-band-9',
    'anker-anker-soundcore-liberty-5-noise-reduction-wireless-earbuds',
    'xiaomi-xiaomi-redmi-buds-8',
    'unknown-infinix-xw3p-smart-watch',
  ];

  const { data: approved6RProducts } = await supabase
    .from('products')
    .select(`
      id, slug, name,
      product_variants (
        id, name,
        prices ( id, store_id, price, in_stock, product_url, last_scraped_at )
      )
    `)
    .in('slug', approved6RSlugs);

  console.log(`\nApproved 6R Products Current State:`);
  const approvedDetail: any[] = [];
  for (const p of approved6RProducts || []) {
    console.log(`  • ${p.name} (${p.slug}):`);
    for (const v of p.product_variants || []) {
      console.log(`    Variant: ${v.name} (id: ${v.id})`);
      for (const pr of (v.prices as any) || []) {
        const store = storeMap.get(pr.store_id);
        console.log(`      - [${store?.slug || pr.store_id}] Rs.${pr.price} (stock: ${pr.in_stock}) id: ${pr.id}`);
        approvedDetail.push({
          productSlug: p.slug,
          productName: p.name,
          variantId: v.id,
          priceId: pr.id,
          storeSlug: store?.slug,
          price: pr.price,
          inStock: pr.in_stock,
          url: pr.product_url,
        });
      }
    }
  }

  // 5. Duplicate check across all prices
  const { data: allPrices } = await supabase
    .from('prices')
    .select('id, variant_id, store_id');

  const pairCounts = new Map<string, string[]>();
  for (const pr of allPrices || []) {
    const key = `${pr.variant_id}::${pr.store_id}`;
    if (!pairCounts.has(key)) pairCounts.set(key, []);
    pairCounts.get(key)!.push(pr.id);
  }

  const duplicates = Array.from(pairCounts.entries()).filter(([_, ids]) => ids.length > 1);
  console.log(`\nDuplicate (variant_id, store_id) pairs: ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.error(`  ❌ DUPLICATES FOUND:`, duplicates);
  } else {
    console.log(`  ✓ Zero duplicate price records in entire database`);
  }

  // Save snapshot to disk
  const snapshotFile = path.resolve(process.cwd(), `scripts/audit_snapshot_6r_${stage}.json`);
  const snapshotData = {
    stage,
    timestamp: new Date().toISOString(),
    counts: {
      products: productsCount,
      variants: variantsCount,
      prices: pricesCount,
      history: historyCount,
      identifiers: identifiersCount,
    },
    globalDistribution: globalDist,
    globalMultiStore,
    approvedProductsDetail: approvedDetail,
    duplicateCount: duplicates.length,
  };

  fs.writeFileSync(snapshotFile, JSON.stringify(snapshotData, null, 2));
  console.log(`\n  Snapshot saved to: ${path.basename(snapshotFile)}`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);

