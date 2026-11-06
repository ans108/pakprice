/**
 * Phase 0 — Increment 6Q Baseline Audit & Database State Verification
 *
 * Usage: npx tsx scripts/phase0-6q-baseline.ts
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

function sep(title: string) {
  console.log('\n' + '═'.repeat(64));
  console.log(`  ${title}`);
  console.log('═'.repeat(64));
}

async function main() {
  sep('PHASE 0 — INCREMENT 6Q DATABASE VERIFICATION');
  console.log(`  Timestamp: ${new Date().toISOString()}`);

  // 1. Core table counts
  const [
    { count: productsCount },
    { count: variantsCount },
    { count: pricesCount },
    { count: historyCount },
    { count: identifiersCount },
    { count: storesCount },
    { count: categoriesCount },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('product_variants').select('*', { count: 'exact', head: true }),
    supabase.from('prices').select('*', { count: 'exact', head: true }),
    supabase.from('price_history').select('*', { count: 'exact', head: true }),
    supabase.from('store_product_identifiers').select('*', { count: 'exact', head: true }),
    supabase.from('stores').select('*', { count: 'exact', head: true }),
    supabase.from('categories').select('*', { count: 'exact', head: true }),
  ]);

  sep('1. CORE TABLE COUNTS');
  const expected = {
    products: 822,
    variants: 822,
    prices: 854,
    history: 1123,
    identifiers: 859,
  };

  console.log(`  products                 : ${productsCount}  (expected: ${expected.products}, Δ=${Number(productsCount) - expected.products})`);
  console.log(`  product_variants         : ${variantsCount}  (expected: ${expected.variants}, Δ=${Number(variantsCount) - expected.variants})`);
  console.log(`  prices                   : ${pricesCount}  (expected: ${expected.prices}, Δ=${Number(pricesCount) - expected.prices})`);
  console.log(`  price_history            : ${historyCount}  (expected: ${expected.history}, Δ=${Number(historyCount) - expected.history})`);
  console.log(`  store_product_identifiers : ${identifiersCount}  (expected: ${expected.identifiers}, Δ=${Number(identifiersCount) - expected.identifiers})`);
  console.log(`  stores                   : ${storesCount}`);
  console.log(`  categories               : ${categoriesCount}`);

  // 2. Confirm the 5 Increment 6P price records
  sep('2. CONFIRM INCREMENT 6P PERSISTED OFFERS (5 records)');
  const expected6POffers = [
    {
      name: 'Audionic Spark Pro S-200 powerbank 20000 mAh',
      slug: 'unknown-audionic-spark-pro-s-200-powerbank-20000-mah',
      variantId: '2054576d-c4d4-4f9e-98b8-44e69e427ec3',
      storeSlug: 'telemart',
      expectedPrice: 4499,
      priceId: '08fcdb52-ddfa-43c1-a920-a681cc904feb'
    },
    {
      name: 'Infinix XW3GT Smart Watch',
      slug: 'unknown-infinix-xw3gt-smart-watch',
      variantId: '200dece0-c73a-46ad-ab61-becb070f15b0',
      storeSlug: 'shophive',
      expectedPrice: 5099,
      priceId: '4d17bbd1-ccb8-46ee-b9b2-e6e193d70ffe'
    },
    {
      name: 'Zero Ignite Smart Watch',
      slug: 'unknown-zero-ignite-smart-watch',
      variantId: '1e4e35dd-88f2-461f-99db-856c003d1a8d',
      storeSlug: 'shophive',
      expectedPrice: 5999,
      priceId: '9027d59c-3eec-4598-a8dd-f1ef967d5f73'
    },
    {
      name: 'Zero Luna Smart Watch',
      slug: 'unknown-zero-luna-smart-watch',
      variantId: '31609039-4ae4-44f4-8fe4-498fa4e29ce3',
      storeSlug: 'shophive',
      expectedPrice: 5999,
      priceId: '5dfb9397-a734-4391-a4f9-ee458f0c46d5'
    },
    {
      name: 'Zero Visionary Smartwatch',
      slug: 'unknown-zero-visionary-smartwatch',
      variantId: 'f090b6e2-14cd-4d6b-a031-7f2cee86b9f1',
      storeSlug: 'shophive',
      expectedPrice: 13999,
      priceId: '97edbb84-1d66-43d0-a2ae-94708733219b'
    }
  ];

  const { data: stores } = await supabase.from('stores').select('id, name, slug');
  const storeMap = new Map((stores || []).map(s => [s.slug, s]));
  const storeIdMap = new Map((stores || []).map(s => [s.id, s]));

  let confirmed6PCount = 0;
  for (const exp of expected6POffers) {
    const store = storeMap.get(exp.storeSlug);
    const { data: priceRow, error } = await supabase
      .from('prices')
      .select('*, variant:product_variants(id, product:products(id, name, slug))')
      .eq('id', exp.priceId)
      .single();

    if (error || !priceRow) {
      console.log(`  ❌ Missing price row ${exp.priceId} for ${exp.name}`);
      continue;
    }

    const priceMatch = priceRow.price === exp.expectedPrice;
    const variantMatch = priceRow.variant_id === exp.variantId;
    const storeMatch = priceRow.store_id === store?.id;

    console.log(`  ✓ [${exp.storeSlug}] ${exp.name}:`);
    console.log(`      Price ID    : ${priceRow.id}`);
    console.log(`      Variant ID  : ${priceRow.variant_id} ${variantMatch ? '✓' : '❌'}`);
    console.log(`      Store ID    : ${priceRow.store_id} (${store?.name}) ${storeMatch ? '✓' : '❌'}`);
    console.log(`      Price       : Rs. ${priceRow.price} ${priceMatch ? '✓' : '❌'}`);
    console.log(`      In Stock    : ${priceRow.in_stock}`);
    console.log(`      Product URL : ${priceRow.product_url}`);
    console.log(`      Last Scraped: ${priceRow.last_scraped_at}`);

    if (priceMatch && variantMatch && storeMatch) confirmed6PCount++;
  }
  console.log(`\n  Verified: ${confirmed6PCount} / 5 Increment 6P records match live database perfectly`);

  // 3. Relational integrity: duplicate (variant_id, store_id) pairs
  sep('3. RELATIONAL INTEGRITY — DUPLICATE (variant_id, store_id) CHECK');
  const { data: allPrices } = await supabase.from('prices').select('id, variant_id, store_id');
  const pairMap = new Map<string, string[]>();
  for (const p of allPrices || []) {
    const key = `${p.variant_id}::${p.store_id}`;
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key)!.push(p.id);
  }
  const duplicates = Array.from(pairMap.entries()).filter(([_, ids]) => ids.length > 1);
  console.log(`  Total price rows checked : ${allPrices?.length}`);
  console.log(`  Unique (variant, store)  : ${pairMap.size}`);
  console.log(`  Duplicate pairs          : ${duplicates.length}`);
  if (duplicates.length === 0) {
    console.log(`  ✓ Integrity PASS: Zero duplicate (variant_id, store_id) pairs exist`);
  } else {
    console.error(`  ❌ Integrity FAIL: ${duplicates.length} duplicate pairs found!`);
  }

  // 4. Global distribution: products with 0, 1, 2, 3, 4+ offers across the ENTIRE catalog (822 products)
  sep('4. GLOBAL CATALOG OFFER DISTRIBUTION (822 Products)');
  const { data: allProducts } = await supabase
    .from('products')
    .select('id, name, slug, product_variants(id, prices(id, store_id))');

  const storeOfferDistribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const singleStoreByStore: Record<string, number> = {};
  let totalMultiStoreProducts = 0; // >= 2 stores

  for (const prod of allProducts || []) {
    const distinctStores = new Set<string>();
    for (const v of prod.product_variants || []) {
      for (const pr of (v.prices as any) || []) {
        const s = storeIdMap.get(pr.store_id);
        if (s?.slug) distinctStores.add(s.slug);
      }
    }

    const count = distinctStores.size;
    if (count >= 4) {
      storeOfferDistribution[4] = (storeOfferDistribution[4] || 0) + 1;
    } else {
      storeOfferDistribution[count] = (storeOfferDistribution[count] || 0) + 1;
    }

    if (count >= 2) {
      totalMultiStoreProducts++;
    }

    if (count === 1) {
      const sourceStore = Array.from(distinctStores)[0];
      singleStoreByStore[sourceStore] = (singleStoreByStore[sourceStore] || 0) + 1;
    }
  }

  const totalProds = allProducts?.length || 822;
  console.log(`  Distribution of verified store offers per canonical product:`);
  console.log(`    0 stores : ${storeOfferDistribution[0]} (${((storeOfferDistribution[0] / totalProds) * 100).toFixed(1)}%)`);
  console.log(`    1 store  : ${storeOfferDistribution[1]} (${((storeOfferDistribution[1] / totalProds) * 100).toFixed(1)}%)`);
  console.log(`    2 stores : ${storeOfferDistribution[2]} (${((storeOfferDistribution[2] / totalProds) * 100).toFixed(1)}%)`);
  console.log(`    3 stores : ${storeOfferDistribution[3]} (${((storeOfferDistribution[3] / totalProds) * 100).toFixed(1)}%)`);
  console.log(`    4+ stores: ${storeOfferDistribution[4]} (${((storeOfferDistribution[4] / totalProds) * 100).toFixed(1)}%)`);

  console.log(`\n  Global Multi-Store Coverage (>=2 stores):`);
  console.log(`    ${totalMultiStoreProducts} / ${totalProds} products (${((totalMultiStoreProducts / totalProds) * 100).toFixed(2)}%)`);
  console.log(`    (Increment 6P baseline was 24 / 822 = 2.92%; net increase = +1 multi-store product)`);

  sep('5. SINGLE-STORE PRODUCTS BREAKDOWN (Available for Phase 2 Pilot Selection)');
  console.log(`  Total single-store products: ${storeOfferDistribution[1]}`);
  for (const [store, count] of Object.entries(singleStoreByStore)) {
    console.log(`    ${store.padEnd(20)} : ${count} products`);
  }
}

main().catch(console.error);
