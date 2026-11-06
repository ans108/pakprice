import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { deriveAvailabilityStatus } from '@pakprice/shared';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const db = createClient(supabaseUrl, supabaseKey);

async function runPhase0Audit() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  INCREMENT 6G: PHASE 0 — COMPREHENSIVE READ-ONLY BASELINE AUDIT');
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
  const inactiveStores = (allStores || []).filter((s) => !s.is_active);

  console.log('1. GLOBAL METRICS');
  console.log(`   Products:                ${pCount}`);
  console.log(`   Product Variants:        ${vCount}`);
  console.log(`   Current Prices:          ${prCount}`);
  console.log(`   Price History Rows:      ${phCount}`);
  console.log(`   Store Identifiers:       ${spiCount}`);
  console.log(`   Brands:                  ${bCount}`);
  console.log(`   Categories:              ${cCount}`);
  console.log(`   Stores (Total):          ${allStores?.length}`);
  console.log(`   Stores (Active):         ${activeStores.length} (${activeStores.map((s) => s.slug).join(', ')})`);
  console.log(`   Stores (Inactive):       ${inactiveStores.length} (${inactiveStores.map((s) => s.slug).join(', ') || 'none'})`);

  // ── 2. PER-STORE CATALOG & DATA QUALITY STATS ──────────────────────────────
  const storeMap = new Map<string, { id: string; name: string; slug: string }>();
  for (const s of allStores || []) {
    storeMap.set(s.id, { id: s.id, name: s.name, slug: s.slug });
  }

  // Load all products, variants, prices, and identifiers
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

  // Multi-store tracking
  const productStoreCounts = new Map<string, Set<string>>();
  const variantStoreCounts = new Map<string, Set<string>>();
  const multiStoreVariantsList: { variantId: string; productName: string; stores: string[] }[] = [];

  // Data quality checks
  let missingProductUrls = 0;
  let missingImagesOnVariantAndProduct = 0;
  let stalePricesTotal = 0;

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

      if (!p.product_url) {
        m.missingUrlsCount++;
        missingProductUrls++;
      }

      // 5C Freshness
      const avail = deriveAvailabilityStatus(p.in_stock, p.last_scraped_at, 72);
      if (avail === 'in_stock') m.freshCount++;
      else if (avail === 'stale') {
        m.staleCount++;
        stalePricesTotal++;
      } else if (avail === 'unknown') m.unknownCount++;
    }

    variantStoreCounts.set(v.id, distinctStoresForVariant);

    if (distinctStoresForVariant.size >= 2) {
      multiStoreVariantsList.push({
        variantId: v.id,
        productName: prod?.name || 'Unknown',
        stores: Array.from(distinctStoresForVariant),
      });
    }

    if (!v.image_url && !prod?.image_url) {
      missingImagesOnVariantAndProduct++;
    }

    for (const iden of vIdents) {
      const store = storeMap.get(iden.store_id);
      if (store && storeMetrics[store.slug]) {
        storeMetrics[store.slug].identifierCount++;
      }
    }
  }

  console.log('\n2. PER-STORE CATALOG & QUALITY DISTRIBUTION');
  for (const [slug, m] of Object.entries(storeMetrics)) {
    if (m.priceCount === 0 && m.productIds.size === 0) continue;
    const totalP = m.priceCount || 1;
    console.log(`   ─────────────────────────────────────────────────────────────`);
    console.log(`   STORE: ${m.name} (${slug})`);
    console.log(`     Products:            ${m.productIds.size}`);
    console.log(`     Variants:            ${m.variantIds.size}`);
    console.log(`     Current Prices:      ${m.priceCount}`);
    console.log(`     Store Identifiers:   ${m.identifierCount}`);
    console.log(`     Image Coverage:      ${m.imagesCount}/${m.priceCount} (${((m.imagesCount / totalP) * 100).toFixed(1)}%)`);
    console.log(`     Model-No Coverage:   ${m.modelNumberCount}/${m.priceCount} (${((m.modelNumberCount / totalP) * 100).toFixed(1)}%)`);
    console.log(`     In-Stock Rate:       ${m.inStockCount}/${m.priceCount} (${((m.inStockCount / totalP) * 100).toFixed(1)}%)`);
    console.log(`     Freshness (≤72h):    ${m.freshCount} fresh, ${m.staleCount} stale, ${m.unknownCount} unknown`);
    console.log(`     Missing URLs:        ${m.missingUrlsCount}`);
  }

  // ── 3. CROSS-STORE AGGREGATION & OVERLAP MATRIX ───────────────────────────
  let p1Store = 0, p2Store = 0, p3Store = 0, p4PlusStore = 0;
  for (const [, storesSet] of productStoreCounts) {
    if (storesSet.size === 1) p1Store++;
    else if (storesSet.size === 2) p2Store++;
    else if (storesSet.size === 3) p3Store++;
    else if (storesSet.size >= 4) p4PlusStore++;
  }

  let v1Store = 0, v2Store = 0, v3Store = 0, v4PlusStore = 0;
  for (const [, storesSet] of variantStoreCounts) {
    if (storesSet.size === 1) v1Store++;
    else if (storesSet.size === 2) v2Store++;
    else if (storesSet.size === 3) v3Store++;
    else if (storesSet.size >= 4) v4PlusStore++;
  }

  console.log('\n3. CANONICAL PRODUCT & VARIANT STORE MULTIPLICITY');
  console.log(`   Products with 1 store:   ${p1Store}`);
  console.log(`   Products with 2 stores:  ${p2Store}`);
  console.log(`   Products with 3 stores:  ${p3Store}`);
  console.log(`   Products with 4+ stores: ${p4PlusStore}`);
  console.log(`   Variants with 1 store:   ${v1Store}`);
  console.log(`   Variants with 2 stores:  ${v2Store}`);
  console.log(`   Variants with 3 stores:  ${v3Store}`);
  console.log(`   Total Multi-Store Variants: ${v2Store + v3Store + v4PlusStore}`);

  // Store-Pair Overlap Matrix
  const activeSlugs = Object.keys(storeMetrics).filter((k) => storeMetrics[k].priceCount > 0);
  console.log('\n4. CROSS-STORE OVERLAP MATRIX (Store-Pair Variant Count)');
  for (let i = 0; i < activeSlugs.length; i++) {
    for (let j = i + 1; j < activeSlugs.length; j++) {
      const sA = activeSlugs[i];
      const sB = activeSlugs[j];
      let overlapCount = 0;
      for (const mv of multiStoreVariantsList) {
        if (mv.stores.includes(sA) && mv.stores.includes(sB)) {
          overlapCount++;
        }
      }
      console.log(`   ${sA} ↔ ${sB}: ${overlapCount} verified variants`);
    }
  }

  console.log('\n5. VERIFIED MULTI-STORE VARIANTS LIST');
  for (const mv of multiStoreVariantsList) {
    console.log(`   - [${mv.variantId}] "${mv.productName}" -> Stores: [${mv.stores.join(', ')}]`);
  }

  // ── 4. DATA INTEGRITY & AUDIT CHECKS ──────────────────────────────────────
  // Check for duplicate current prices on same (variant_id, store_id)
  const { data: allRawPrices } = await db.from('prices').select('id, variant_id, store_id');
  const priceKeyMap = new Map<string, string[]>();
  for (const pr of allRawPrices || []) {
    const key = `${pr.variant_id}::${pr.store_id}`;
    if (!priceKeyMap.has(key)) priceKeyMap.set(key, []);
    priceKeyMap.get(key)!.push(pr.id);
  }
  let duplicatePricesCount = 0;
  for (const [key, ids] of priceKeyMap) {
    if (ids.length > 1) {
      duplicatePricesCount += ids.length - 1;
      console.error(`   ❌ Duplicate price rows on ${key}: ${ids.join(', ')}`);
    }
  }

  // Check for duplicate identifiers on same (store_id, identifier_type, identifier)
  const { data: allRawIdents } = await db.from('store_product_identifiers').select('id, store_id, identifier_type, identifier');
  const identKeyMap = new Map<string, string[]>();
  for (const iden of allRawIdents || []) {
    const key = `${iden.store_id}::${iden.identifier_type}::${iden.identifier}`;
    if (!identKeyMap.has(key)) identKeyMap.set(key, []);
    identKeyMap.get(key)!.push(iden.id);
  }
  let duplicateIdentsCount = 0;
  for (const [key, ids] of identKeyMap) {
    if (ids.length > 1) {
      duplicateIdentsCount += ids.length - 1;
      console.error(`   ❌ Duplicate identifier on ${key}: ${ids.join(', ')}`);
    }
  }

  // Check for orphan variants (variant without product)
  const { data: orphanVariants } = await db.from('product_variants').select('id, product_id').is('product_id', null);
  // Check for orphan prices (price without variant or store)
  const { data: orphanPrices } = await db.from('prices').select('id, variant_id, store_id').or('variant_id.is.null,store_id.is.null');

  console.log('\n6. DATA INTEGRITY AUDIT');
  console.log(`   Duplicate Prices on (variant_id, store_id):  ${duplicatePricesCount}`);
  console.log(`   Duplicate Identifiers:                       ${duplicateIdentsCount}`);
  console.log(`   Orphan Variants (product_id is null):        ${orphanVariants?.length || 0}`);
  console.log(`   Orphan Prices (variant/store is null):       ${orphanPrices?.length || 0}`);
  console.log(`   Missing Product URLs:                        ${missingProductUrls}`);
  console.log(`   Variants missing both variant/product image: ${missingImagesOnVariantAndProduct}`);
  console.log(`   Total Stale Prices (>72h):                   ${stalePricesTotal}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  PHASE 0 AUDIT COMPLETED (READ-ONLY)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runPhase0Audit().catch((err) => {
  console.error('Fatal error during Phase 0 audit:', err);
  process.exit(1);
});
