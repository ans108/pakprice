import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function verify() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PAKPRICE INCREMENT 6U — FINAL VERIFICATION AUDIT');
  console.log('════════════════════════════════════════════════════════════════\n');

  // 1. Products & Variants counts
  const { count: prodCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
  const { count: varCount } = await supabase.from('product_variants').select('*', { count: 'exact', head: true });
  console.log(`1. Catalog Integrity:`);
  console.log(`   Canonical Products : ${prodCount} (strictly locked at 822)`);
  console.log(`   Product Variants   : ${varCount} (strictly locked at 822)`);

  // 2. Duplicate (variant_id, store_id) pairs check in prices
  const { data: allPrices } = await supabase.from('prices').select('id, variant_id, store_id, price, last_scraped_at, stores(slug)');
  const pairMap = new Map<string, number>();
  for (const p of allPrices || []) {
    const key = `${p.variant_id}:${p.store_id}`;
    pairMap.set(key, (pairMap.get(key) || 0) + 1);
  }
  let dupCount = 0;
  for (const count of pairMap.values()) {
    if (count > 1) dupCount++;
  }
  console.log(`   Duplicate (variant_id, store_id) pairs: ${dupCount} (strictly 0)`);

  // 3. Brand enrichment
  const { count: brandCount } = await supabase.from('brands').select('*', { count: 'exact', head: true });
  const { count: nullBrandCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).is('brand_id', null);
  console.log(`\n2. Brand & Category Enrichment:`);
  console.log(`   Total Brands in DB : ${brandCount} (Baseline: 59)`);
  console.log(`   Products with brand_id IS NULL: ${nullBrandCount} (Baseline: 364)`);

  // 4. Category enrichment
  const { count: nullCategoryCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).is('category_id', null);
  console.log(`   Products with category_id IS NULL: ${nullCategoryCount} (Baseline: 264)`);

  // 5. Total Prices & Price History
  const { count: priceHistoryCount } = await supabase.from('price_history').select('*', { count: 'exact', head: true });
  console.log(`\n3. Pricing & Offers:`);
  console.log(`   Active Prices rows : ${allPrices?.length} (Baseline: 874)`);
  console.log(`   Price History rows : ${priceHistoryCount} (Baseline: 1143)`);

  // 6. Fresh vs Stale per store
  const now = Date.now();
  const thresholdMs = 72 * 60 * 60 * 1000;
  const storeFreshness: Record<string, { fresh: number; stale: number }> = {};
  for (const p of allPrices || []) {
    const sSlug = (p.stores as any)?.slug || 'unknown';
    if (!storeFreshness[sSlug]) storeFreshness[sSlug] = { fresh: 0, stale: 0 };
    const age = p.last_scraped_at ? now - new Date(p.last_scraped_at).getTime() : Infinity;
    if (age <= thresholdMs) {
      storeFreshness[sSlug].fresh++;
    } else {
      storeFreshness[sSlug].stale++;
    }
  }
  console.log(`\n4. Offer Freshness (<72h Fresh vs >72h Stale):`);
  for (const [s, f] of Object.entries(storeFreshness)) {
    console.log(`   - ${s.padEnd(12)}: Fresh = ${f.fresh.toString().padStart(3)}, Stale = ${f.stale.toString().padStart(3)} (Total: ${f.fresh + f.stale})`);
  }

  // 7. Multi-Store Coverage Breakdown
  const { data: prodVariants } = await supabase
    .from('products')
    .select(`
      id, name, slug, brand_id, category_id,
      brands ( name ),
      categories ( name, slug ),
      product_variants (
        id,
        prices ( id, store_id, price, stores(slug) )
      )
    `);

  const storeCountBuckets: Record<string, number> = { '1 store': 0, '2 stores': 0, '3 stores': 0, '4+ stores': 0 };
  const multiByCategory: Record<string, { total: number; multi: number }> = {};
  let totalMulti = 0;
  const multiProductsList: any[] = [];

  for (const p of prodVariants || []) {
    const catSlug = p.categories?.slug || 'unknown';
    if (!multiByCategory[catSlug]) multiByCategory[catSlug] = { total: 0, multi: 0 };
    multiByCategory[catSlug].total++;

    const storeIds = new Set<string>();
    const storeSlugs = new Set<string>();
    for (const v of p.product_variants || []) {
      for (const pr of v.prices || []) {
        storeIds.add(pr.store_id);
        if ((pr.stores as any)?.slug) storeSlugs.add((pr.stores as any).slug);
      }
    }

    const sc = storeIds.size;
    if (sc === 1) storeCountBuckets['1 store']++;
    else if (sc === 2) storeCountBuckets['2 stores']++;
    else if (sc === 3) storeCountBuckets['3 stores']++;
    else if (sc >= 4) storeCountBuckets['4+ stores']++;

    if (sc > 1) {
      totalMulti++;
      multiByCategory[catSlug].multi++;
      multiProductsList.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        brand: p.brands?.name || null,
        category: catSlug,
        storesCount: sc,
        stores: Array.from(storeSlugs),
      });
    }
  }

  console.log(`\n5. Multi-Store Products Coverage (Target: >= 75 / 822):`);
  console.log(`   Multi-Store Total : ${totalMulti} / ${prodCount} (${((totalMulti / (prodCount || 1)) * 100).toFixed(2)}%)`);
  console.log(`   Target Met        : ${totalMulti >= 75 ? '🎉 YES' : '❌ NO'}`);
  console.log(`\n   Store Count Distribution:`);
  for (const [k, v] of Object.entries(storeCountBuckets)) {
    console.log(`   - ${k.padEnd(10)}: ${v} products`);
  }

  console.log(`\n   Category Breakdown of Multi-Store Products:`);
  for (const [cat, counts] of Object.entries(multiByCategory)) {
    if (counts.multi > 0) {
      const pct = ((counts.multi / counts.total) * 100).toFixed(1);
      console.log(`   - ${cat.padEnd(22)}: ${counts.multi.toString().padStart(2)} / ${counts.total.toString().padStart(3)} (${pct}%)`);
    }
  }

  // Write audit json
  const report = {
    executedAt: new Date().toISOString(),
    catalog: { products: prodCount, variants: varCount, duplicatePairs: dupCount },
    enrichment: { totalBrands: brandCount, nullBrandId: nullBrandCount, nullCategoryId: nullCategoryCount },
    pricing: { activePrices: allPrices?.length, priceHistory: priceHistoryCount, freshness: storeFreshness },
    multiStore: { total: totalMulti, percentage: ((totalMulti / (prodCount || 1)) * 100).toFixed(2) + '%', distribution: storeCountBuckets, byCategory: multiByCategory },
    sampleMultiStoreProducts: multiProductsList.slice(0, 15),
  };
  fs.writeFileSync('scripts/audit_6u_results.json', JSON.stringify(report, null, 2));
  console.log('\nAudit report saved to scripts/audit_6u_results.json');
}

verify().catch(console.error);

