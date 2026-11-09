import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  const { data: stores } = await supabase.from('stores').select('id, slug, name');
  const storeMap = new Map((stores || []).map(s => [s.id, s.slug]));

  const { data: prices } = await supabase
    .from('prices')
    .select('variant_id, store_id, price, product_variants!inner(id, product_id, ram_gb, storage_gb, color, model_number, products!inner(id, name, slug, brand_id, categories!inner(slug)))');

  const prodMap = new Map<string, {
    name: string;
    slug: string;
    cat: string;
    variantId: string;
    ram: any;
    storage: any;
    color: any;
    stores: Set<string>;
  }>();

  for (const p of (prices as any[]) || []) {
    const prod = p.product_variants?.products;
    if (!prod) continue;
    const storeSlug = storeMap.get(p.store_id) || p.store_id;

    if (!prodMap.has(prod.id)) {
      prodMap.set(prod.id, {
        name: prod.name,
        slug: prod.slug,
        cat: prod.categories?.slug || 'other',
        variantId: p.product_variants.id,
        ram: p.product_variants.ram_gb,
        storage: p.product_variants.storage_gb,
        color: p.product_variants.color,
        stores: new Set(),
      });
    }
    prodMap.get(prod.id)!.stores.add(storeSlug);
  }

  const twoStoreProds: any[] = [];
  const threeStoreProds: any[] = [];

  for (const p of prodMap.values()) {
    if (p.stores.size === 2) {
      twoStoreProds.push({ name: p.name, cat: p.cat, stores: Array.from(p.stores), ram: p.ram, storage: p.storage });
    } else if (p.stores.size === 3) {
      threeStoreProds.push({ name: p.name, cat: p.cat, stores: Array.from(p.stores) });
    }
  }

  console.log(`2-store products count: ${twoStoreProds.length}`);
  console.log('Sample 2-store products:');
  console.log(twoStoreProds.slice(0, 15));

  console.log(`\n3-store products count: ${threeStoreProds.length}`);
  console.log('Sample 3-store products:');
  console.log(threeStoreProds.slice(0, 10));
}

run().catch(console.error);

