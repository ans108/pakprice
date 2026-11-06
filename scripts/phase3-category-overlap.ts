import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const { data: stores } = await supabase.from('stores').select('id, name, slug');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  const { data: products } = await supabase
    .from('products')
    .select(`
      id, name, slug, brand_id, category_id,
      brands ( name ),
      categories ( name, slug ),
      product_variants (
        id, name,
        prices ( id, store_id, price, in_stock, product_url )
      )
    `);

  const categoryStats: Record<string, any> = {};

  for (const p of products || []) {
    const catSlug = (p.categories as any)?.slug || 'unknown';
    const catName = (p.categories as any)?.name || 'Unknown';

    if (!categoryStats[catSlug]) {
      categoryStats[catSlug] = {
        name: catName,
        totalProducts: 0,
        multiStore: 0,
        singleStore: 0,
        zeroStore: 0,
        stores: {},
        brands: {},
        singleStoreProducts: [],
      };
    }

    const c = categoryStats[catSlug];
    c.totalProducts++;

    const storeSet = new Set<string>();
    const pricesByStore: Record<string, any> = {};

    for (const v of p.product_variants || []) {
      for (const pr of (v.prices as any) || []) {
        const sSlug = storeMap.get(pr.store_id);
        if (sSlug) {
          storeSet.add(sSlug);
          c.stores[sSlug] = (c.stores[sSlug] || 0) + 1;
          pricesByStore[sSlug] = pr;
        }
      }
    }

    const brandName = (p.brands as any)?.name || 'Unknown';
    c.brands[brandName] = (c.brands[brandName] || 0) + 1;

    if (storeSet.size >= 2) {
      c.multiStore++;
    } else if (storeSet.size === 1) {
      c.singleStore++;
      const [sourceStore] = Array.from(storeSet);
      c.singleStoreProducts.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        brand: brandName,
        sourceStore,
        currentPrice: Object.values(pricesByStore)[0]?.price,
      });
    } else {
      c.zeroStore++;
    }
  }

  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PRODUCT CATEGORY OVERLAP ANALYSIS (Increment 6R Phase 3)');
  console.log('════════════════════════════════════════════════════════════════');

  for (const [slug, data] of Object.entries(categoryStats)) {
    console.log(`\nCategory: ${data.name} (${slug})`);
    console.log(`  Total canonicals : ${data.totalProducts}`);
    console.log(`  Multi-store (>=2): ${data.multiStore} (${((data.multiStore / data.totalProducts) * 100).toFixed(1)}%)`);
    console.log(`  Single-store (1) : ${data.singleStore}`);
    console.log(`  Store presence   : ${JSON.stringify(data.stores)}`);
    const topBrands = Object.entries(data.brands)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 6);
    console.log(`  Top brands       : ${topBrands.map(([b, cnt]) => `${b} (${cnt})`).join(', ')}`);
  }

  // Summary Matrix
  const singleStoreMatrix: Record<string, Record<string, number>> = {};
  for (const [slug, data] of Object.entries(categoryStats)) {
    singleStoreMatrix[slug] = {};
    for (const p of data.singleStoreProducts) {
      singleStoreMatrix[slug][p.sourceStore] = (singleStoreMatrix[slug][p.sourceStore] || 0) + 1;
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  SINGLE-STORE CANONICAL INVENTORY MATRIX (Category x Store)');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(JSON.stringify(singleStoreMatrix, null, 2));

  // High-Opportunity Discovery Pool
  // We want to find single-store products where the brand and category have strong overlap with other accessible stores (PriceOye, Telemart, Shophive)
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  HIGH-OPPORTUNITY CATEGORY / STORE COMBINATIONS');
  console.log('════════════════════════════════════════════════════════════════');

  // Smartphones, Smart Watches, Tablets, Laptops, Audio
  const targetCategories = ['mobiles', 'smart-watches', 'tablets', 'laptops', 'headphones-audio', 'computer-accessories'];
  const candidatesByStoreAndCat: Record<string, any[]> = {};

  for (const cat of targetCategories) {
    const data = categoryStats[cat];
    if (!data) continue;
    for (const p of data.singleStoreProducts) {
      const key = `${cat}::${p.sourceStore}`;
      if (!candidatesByStoreAndCat[key]) candidatesByStoreAndCat[key] = [];
      candidatesByStoreAndCat[key].push(p);
    }
  }

  for (const [k, list] of Object.entries(candidatesByStoreAndCat)) {
    console.log(`  ${k.padEnd(35)} : ${list.length} single-store products`);
  }
}

main().catch(console.error);

