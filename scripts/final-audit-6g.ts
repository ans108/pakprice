import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { deriveAvailabilityStatus } from '@pakprice/shared';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey);

async function runFinalAudit() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  INCREMENT 6G: FINAL VERIFICATION & DATA INTEGRITY AUDIT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── 1. GLOBAL COUNTS ───────────────────────────────────────────────────────
  const [
    { count: pCount },
    { count: vCount },
    { count: prCount },
    { count: phCount },
    { count: spiCount },
    { count: bCount },
    { count: cCount },
  ] = await Promise.all([
    db.from('products').select('*', { count: 'exact', head: true }),
    db.from('product_variants').select('*', { count: 'exact', head: true }),
    db.from('prices').select('*', { count: 'exact', head: true }),
    db.from('price_history').select('*', { count: 'exact', head: true }),
    db.from('store_product_identifiers').select('*', { count: 'exact', head: true }),
    db.from('brands').select('*', { count: 'exact', head: true }),
    db.from('categories').select('*', { count: 'exact', head: true }),
  ]);

  const { data: allStores } = await db.from('stores').select('*').order('name');
  const activeStores = (allStores || []).filter((s) => s.is_active);

  console.log('1. GLOBAL METRICS');
  console.log(`   Products:                ${pCount} (Baseline: 729, Net: +${pCount! - 729})`);
  console.log(`   Product Variants:        ${vCount} (Baseline: 729, Net: +${vCount! - 729})`);
  console.log(`   Current Prices:          ${prCount} (Baseline: 736, Net: +${prCount! - 736})`);
  console.log(`   Price History Rows:      ${phCount} (Baseline: 967, Net: +${phCount! - 967})`);
  console.log(`   Store Identifiers:       ${spiCount} (Baseline: 740, Net: +${spiCount! - 740})`);
  console.log(`   Brands:                  ${bCount}`);
  console.log(`   Categories:              ${cCount}`);
  console.log(`   Stores (Total):          ${allStores?.length}`);
  console.log(`   Stores (Active):         ${activeStores.length} (${activeStores.map((s) => s.slug).join(', ')})`);

  // ── 2. PER-STORE CATALOG & DATA QUALITY STATS ──────────────────────────────
  const storeMap = new Map<string, { id: string; name: string; slug: string }>();
  for (const s of allStores || []) {
    storeMap.set(s.id, { id: s.id, name: s.name, slug: s.slug });
  }

  const { data: variants } = await db
    .from('product_variants')
    .select(`
      id, product_id, name, ram_gb, storage_gb, color, model_number, gtin, image_url,
      products ( id, name, slug, image_url, category_id, brand_id ),
      prices ( id, store_id, price, original_price, in_stock, last_scraped_at, product_url ),
      store_product_identifiers ( id, store_id, identifier, identifier_type )
    `);

  const storeMetrics: Record<string, {
    name: string;
    productIds: Set<string>;
    variantIds: Set<string>;
    priceCount: number;
    identifierCount: number;
    imagesCount: number;
    modelNumberCount: number;
    inStockCount: number;
    outOfStockCount: number;
    freshCount: number;
    staleCount: number;
    unknownCount: number;
    missingUrlsCount: number;
  }> = {};

  for (const s of allStores || []) {
    storeMetrics[s.slug] = {
      name: s.name,
      productIds: new Set(),
      variantIds: new Set(),
      priceCount: 0,
      identifierCount: 0,
      imagesCount: 0,
      modelNumberCount: 0,
      inStockCount: 0,
      outOfStockCount: 0,
      freshCount: 0,
      staleCount: 0,
      unknownCount: 0,
      missingUrlsCount: 0,
    };
  }

  const productStoreCounts = new Map<string, Set<string>>();
  const variantStoreCounts = new Map<string, Set<string>>();
  const multiStoreVariants: any[] = [];
  const storePairCounts: Record<string, number> = {};

  let totalDuplicatePrices = 0;
  const seenVariantStore = new Set<string>();

  for (const v of variants || []) {
    const prod = v.products as any;
    const vPrices = v.prices || [];
    const vIdents = v.store_product_identifiers || [];

    const distinctStoresForVariant = new Set<string>();

    for (const p of vPrices) {
      const store = storeMap.get(p.store_id);
      if (!store) continue;
      const m = storeMetrics[store.slug];
      if (!m) continue;

      // Duplicate price check
      const vsKey = `${v.id}::${p.store_id}`;
      if (seenVariantStore.has(vsKey)) totalDuplicatePrices++;
      seenVariantStore.add(vsKey);

      distinctStoresForVariant.add(store.slug);
      m.priceCount++;
      m.variantIds.add(v.id);
      if (prod?.id) {
        m.productIds.add(prod.id);
        if (!productStoreCounts.has(prod.id)) {
          productStoreCounts.set(prod.id, new Set());
        }
        productStoreCounts.get(prod.id)!.add(store.slug);
      }

      if (v.image_url || prod?.image_url) m.imagesCount++;
      if (v.model_number) m.modelNumberCount++;
      if (p.in_stock) m.inStockCount++;
      else m.outOfStockCount++;

      const freshness = deriveAvailabilityStatus(p.in_stock, p.last_scraped_at);
      if (freshness === 'in_stock' || freshness === 'out_of_stock') {
        m.freshCount++;
      } else if (freshness === 'stale') {
        m.staleCount++;
      } else {
        m.unknownCount++;
      }

      if (!p.product_url) m.missingUrlsCount++;
    }

    for (const ident of vIdents) {
      const store = storeMap.get(ident.store_id);
      if (!store) continue;
      const m = storeMetrics[store.slug];
      if (m) m.identifierCount++;
    }

    if (distinctStoresForVariant.size >= 2) {
      variantStoreCounts.set(v.id, distinctStoresForVariant);
      multiStoreVariants.push({
        variantId: v.id,
        productName: prod?.name,
        stores: Array.from(distinctStoresForVariant),
        prices: vPrices.map((p: any) => ({
          store: storeMap.get(p.store_id)?.slug,
          price: p.price,
          inStock: p.in_stock,
          url: p.product_url,
        })),
      });

      const storeArr = Array.from(distinctStoresForVariant);
      for (let i = 0; i < storeArr.length; i++) {
        for (let j = i + 1; j < storeArr.length; j++) {
          const pair = [storeArr[i], storeArr[j]].sort().join(' ↔ ');
          storePairCounts[pair] = (storePairCounts[pair] || 0) + 1;
        }
      }
    }
  }

  console.log('\n2. PER-STORE CATALOG BREAKDOWN:');
  console.log('-------------------------------------------------------------------------------------------------------------------');
  console.log('| Store Slug | Name       | Products | Variants | Prices | Identifiers | In-Stock | Fresh | Stale | Missing URLs |');
  console.log('-------------------------------------------------------------------------------------------------------------------');
  for (const [slug, m] of Object.entries(storeMetrics)) {
    if (m.priceCount > 0) {
      console.log(
        `| ${slug.padEnd(10)} | ${m.name.padEnd(10)} | ${m.productIds.size.toString().padStart(8)} | ${m.variantIds.size.toString().padStart(8)} | ${m.priceCount.toString().padStart(6)} | ${m.identifierCount.toString().padStart(11)} | ${m.inStockCount.toString().padStart(8)} | ${m.freshCount.toString().padStart(5)} | ${m.staleCount.toString().padStart(5)} | ${m.missingUrlsCount.toString().padStart(12)} |`
      );
    }
  }
  console.log('-------------------------------------------------------------------------------------------------------------------');

  console.log('\n3. DATA INTEGRITY AUDIT:');
  console.log(`   Duplicate Prices on (variant_id, store_id): ${totalDuplicatePrices} ${totalDuplicatePrices === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // Identifier duplicate check
  const { data: allIdentifiers } = await db.from('store_product_identifiers').select('id, store_id, identifier_type, identifier');
  const idKeySet = new Set<string>();
  let duplicateIdentifiers = 0;
  for (const idRow of allIdentifiers || []) {
    const key = `${idRow.store_id}::${idRow.identifier_type}::${idRow.identifier}`;
    if (idKeySet.has(key)) duplicateIdentifiers++;
    idKeySet.add(key);
  }
  console.log(`   Duplicate Identifiers on (store_id, type, val): ${duplicateIdentifiers} ${duplicateIdentifiers === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // Multi-store counts
  console.log('\n4. MULTI-STORE & CANONICAL OVERLAP:');
  console.log(`   Baseline Multi-Store Variants (6E): 10`);
  console.log(`   Post-6G Multi-Store Variants:       ${multiStoreVariants.length} (+${multiStoreVariants.length - 10})`);
  console.log(`   Store-Pair Matrix:`);
  for (const [pair, cnt] of Object.entries(storePairCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`     - ${pair.padEnd(25)}: ${cnt} variant(s)`);
  }

  const productsWith3Stores = Array.from(productStoreCounts.entries()).filter(([_, s]) => s.size >= 3);
  const variantsWith3Stores = Array.from(variantStoreCounts.entries()).filter(([_, s]) => s.size >= 3);
  console.log(`\n   Canonical Products with 3+ Stores: ${productsWith3Stores.length}`);
  console.log(`   Product Variants with 3+ Stores:   ${variantsWith3Stores.length}`);
}

runFinalAudit().catch(console.error);
