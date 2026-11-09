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
  const { data: stores } = await supabase.from('stores').select('id, slug');
  const storeMap = new Map((stores || []).map((s) => [s.id, s.slug]));
  const { data: prices } = await supabase
    .from('prices')
    .select('variant_id, store_id, product_variants!inner(product_id, products!inner(id, name, slug, brand_id, brands(name), categories!inner(slug)))');

  const prodMap = new Map<string, { id: string; name: string; brand: string; cat: string; stores: string[] }>();
  for (const p of prices || []) {
    const prod = (p as any).product_variants.products;
    if (!prodMap.has(prod.id)) {
      prodMap.set(prod.id, {
        id: prod.id,
        name: prod.name,
        brand: prod.brands?.name || '',
        cat: prod.categories?.slug || '',
        stores: [],
      });
    }
    prodMap.get(prod.id)!.stores.push(storeMap.get(p.store_id) || p.store_id);
  }

  const threeStore = Array.from(prodMap.values()).filter((p) => p.stores.length === 3);
  console.log(`Found ${threeStore.length} products with exactly 3 stores:`);
  threeStore.forEach((p) => {
    const missing: string[] = [];
    ['priceoye', 'telemart', 'shophive', 'ishopping'].forEach((s) => {
      if (!p.stores.includes(s)) missing.push(s);
    });
    console.log(`  "${p.name}" (${p.brand}) -> Stores: [${p.stores.join(', ')}] | Missing from 4-pack: [${missing.join(', ')}]`);
  });
}
run();

