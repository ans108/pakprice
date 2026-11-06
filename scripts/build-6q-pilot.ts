/**
 * Phase 2 — Build Balanced Second-Wave Pilot (Increment 6Q)
 *
 * Selects up to 50 eligible single-store canonical products:
 * - Balanced across source stores: PriceOye, Telemart, Mega.pk, Shophive
 * - Balanced across categories: mobiles/smartphones, smart-watches, tablets, laptops, audio/powerbanks/accessories
 * - Records: canonical product ID, slug, title, brand, variant ID, category, source store, current price, target stores
 *
 * Saves to scripts/pilot-50-6q.json
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

interface CandidateProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  categorySlug: string;
  variantId: string;
  sourceStore: string;
  currentPrice: number;
  currentUrl: string;
  targetStores: string[];
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  PHASE 2 — BUILDING BALANCED SECOND-WAVE PILOT (Increment 6Q)');
  console.log('════════════════════════════════════════════════════════════════');

  // Load stores
  const { data: stores } = await supabase.from('stores').select('id, name, slug');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  // Load brands
  const { data: brands } = await supabase.from('brands').select('id, name');
  const brandMap = new Map((brands || []).map(b => [b.id, b.name]));

  // Load categories
  const { data: categories } = await supabase.from('categories').select('id, name, slug');
  const catMap = new Map((categories || []).map(c => [c.id, c.slug]));

  // Query all products with their variants, prices, and categories
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id, slug, name, brand_id, category_id,
      product_variants (
        id, name, sku,
        prices (
          id, store_id, price, in_stock, product_url
        )
      )
    `);

  if (error || !products) {
    console.error('Error fetching products:', error);
    process.exit(1);
  }

  // Filter products that have EXACTLY ONE store offer
  const singleStoreProducts: CandidateProduct[] = [];

  for (const p of products) {
    const storeOffers: Array<{ storeSlug: string; price: number; url: string; variantId: string }> = [];
    for (const v of p.product_variants || []) {
      for (const pr of (v.prices as any) || []) {
        const sSlug = storeMap.get(pr.store_id);
        if (sSlug) {
          storeOffers.push({
            storeSlug: sSlug,
            price: pr.price,
            url: pr.product_url,
            variantId: v.id,
          });
        }
      }
    }

    // Must have exactly 1 store offer
    const distinctStores = Array.from(new Set(storeOffers.map(o => o.storeSlug)));
    if (distinctStores.length === 1 && storeOffers.length === 1) {
      const offer = storeOffers[0];
      const catSlug = catMap.get(p.category_id) || 'unknown';

      // Define target stores: all other relevant secondary stores except source
      const allSecondary = ['telemart', 'shophive', 'priceoye', 'mega-pk'];
      const targetStores = allSecondary.filter(s => s !== offer.storeSlug);

      singleStoreProducts.push({
        id: p.id,
        slug: p.slug,
        name: p.name,
        brand: brandMap.get(p.brand_id) || 'Generic',
        categorySlug: catSlug,
        variantId: offer.variantId,
        sourceStore: offer.storeSlug,
        currentPrice: offer.price,
        currentUrl: offer.url,
        targetStores,
      });
    }
  }

  console.log(`Found ${singleStoreProducts.length} verified single-store products in catalog`);

  // Group by source store
  const byStore: Record<string, CandidateProduct[]> = {};
  for (const p of singleStoreProducts) {
    if (!byStore[p.sourceStore]) byStore[p.sourceStore] = [];
    byStore[p.sourceStore].push(p);
  }

  for (const [s, list] of Object.entries(byStore)) {
    console.log(`  - ${s.padEnd(15)}: ${list.length} single-store products`);
  }

  // Desired quota for the 50 pilot products:
  // - Shophive: 15 products (all tech)
  // - Mega.pk : 13 products (laptops/audio/watches)
  // - Telemart: 11 products (mobiles/watches/audio)
  // - PriceOye: 11 products (mobiles/audio/watches)
  // Total = 50 products

  const selected: CandidateProduct[] = [];

  function pickBalanced(store: string, quota: number): CandidateProduct[] {
    const pool = byStore[store] || [];
    // Prioritize electronics/tech categories
    const techPool = pool.filter(p => 
      ['smart-watches', 'laptops', 'tablets', 'mobiles', 'audio', 'accessories', 'power-banks'].some(c => p.categorySlug.includes(c)) ||
      /watch|laptop|phone|tab|ipad|earbud|headphone|powerbank|buds|probook|thinkpad/i.test(p.name)
    );
    // Shuffle or spread across categories
    const categoriesMap: Record<string, CandidateProduct[]> = {};
    for (const p of techPool.length >= quota ? techPool : pool) {
      if (!categoriesMap[p.categorySlug]) categoriesMap[p.categorySlug] = [];
      categoriesMap[p.categorySlug].push(p);
    }

    const picks: CandidateProduct[] = [];
    const catKeys = Object.keys(categoriesMap);
    let idx = 0;
    while (picks.length < quota && picks.length < pool.length) {
      const cat = catKeys[idx % catKeys.length];
      const item = categoriesMap[cat]?.shift();
      if (item && !picks.some(x => x.id === item.id)) {
        picks.push(item);
      }
      idx++;
      if (catKeys.every(k => (categoriesMap[k] || []).length === 0)) break;
    }
    return picks;
  }

  selected.push(...pickBalanced('shophive', 14));
  selected.push(...pickBalanced('mega-pk', 12));
  selected.push(...pickBalanced('telemart', 12));
  selected.push(...pickBalanced('priceoye', 12));

  console.log(`\nSelected ${selected.length} pilot products for Wave 2`);

  // Report distribution
  const selByStore: Record<string, number> = {};
  const selByCat: Record<string, number> = {};
  for (const p of selected) {
    selByStore[p.sourceStore] = (selByStore[p.sourceStore] || 0) + 1;
    selByCat[p.categorySlug] = (selByCat[p.categorySlug] || 0) + 1;
  }

  console.log('\nDistribution by Source Store:');
  for (const [s, c] of Object.entries(selByStore)) {
    console.log(`  ${s.padEnd(15)} : ${c}`);
  }

  console.log('\nDistribution by Category:');
  for (const [cat, c] of Object.entries(selByCat)) {
    console.log(`  ${cat.padEnd(20)} : ${c}`);
  }

  // Save to pilot file
  const outPath = path.resolve(process.cwd(), 'scripts/pilot-50-6q.json');
  fs.writeFileSync(outPath, JSON.stringify(selected, null, 2));
  console.log(`\n✓ Saved 50-product pilot to: ${outPath}`);
}

main().catch(console.error);
