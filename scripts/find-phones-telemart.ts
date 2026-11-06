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

async function findPhonesAndWatches() {
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

  const telemartPhonesAndWatches: any[] = [];

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

    if (hasTelemart && storeSet.size === 1) {
      const catSlug = (p.categories as any)?.slug || '';
      if (catSlug === 'mobiles' || catSlug === 'smart-watches' || catSlug === 'tablets') {
        telemartPhonesAndWatches.push({
          id: p.id,
          name: p.name,
          slug: p.slug,
          brand: (p.brands as any)?.name,
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

  console.log(`Telemart-only Mobiles/Smart-Watches/Tablets: ${telemartPhonesAndWatches.length}`);
  telemartPhonesAndWatches.slice(0, 15).forEach((p, idx) => {
    console.log(`${idx + 1}. [${p.brand || 'No Brand'}] ${p.name} (${p.category}) - Rs. ${p.variants[0]?.telemartPrice}`);
    console.log(`   Slug: ${p.slug}`);
    console.log(`   URL: ${p.variants[0]?.url}`);
  });
}

findPhonesAndWatches().catch(console.error);
