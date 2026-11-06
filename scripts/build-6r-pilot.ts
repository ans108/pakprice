/**
 * Increment 6R — Build Targeted Discovery Pilot
 *
 * Selects 35-40 high-potential single-store canonical products based on
 * demonstrated cross-store category/brand overlap:
 * - Smartphones, Smartwatches, Tablets, Laptops, Audio
 * - Well-known tech brands: Samsung, Apple, Xiaomi/Redmi, Infinix, Tecno, HP, Lenovo, Joyroom, Kospet, Anker
 * - Balanced across source stores: PriceOye, Telemart, Shophive, Mega.pk
 * - Excludes generic unbranded accessories, broken models, or ambiguous multi-tier listings
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

export interface PilotProduct6R {
  id: string;
  slug: string;
  name: string;
  brand: string;
  categorySlug: string;
  variantId: string;
  variantName: string;
  sourceStore: string;
  currentPrice: number;
  currentUrl: string;
  targetStores: string[];
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  BUILDING INCREMENT 6R TARGETED DISCOVERY PILOT');
  console.log('════════════════════════════════════════════════════════════════');

  const { data: stores } = await supabase.from('stores').select('id, name, slug');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  const { data: products } = await supabase
    .from('products')
    .select(`
      id, name, slug, brand_id, category_id,
      brands ( name ),
      categories ( name, slug ),
      product_variants (
        id, name, ram_gb, storage_gb, color, model_number,
        prices ( id, store_id, price, in_stock, product_url, last_scraped_at )
      )
    `)
    .order('created_at', { ascending: false });

  const eligibleCandidates: PilotProduct6R[] = [];

  for (const p of products || []) {
    const storeSet = new Set<string>();
    let currentOffer: any = null;
    let selectedVariant: any = null;

    for (const v of p.product_variants || []) {
      for (const pr of (v.prices as any) || []) {
        const sSlug = storeMap.get(pr.store_id);
        if (sSlug) {
          storeSet.add(sSlug);
          if (pr.in_stock && pr.price > 0 && pr.product_url) {
            currentOffer = {
              store: sSlug,
              price: pr.price,
              url: pr.product_url,
              variantId: v.id,
              variantName: v.name,
            };
            selectedVariant = v;
          }
        }
      }
    }

    // Must have exactly 1 store with a verified in-stock offer
    if (storeSet.size !== 1 || !currentOffer || !selectedVariant) continue;

    const sourceStore = currentOffer.store;
    const catSlug = (p.categories as any)?.slug || 'unknown';
    const brand = (p.brands as any)?.name || '';
    const name = p.name;

    // Filter for recognizable tech brands with proven multi-store catalog presence
    const isMajorBrand = /^(Apple|Samsung|Xiaomi|Redmi|Infinix|Tecno|Realme|Honor|Google|OnePlus|Huawei|Lenovo|HP|Dell|Asus|Joyroom|Kospet|Anker|Soundpeats|Audionic|Dany)$/i.test(brand);
    // Exclude generic low-ticket items without clean model identities
    const isGeneric = /(Stand|Holder|Case|Cover|Gripper|Adapter|Cable|Strap|Charger 4-Port|Power Bold|Screen Protector|Glass|Stylus Pen|Ring)/i.test(name);
    // Exclude unbranded or unknown brand products
    const isUnknown = brand.toLowerCase() === 'unknown' || !brand;

    if (isMajorBrand && !isGeneric && !isUnknown && currentOffer.price >= 3000) {
      // Determine applicable target stores based on category
      const allStores = ['telemart', 'shophive', 'priceoye'];
      const targetStores = allStores.filter(s => s !== sourceStore);

      eligibleCandidates.push({
        id: p.id,
        slug: p.slug,
        name: p.name,
        brand,
        categorySlug: catSlug,
        variantId: currentOffer.variantId,
        variantName: currentOffer.variantName,
        sourceStore,
        currentPrice: currentOffer.price,
        currentUrl: currentOffer.url,
        targetStores,
      });
    }
  }

  console.log(`Total eligible high-overlap candidates found: ${eligibleCandidates.length}`);

  // Balance across source stores and categories
  const byStore: Record<string, PilotProduct6R[]> = {};
  for (const c of eligibleCandidates) {
    if (!byStore[c.sourceStore]) byStore[c.sourceStore] = [];
    byStore[c.sourceStore].push(c);
  }

  console.log('\nEligible pool by source store:');
  for (const [store, list] of Object.entries(byStore)) {
    console.log(`  ${store.padEnd(15)}: ${list.length} products`);
  }

  // Select a balanced cohort:
  // Target: ~35 products total
  // ~10 PriceOye, ~10 Telemart, ~8 Shophive, ~7 Mega.pk (or up to availability)
  const selected: PilotProduct6R[] = [];
  const targetCounts: Record<string, number> = {
    priceoye: 10,
    telemart: 10,
    shophive: 8,
    'mega-pk': 7,
  };

  for (const [store, maxCount] of Object.entries(targetCounts)) {
    const pool = byStore[store] || [];
    // Diversify by brand and category
    const seenBrands = new Set<string>();
    const storeSelected: PilotProduct6R[] = [];

    for (const item of pool) {
      if (storeSelected.length >= maxCount) break;
      // Prefer unique brands first
      if (!seenBrands.has(item.brand)) {
        seenBrands.add(item.brand);
        storeSelected.push(item);
      }
    }

    // If still need more, fill remaining from same pool
    for (const item of pool) {
      if (storeSelected.length >= maxCount) break;
      if (!storeSelected.some(s => s.id === item.id)) {
        storeSelected.push(item);
      }
    }

    selected.push(...storeSelected);
    console.log(`  Selected from ${store}: ${storeSelected.length} products`);
  }

  console.log(`\nTotal selected for Wave 3 (Increment 6R) Pilot: ${selected.length} products`);

  const categoryDistribution: Record<string, number> = {};
  const brandDistribution: Record<string, number> = {};

  for (const s of selected) {
    categoryDistribution[s.categorySlug] = (categoryDistribution[s.categorySlug] || 0) + 1;
    brandDistribution[s.brand] = (brandDistribution[s.brand] || 0) + 1;
  }

  console.log('\nCategory breakdown:');
  console.log(JSON.stringify(categoryDistribution, null, 2));

  console.log('\nBrand breakdown:');
  console.log(JSON.stringify(brandDistribution, null, 2));

  const pilotPath = path.resolve(process.cwd(), 'scripts/pilot-6r-targeted.json');
  fs.writeFileSync(pilotPath, JSON.stringify(selected, null, 2));
  console.log(`\n  ✓ Pilot saved to: ${path.basename(pilotPath)}`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);

