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

async function findTechTelemartOnly() {
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
  `).order('created_at', { ascending: false });

  const telemartOnlyTech: any[] = [];

  for (const p of products || []) {
    const storeSet = new Set<string>();
    let hasTelemart = false;

    for (const v of p.product_variants || []) {
      for (const pr of v.prices || []) {
        const storeSlug = storeMap.get(pr.store_id);
        if (storeSlug) {
          storeSet.add(storeSlug);
          if (storeSlug === 'telemart') hasTelemart = true;
        }
      }
    }

    // Only products that currently show ONLY Telemart
    if (hasTelemart && storeSet.size === 1) {
      const catSlug = (p.categories as any)?.slug || '';
      const brandName = (p.brands as any)?.name || '';
      const nameLower = p.name.toLowerCase();

      // Check if it's electronics/tech (phones, watches, laptops, tablets, earbuds)
      const isTech = ['mobiles', 'smart-watches', 'laptops', 'tablets', 'wireless-earbuds'].includes(catSlug) ||
        nameLower.includes('galaxy') || nameLower.includes('iphone') || nameLower.includes('watch') ||
        nameLower.includes('vivo') || nameLower.includes('oppo') || nameLower.includes('redmi') ||
        nameLower.includes('xiaomi') || nameLower.includes('honor') || nameLower.includes('infinix') ||
        nameLower.includes('realme') || nameLower.includes('macbook') || nameLower.includes('airpods');

      if (isTech) {
        telemartOnlyTech.push({
          id: p.id,
          name: p.name,
          slug: p.slug,
          brand: brandName,
          category: (p.categories as any)?.name,
          categorySlug: catSlug,
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
  }

  console.log(`Found ${telemartOnlyTech.length} Telemart-only Tech/Electronics products in catalog.`);
  console.log('\nTop 20 Telemart-only Electronics for Pilot:');
  const pilot = telemartOnlyTech.slice(0, 20);
  pilot.forEach((p, idx) => {
    console.log(`${idx + 1}. [${p.brand || 'No Brand'}] ${p.name} (${p.category || p.categorySlug}) - Rs. ${p.variants[0]?.telemartPrice}`);
    console.log(`   Slug: ${p.slug}`);
    console.log(`   URL: ${p.variants[0]?.url}`);
  });

  const fs = require('fs');
  fs.writeFileSync('scripts/pilot-20-telemart-electronics.json', JSON.stringify(pilot, null, 2));
  console.log('\nSaved pilot to scripts/pilot-20-telemart-electronics.json');
}

findTechTelemartOnly().catch(console.error);
