import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function findTelemartOnly() {
  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  const { data: products } = await supabase.from('products').select(`
    id, name, slug, brand_id, category_id,
    brands ( name ),
    categories ( name, slug ),
    product_variants (
      id, name, ram_gb, storage_gb, color, model_number,
      prices ( id, store_id, price, in_stock, product_url, last_scraped_at )
    )
  `).order('created_at', { ascending: true });

  const telemartOnlyProducts: any[] = [];

  for (const p of products || []) {
    const storeSet = new Set<string>();
    let hasTelemart = false;
    let validPricesCount = 0;

    for (const v of p.product_variants || []) {
      for (const pr of v.prices || []) {
        const storeSlug = storeMap.get(pr.store_id);
        if (storeSlug) {
          storeSet.add(storeSlug);
          if (storeSlug === 'telemart') hasTelemart = true;
          validPricesCount++;
        }
      }
    }

    if (hasTelemart && storeSet.size === 1) {
      telemartOnlyProducts.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        brand: (p.brands as any)?.name,
        category: (p.categories as any)?.name,
        categorySlug: (p.categories as any)?.slug,
        variantCount: (p.product_variants || []).length,
        variants: (p.product_variants || []).map(v => ({
          id: v.id,
          name: v.name,
          ram: v.ram_gb,
          storage: v.storage_gb,
          color: v.color,
          model: v.model_number,
          telemartPrice: v.prices?.[0]?.price,
          url: v.prices?.[0]?.product_url,
        })),
      });
    }
  }

  console.log(`Total canonical products in DB: ${(products || []).length}`);
  console.log(`Telemart-only canonical products: ${telemartOnlyProducts.length}`);
  console.log('\nTop 20 Telemart-only products for Pilot Backfill:');
  const pilot = telemartOnlyProducts.slice(0, 20);
  pilot.forEach((p, idx) => {
    console.log(`${idx + 1}. [${p.brand || 'No Brand'}] ${p.name} (${p.category || 'No Cat'}) - Variants: ${p.variantCount}, Telemart Rs. ${p.variants[0]?.telemartPrice}`);
    console.log(`   Slug: ${p.slug}`);
    console.log(`   Telemart URL: ${p.variants[0]?.url}`);
  });

  // Save the 20 pilot products to a JSON file for reference
  const fs = require('fs');
  fs.writeFileSync('scripts/pilot-20-telemart-products.json', JSON.stringify(pilot, null, 2));
  console.log('\nSaved pilot to scripts/pilot-20-telemart-products.json');
}

findTelemartOnly().catch(console.error);
