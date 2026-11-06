import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function listCatalog() {
  const { data: stores } = await supabase.from('stores').select('id, slug');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  const { data: prods } = await supabase.from('products').select(`
    id, name, slug, brand_id, category_id,
    categories ( slug ),
    product_variants (
      id, name, model_number, ram_gb, storage_gb,
      prices ( store_id, price )
    )
  `);

  const categoryCounts: Record<string, number> = {};
  const mobileAndLaptopList: any[] = [];

  for (const p of prods || []) {
    const cat = (p.categories as any)?.slug || 'uncategorized';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

    const storesForProd = new Set<string>();
    for (const v of p.product_variants || []) {
      for (const pr of v.prices || []) {
        const sSlug = storeMap.get(pr.store_id);
        if (sSlug) storesForProd.add(sSlug);
      }
    }

    if (cat === 'mobiles' || cat === 'laptops') {
      mobileAndLaptopList.push({
        name: p.name,
        cat,
        stores: Array.from(storesForProd),
        variants: (p.product_variants || []).map(v => ({
          name: v.name,
          model: v.model_number,
          ram: v.ram_gb,
          storage: v.storage_gb,
        })),
      });
    }
  }

  console.log('Category Counts:', categoryCounts);
  console.log(`Total Mobiles & Laptops in DB: ${mobileAndLaptopList.length}`);
  console.log('\nSample items:');
  for (const s of mobileAndLaptopList.slice(0, 35)) {
    const vStr = s.variants.map((v: any) => `${v.ram || '?'}/${v.storage || '?'}GB`).join(', ');
    console.log(`- [${s.cat}] "${s.name}" (${s.stores.join(', ')}) [variants: ${vStr}]`);
  }
}

listCatalog().catch(console.error);
